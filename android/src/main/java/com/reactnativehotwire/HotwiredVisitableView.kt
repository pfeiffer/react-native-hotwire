package com.reactnativehotwire

import android.content.Context
import android.view.MotionEvent
import android.view.View
import android.view.ViewConfiguration
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.WebView
import androidx.core.net.toUri
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.isVisible
import androidx.lifecycle.findViewTreeLifecycleOwner
import androidx.lifecycle.lifecycleScope
import dev.hotwire.core.config.Hotwire
import dev.hotwire.core.turbo.errors.VisitError
import dev.hotwire.core.turbo.visit.VisitOptions
import dev.hotwire.core.turbo.webview.HotwireWebView
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView
import kotlinx.coroutines.launch
import kotlin.math.abs
import kotlin.math.max
import org.json.JSONTokener

// Turbo 8 exposes session.refresh; older Turbo falls back to a replace visit.
// SwipeRefreshLayout's DEFAULT_CIRCLE_TARGET, which it keeps private.
private const val SPINNER_REST_DP = 64

private const val REFRESH_SCRIPT = """
typeof Turbo.session.refresh === 'function'
  ? Turbo.session.refresh(document.baseURI)
  : Turbo.visit(document.baseURI, { action: 'replace', shouldCacheSnapshot: false })
"""

/**
 * The native side of `VisitableView`. Borrows the session's shared WebView while on
 * screen, shows a screenshot of the last page while it is elsewhere, and reports the
 * session's events to JS.
 */
class HotwiredVisitableView(context: Context, appContext: AppContext) : ExpoView(context, appContext), SessionSubscriber {

  // region Props

  private var _url: String? = null
  var url: String
    get() = _url ?: throw IllegalStateException("url was read before being set")
    set(value) {
      val changedAfterFirstVisit = _url != null && _url != value
      _url = value
      if (changedAfterFirstVisit) visit()
    }

  var sessionHandle: String = "Default"
  var applicationNameForUserAgent: String? = null

  var scrollEnabled: Boolean = true
    set(value) {
      field = value
      updateWebViewConfiguration()
    }

  var pullToRefreshEnabled: Boolean = true
    set(value) {
      field = value
      setPullToRefresh(value)
    }

  /**
   * Chrome over the top of the view, in dp; see NativeVisitableViewProps. The refresh
   * spinners rest at SwipeRefreshLayout's default distance below it instead of below the
   * view's own edge, where a floating header would cover them.
   */
  var topInset: Double = 0.0
    set(value) {
      field = value
      val top = (value * resources.displayMetrics.density).toInt()
      val end = (SPINNER_REST_DP * resources.displayMetrics.density).toInt()
      listOf(hotwiredView.webViewRefresh, hotwiredView.errorRefresh).forEach {
        it.setProgressViewOffset(false, top - it.progressCircleDiameter, top + end)
      }
    }

  var webViewDebuggingEnabled: Boolean = false
    set(value) {
      field = value
      WebView.setWebContentsDebuggingEnabled(value)
    }

  // endregion

  // region Events

  private val onLoad by EventDispatcher<Map<String, Any?>>()
  private val onMessage by EventDispatcher<Map<String, Any?>>()
  private val onError by EventDispatcher<Map<String, Any?>>()
  private val onVisitProposal by EventDispatcher<Map<String, Any?>>()
  private val onWebAlert by EventDispatcher<Map<String, Any?>>()
  private val onWebConfirm by EventDispatcher<Map<String, Any?>>()
  private val onOpenExternalUrl by EventDispatcher<Map<String, Any?>>()
  private val onCrossOriginRedirect by EventDispatcher<Map<String, Any?>>()
  private val onFormSubmissionStart by EventDispatcher<Map<String, Any?>>()
  private val onFormSubmissionEnd by EventDispatcher<Map<String, Any?>>()
  private val onScroll by EventDispatcher<Map<String, Any?>>()
  private val onShowLoading by EventDispatcher<Map<String, Any?>>()
  private val onHideLoading by EventDispatcher<Map<String, Any?>>()
  private val onContentProcessDidTerminate by EventDispatcher<Map<String, Any?>>()

  // endregion

  // region State

  private var _session: HotwiredSession? = null
  private val session: HotwiredSession
    get() = _session?.takeUnless { it.isRenderProcessGone }
      ?: SessionManager.findOrCreateSession(appContext, sessionHandle, applicationNameForUserAgent)
        .also { _session = it }

  /** Whether the session's WebView currently sits in this view. */
  private val holdsWebView: Boolean
    get() = _session?.webView?.parent === hotwiredView.webViewRefresh

  private val webView: HotwireWebView get() = session.webView

  private var alertCallback: (() -> Unit)? = null
  private var confirmCallback: ((Boolean) -> Unit)? = null

  private var isInitialVisit = true
  private var isWebViewAttachedToNewDestination = false
  private val screenshotHolder = ScreenshotHolder()

  private val touchSlop = ViewConfiguration.get(context).scaledTouchSlop
  private var gestureStartX = 0f
  private var gestureStartY = 0f
  private var axisLocked = false

  private val hotwiredView: HotwiredView =
    View.inflate(context, R.layout.hotwired_visitable_view, null) as HotwiredView
  private val lifecycleOwner get() = hotwiredView.findViewTreeLifecycleOwner()

  // endregion

  init {
    addView(hotwiredView)
    hotwiredView.webViewRefresh.setOnRefreshListener { reload(displayProgress = true) }
    hotwiredView.errorRefresh.setOnRefreshListener { reload(displayProgress = true) }
    screenshotHolder.reset()
    observeKeyboard()
  }

  // region Keyboard
  // Edge-to-edge Android no longer resizes the window for the keyboard (adjustResize is
  // ignored from target SDK 35), so a page stays as tall as the screen with the keyboard
  // drawn over it: nothing to scroll, and the focused field stays hidden. Give up the covered
  // part instead, as upstream's applyDefaultImeWindowInsets does on its root view. The
  // overlap is measured from this view's own bottom rather than taken as the keyboard's
  // height: a pager page or a view above a padded bottom edge stops short of the window,
  // and only what the keyboard covers of this view is this view's to give up. Applied once
  // per keyboard change, from the final insets Android dispatches as the animation starts:
  // relaying out a WebView on every animation frame makes the page flash.

  private var keyboardInset = 0

  private fun observeKeyboard() {
    ViewCompat.setOnApplyWindowInsetsListener(this) { _, insets ->
      applyKeyboardInset(insets)
      insets
    }
  }

  private fun applyKeyboardInset(insets: WindowInsetsCompat) {
    val keyboard = insets.getInsets(WindowInsetsCompat.Type.ime()).bottom
    val location = IntArray(2).also { getLocationInWindow(it) }
    val gapBelow = max(0, rootView.height - (location[1] + height))
    val inset = max(0, keyboard - gapBelow)
    if (inset != keyboardInset) {
      keyboardInset = inset
      requestLayout()
    }
  }

  // endregion

  // region Layout
  // React Native lays out only the views it created; this native child needs a manual
  // pass, and a posted one after requestLayout (facebook/react-native#17968).

  override fun requestLayout() {
    super.requestLayout()
    post(measureAndLayout)
  }

  private val measureAndLayout = Runnable {
    if (isAttachedToWindow) {
      measure(
        MeasureSpec.makeMeasureSpec(width, MeasureSpec.EXACTLY),
        MeasureSpec.makeMeasureSpec(height, MeasureSpec.EXACTLY),
      )
      layout(left, top, right, bottom)
    }
  }

  override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) {
    super.onLayout(changed, left, top, right, bottom)
    val width = right - left
    // The content ends where the keyboard begins; see `keyboardInset`.
    val height = max(0, bottom - top - keyboardInset)
    hotwiredView.measure(
      MeasureSpec.makeMeasureSpec(width, MeasureSpec.EXACTLY),
      MeasureSpec.makeMeasureSpec(height, MeasureSpec.EXACTLY),
    )
    hotwiredView.layout(0, 0, width, height)
  }

  // endregion

  // region Attaching the shared WebView

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    session.registerSubscriber(this)
    visit()
  }

  override fun onDetachedFromWindow() {
    // Leaving for a screen that started no visit of its own, a native screen or another
    // session's page, so Turbo has not cached this page; cache it for the restore visit on
    // return. Upstream does the same in onDestroyView. A page popped off a stack fails the
    // location check: the revealed page's restore visit is already the current one.
    _session?.let { active ->
      if (holdsWebView && active.currentVisit?.location == _url) active.cacheSnapshot()
    }
    super.onDetachedFromWindow()
  }

  private fun visit() {
    attachWebView { attachedToNewDestination ->
      isWebViewAttachedToNewDestination = attachedToNewDestination

      // The WebView is shared between screens, so rebind our touch listener.
      updateWebViewConfiguration()

      if (attachedToNewDestination) {
        val restored = !isInitialVisit &&
          session.currentVisit?.destinationIdentifier == url.hashCode() &&
          session.restoreCurrentVisit()

        if (!restored) {
          showProgressView()
          performVisit(restoreWithCachedSnapshot = !isInitialVisit, reload = false)
          isInitialVisit = false
        }
      }
    }
  }

  private fun performVisit(restoreWithCachedSnapshot: Boolean, reload: Boolean) {
    session.visit(url, restoreWithCachedSnapshot, reload, lifecycleOwner)
  }

  private fun attachWebView(onReady: (Boolean) -> Unit) {
    // The view holding the WebView stays mounted underneath a pushed screen and gets it
    // back on pop. It screenshots itself first, so the return shows the page as it was
    // until the restore visit renders, instead of the loading overlay: what upstream's
    // covered fragment does in onStop.
    val holder = webView.parent?.parent?.parent as? HotwiredVisitableView
    // Back on the window with the WebView still in place, a pop back to this screen:
    // nothing to move and nothing to restore, the page is live.
    if (holder === this) {
      onReady(false)
      return
    }
    if (holder != null && holder !== this) {
      holder.captureScreenshot { takeWebView(onReady) }
    } else {
      takeWebView(onReady)
    }
  }

  private fun takeWebView(onReady: (Boolean) -> Unit) {
    val webView = webView

    // detachWebView isn't always called before attachWebView, e.g. when one session
    // backs several bottom tabs. Take the WebView from its current parent first.
    (webView.parent as? ViewGroup)?.let { parent ->
      parent.endViewTransition(webView)
      parent.removeView(webView)

      // A dismissed fullScreenModal can leave a ghost parent that removeView() can't clear.
      if (webView.parent != null) {
        WebViewReparentHelper(context).clearGhostParent(webView)
      }
    }

    // Re-layout before attaching so page restorations get the right size.
    requestLayout()
    hotwiredView.attachWebView(webView, onReady)
  }

  override fun detachWebView() {
    // A view destroyed before it ever attached has no session; don't create one now.
    val active = _session ?: return
    val webView = active.webView
    active.unregisterSubscriber(this)
    // The screenshot stands in for the page while this view animates out; take it before
    // the WebView goes.
    captureScreenshot {
      (webView.parent as? ViewGroup)?.endViewTransition(webView)
      hotwiredView.detachWebView(webView) { forceLayout() }
    }
  }

  private fun captureScreenshot(then: () -> Unit = {}) {
    val scope = lifecycleOwner?.lifecycleScope ?: return then()
    scope.launch {
      screenshotHolder.captureScreenshot(hotwiredView)
      screenshotHolder.showScreenshotIfAvailable(hotwiredView)
      then()
    }
  }

  // endregion

  // region Scrolling and touch

  private fun updateWebViewConfiguration() {
    val webView = _session?.webView ?: return
    // The WebView is shared; the listener set last belongs to the view holding it.
    webView.setOnScrollChangeListener { _, x, y, _, _ ->
      if (holdsWebView) onScroll(scrollEvent(webView, x, y))
    }
    if (scrollEnabled) {
      webView.setOnTouchListener { _, event -> lockScrollAxis(event); false }
    } else {
      webView.setOnTouchListener { _, event -> event.action == MotionEvent.ACTION_MOVE }
    }
  }

  // Locks the gesture to one axis for its duration, like UIScrollView's directional lock,
  // so a horizontal pager can't take over a vertical scroll. Disallowing from hotwiredView
  // keeps the SwipeRefreshLayout below it able to intercept.
  private fun lockScrollAxis(event: MotionEvent) {
    when (event.actionMasked) {
      MotionEvent.ACTION_DOWN -> {
        gestureStartX = event.rawX
        gestureStartY = event.rawY
        axisLocked = false
      }
      MotionEvent.ACTION_MOVE -> {
        if (axisLocked) return
        val dx = abs(event.rawX - gestureStartX)
        val dy = abs(event.rawY - gestureStartY)
        if (dx < touchSlop && dy < touchSlop) return

        axisLocked = true
        if (dy > dx) hotwiredView.requestDisallowInterceptTouchEvent(true)
      }
      MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
        axisLocked = false
        hotwiredView.requestDisallowInterceptTouchEvent(false)
      }
    }
  }

  private fun setPullToRefresh(enabled: Boolean) {
    hotwiredView.webViewRefresh.isEnabled = enabled
  }

  // endregion

  // region Transitional views

  private fun showProgressView() {
    // The screenshot already covers the page.
    if (hotwiredView.screenshotView.isVisible) return
    onShowLoading(emptyMap())
  }

  private fun removeTransitionalViews() {
    hotwiredView.webViewRefresh.isRefreshing = false
    hotwiredView.errorRefresh.isRefreshing = false
    onHideLoading(emptyMap())
    hotwiredView.removeScreenshot()
    hotwiredView.removeErrorView()
  }

  // endregion

  // region Commands

  fun injectJavaScript(script: String) {
    _session?.webView?.evaluateJavascript(script, null)
  }

  fun sendAlertResult() {
    alertCallback?.invoke()
    alertCallback = null
  }

  fun sendConfirmResult(result: Boolean) {
    confirmCallback?.invoke(result)
    confirmCallback = null
  }

  // Also the Retry after a failed first load, when the WebView has no URL yet: a reload
  // visit resets the session and cold boots the view's URL again.
  override fun reload(displayProgress: Boolean) {
    if (displayProgress && !hotwiredView.webViewRefresh.isRefreshing) {
      hotwiredView.webViewRefresh.isRefreshing = true
    }
    isWebViewAttachedToNewDestination = false
    performVisit(restoreWithCachedSnapshot = false, reload = true)
  }

  override fun refresh() {
    webView.evaluateJavascript(REFRESH_SCRIPT, null)
  }

  // endregion

  // region SessionSubscriber

  override fun handleMessage(message: String) {
    onMessage(mapOf("message" to message))
  }

  override fun didOpenExternalUrl(url: String) {
    onOpenExternalUrl(mapOf("url" to url))
  }

  // React Native's ScrollView event, so what reads one reads this.
  private fun scrollEvent(webView: WebView, x: Int, y: Int): Map<String, Any?> {
    val density = resources.displayMetrics.density
    @Suppress("DEPRECATION")
    val contentHeight = webView.contentHeight * webView.scale / density
    return mapOf(
      "contentInset" to mapOf("top" to 0, "left" to 0, "bottom" to 0, "right" to 0),
      "contentOffset" to mapOf("x" to x / density, "y" to y / density),
      "contentSize" to mapOf("width" to webView.width / density, "height" to contentHeight),
      "layoutMeasurement" to mapOf("width" to webView.width / density, "height" to webView.height / density),
      "zoomScale" to 1,
    )
  }

  override fun didStartFormSubmission(url: String) {
    onFormSubmissionStart(mapOf("url" to url))
  }

  override fun didFinishFormSubmission(url: String) {
    onFormSubmissionEnd(mapOf("url" to url))
  }

  override fun visitProposedToLocation(location: String, options: VisitOptions) {
    val currentUrl = webView.url
    if (currentUrl != null && currentUrl.toUri().host != location.toUri().host) {
      didOpenExternalUrl(location)
      return
    }
    onVisitProposal(
      mapOf(
        "url" to location,
        "action" to options.action.name.lowercase(),
        "properties" to Hotwire.config.pathConfiguration.properties(location),
      )
    )
  }

  override fun visitProposedToCrossOriginRedirect(location: String) {
    onCrossOriginRedirect(mapOf("url" to location))
  }

  override fun onRenderProcessGone() {
    onContentProcessDidTerminate(mapOf("url" to url))
    // Android requires the dead WebView out of the hierarchy. The session is dead with it;
    // the next `session` read creates a fresh one, and revisiting cold-boots the page there,
    // as upstream does by re-routing the location on a new session.
    _session?.let { dead ->
      hotwiredView.webViewRefresh.removeView(dead.webView)
      dead.unregisterSubscriber(this)
    }
    _session = null
    if (isAttachedToWindow) {
      session.registerSubscriber(this)
      visit()
    }
  }

  override fun onZoomed(newScale: Float) {
    screenshotHolder.currentlyZoomed = true
    setPullToRefresh(false)
  }

  override fun onZoomReset(newScale: Float) {
    screenshotHolder.currentlyZoomed = false
    setPullToRefresh(pullToRefreshEnabled)
  }

  override fun visitRendered() {
    val loadedUrl = webView.url
    // From the document, not `webView.title`: the WebView updates that property after the
    // render message, so it can still name the previous page.
    webView.evaluateJavascript("document.title") { result ->
      // The result is a JSON literal: a quoted string, or null.
      val title = (JSONTokener(result).nextValue() as? String).orEmpty()
      onLoad(mapOf("title" to title, "url" to loadedUrl))
    }
    updateWebViewConfiguration()
    removeTransitionalViews()
  }

  override fun visitCompleted(completedOffline: Boolean) {
    CookieManager.getInstance().flush()
  }

  override fun visitLocationStarted(location: String) {
    if (isWebViewAttachedToNewDestination) showProgressView()
  }

  override fun handleAlert(message: String, callback: () -> Unit) {
    alertCallback = callback
    onWebAlert(mapOf("message" to message))
  }

  override fun handleConfirm(message: String, callback: (result: Boolean) -> Unit) {
    confirmCallback = callback
    onWebConfirm(mapOf("message" to message))
  }

  override fun onReceivedError(error: VisitError) = sendError(error)

  override fun requestFailedWithError(visitHasCachedSnapshot: Boolean, error: VisitError) = sendError(error)

  private fun sendError(error: VisitError) {
    onError(
      mapOf(
        "statusCode" to VisitErrors.statusCode(error),
        "url" to url,
        "description" to VisitErrors.description(error),
      )
    )
  }

  // endregion
}
