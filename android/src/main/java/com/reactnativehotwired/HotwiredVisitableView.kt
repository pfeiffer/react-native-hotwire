package com.reactnativehotwired

import android.content.Context
import android.view.MotionEvent
import android.view.View
import android.view.ViewConfiguration
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.WebView
import androidx.core.net.toUri
import androidx.core.view.isVisible
import androidx.lifecycle.findViewTreeLifecycleOwner
import androidx.lifecycle.lifecycleScope
import dev.hotwire.core.turbo.errors.VisitError
import dev.hotwire.core.turbo.visit.VisitOptions
import dev.hotwire.core.turbo.webview.HotwireWebView
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView
import kotlinx.coroutines.launch
import kotlin.math.abs

// Turbo 8 exposes session.refresh; older Turbo falls back to a replace visit.
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

  var progressViewOffset: ProgressViewOffsetRecord? = null
    set(value) {
      field = value
      value?.let { hotwiredView.webViewRefresh.setProgressViewOffset(it.scale, it.start, it.end) }
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
  private val onFormSubmissionStarted by EventDispatcher<Map<String, Any?>>()
  private val onFormSubmissionFinished by EventDispatcher<Map<String, Any?>>()
  private val onShowLoading by EventDispatcher<Map<String, Any?>>()
  private val onHideLoading by EventDispatcher<Map<String, Any?>>()
  private val onContentProcessDidTerminate by EventDispatcher<Map<String, Any?>>()

  // endregion

  // region State

  private var _session: HotwiredSession? = null
  private val session: HotwiredSession
    get() = _session ?: SessionManager.findOrCreateSession(appContext, sessionHandle, applicationNameForUserAgent)
      .also { _session = it }

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
  }

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
    val height = bottom - top
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
    captureScreenshot()
    (webView.parent as? ViewGroup)?.endViewTransition(webView)
    hotwiredView.detachWebView(webView) { forceLayout() }
  }

  private fun captureScreenshot() {
    lifecycleOwner?.lifecycleScope?.launch {
      screenshotHolder.captureScreenshot(hotwiredView)
      screenshotHolder.showScreenshotIfAvailable(hotwiredView)
    }
  }

  // endregion

  // region Scrolling and touch

  private fun updateWebViewConfiguration() {
    val webView = _session?.webView ?: return
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

  override fun reload(displayProgress: Boolean) {
    if (webView.url == null) return

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

  override fun didStartFormSubmission(url: String) {
    onFormSubmissionStarted(mapOf("url" to url))
  }

  override fun didFinishFormSubmission(url: String) {
    onFormSubmissionFinished(mapOf("url" to url))
  }

  override fun visitProposedToLocation(location: String, options: VisitOptions) {
    val currentUrl = webView.url
    if (currentUrl != null && currentUrl.toUri().host != location.toUri().host) {
      didOpenExternalUrl(location)
      return
    }
    onVisitProposal(mapOf("url" to location, "action" to options.action.name.lowercase()))
  }

  override fun visitProposedToCrossOriginRedirect(location: String) {
    onOpenExternalUrl(mapOf("url" to location))
  }

  override fun onRenderProcessGone() {
    onContentProcessDidTerminate(mapOf("url" to url))
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
    onLoad(mapOf("title" to webView.title, "url" to webView.url))
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
