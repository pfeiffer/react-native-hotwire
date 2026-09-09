package com.reactnativehotwired

import android.content.Intent
import android.webkit.HttpAuthHandler
import android.webkit.JavascriptInterface
import android.webkit.WebSettings
import androidx.activity.result.ActivityResultLauncher
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.whenStateAtLeast
import dev.hotwire.core.config.Hotwire
import dev.hotwire.core.turbo.errors.VisitError
import dev.hotwire.core.turbo.session.Session
import dev.hotwire.core.turbo.session.SessionCallback
import dev.hotwire.core.turbo.visit.Visit
import dev.hotwire.core.turbo.visit.VisitAction
import dev.hotwire.core.turbo.visit.VisitDestination
import dev.hotwire.core.turbo.visit.VisitOptions
import dev.hotwire.core.turbo.webview.HotwireWebView
import expo.modules.kotlin.AppContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** What a session needs from the view currently showing its WebView. */
interface SessionSubscriber {
  fun detachWebView()
  fun handleMessage(message: String)
  fun didOpenExternalUrl(url: String)
  fun didStartFormSubmission(url: String)
  fun didFinishFormSubmission(url: String)
  fun handleAlert(message: String, callback: () -> Unit)
  fun handleConfirm(message: String, callback: (result: Boolean) -> Unit)
  fun reload(displayProgress: Boolean)
  fun refresh()
  fun onReceivedError(error: VisitError)
  fun requestFailedWithError(visitHasCachedSnapshot: Boolean, error: VisitError)
  fun onRenderProcessGone()
  fun onZoomed(newScale: Float)
  fun onZoomReset(newScale: Float)
  fun visitCompleted(completedOffline: Boolean)
  fun visitLocationStarted(location: String)
  fun visitProposedToCrossOriginRedirect(location: String)
  fun visitProposedToLocation(location: String, options: VisitOptions)
  fun visitRendered()
}

/**
 * Wraps a Hotwire `Session` and its WebView. Hotwire assumes a Fragment-based
 * destination per visit; here the "destination" is always active because React
 * Navigation decides what is on screen, and the current view registers itself as the
 * session's subscriber.
 */
class HotwiredSession(
  private val appContext: AppContext,
  val handle: String,
  applicationNameForUserAgent: String?,
) : SessionCallback, VisitDestination {

  var subscriber: SessionSubscriber? = null
    private set

  private val turboSession: Session
  private val chromeClient: HotwiredWebChromeClient
  val webView: HotwireWebView

  init {
    val activity = appContext.currentActivity as? AppCompatActivity
      ?: throw IllegalStateException("react-native-hotwired needs an AppCompatActivity")

    webView = HotwireWebView(activity, null)
    turboSession = Session(handle, activity, webView)
    chromeClient = HotwiredWebChromeClient(appContext, this)

    webView.settings.javaScriptEnabled = true
    webView.addJavascriptInterface(JavaScriptInterface(), "AndroidInterface")
    webView.settings.userAgentString = listOfNotNull(
      WebSettings.getDefaultUserAgent(webView.context),
      applicationNameForUserAgent,
    ).joinToString(" ")
    webView.webChromeClient = chromeClient
  }

  val currentVisit: Visit? get() = turboSession.currentVisit

  /** The WebView's render process died; the session is dead with it and must be replaced. */
  val isRenderProcessGone: Boolean get() = turboSession.isRenderProcessGone

  fun registerSubscriber(view: SessionSubscriber) {
    subscriber = view
  }

  /** Stops delivering events to a view that is going away, unless another already took over. */
  fun unregisterSubscriber(view: SessionSubscriber) {
    if (subscriber === view) subscriber = null
  }

  /** Asks Turbo to cache the current page's snapshot so a later restore visit can use it. */
  fun cacheSnapshot() {
    turboSession.cacheSnapshot()
  }

  fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
    chromeClient.onActivityResult(requestCode, resultCode, data)
  }

  fun visit(
    url: String,
    restoreWithCachedSnapshot: Boolean,
    reload: Boolean,
    lifecycleOwner: LifecycleOwner?,
  ) {
    val restore = restoreWithCachedSnapshot && !reload
    val options = if (restore) VisitOptions(action = VisitAction.RESTORE) else VisitOptions()

    lifecycleOwner?.lifecycleScope?.launch {
      val snapshot = when (options.action) {
        VisitAction.ADVANCE -> fetchCachedSnapshot(url)
        else -> null
      }

      lifecycleOwner.lifecycle.whenStateAtLeast(Lifecycle.State.STARTED) {
        turboSession.visit(
          Visit(
            location = url,
            destinationIdentifier = url.hashCode(),
            restoreWithCachedSnapshot = restoreWithCachedSnapshot,
            reload = reload,
            callback = this@HotwiredSession,
            options = options.copy(snapshotHTML = snapshot),
          )
        )
      }
    }
  }

  private suspend fun fetchCachedSnapshot(url: String): String? = withContext(Dispatchers.IO) {
    Hotwire.config.offlineRequestHandler?.getCachedSnapshot(url = url)?.data?.use { String(it.readBytes()) }
  }

  fun restoreCurrentVisit(): Boolean = turboSession.restoreCurrentVisit(callback = this)

  fun reload() {
    webView.post { subscriber?.reload(true) }
  }

  fun refresh() {
    webView.post { subscriber?.refresh() }
  }

  fun clearSnapshotCache() {
    // Hotwire Native Android has no API for this; ask Turbo directly.
    webView.post { webView.evaluateJavascript("window.Turbo.session.clearCache();", null) }
  }

  inner class JavaScriptInterface {
    @JavascriptInterface
    fun postMessage(message: String) {
      subscriber?.handleMessage(message)
    }
  }

  // region VisitDestination — always active, no launchers (file chooser is ours)

  override fun isActive(): Boolean = true
  override fun activityResultLauncher(requestCode: Int): ActivityResultLauncher<Intent>? = null
  override fun activityPermissionResultLauncher(requestCode: Int): ActivityResultLauncher<String>? = null

  // endregion

  // region SessionCallback

  override fun visitDestination(): VisitDestination = this
  override fun onPageStarted(location: String) {}
  override fun onPageFinished(location: String) {}
  override fun pageInvalidated() {}
  override fun onReceivedHttpAuthRequest(handler: HttpAuthHandler, host: String, realm: String) {}
  override fun onReceivedError(error: VisitError) { subscriber?.onReceivedError(error) }
  override fun onRenderProcessGone() { subscriber?.onRenderProcessGone() }
  override fun onZoomReset(newScale: Float) { subscriber?.onZoomReset(newScale) }
  override fun onZoomed(newScale: Float) { subscriber?.onZoomed(newScale) }
  override fun visitCompleted(completedOffline: Boolean) { subscriber?.visitCompleted(completedOffline) }
  override fun visitLocationStarted(location: String) { subscriber?.visitLocationStarted(location) }
  override fun visitProposedToCrossOriginRedirect(location: String) { subscriber?.visitProposedToCrossOriginRedirect(location) }
  override fun visitProposedToLocation(location: String, options: VisitOptions) { subscriber?.visitProposedToLocation(location, options) }
  override fun visitRendered() { subscriber?.visitRendered() }
  override fun visitRequestFinished() {}
  override fun formSubmissionStarted(location: String) { subscriber?.didStartFormSubmission(location) }
  override fun formSubmissionFinished(location: String) { subscriber?.didFinishFormSubmission(location) }
  override fun requestFailedWithError(visitHasCachedSnapshot: Boolean, error: VisitError) {
    subscriber?.requestFailedWithError(visitHasCachedSnapshot, error)
  }

  // endregion
}
