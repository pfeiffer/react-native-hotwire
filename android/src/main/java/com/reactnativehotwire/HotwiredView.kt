package com.reactnativehotwire

import android.content.Context
import android.graphics.Bitmap
import android.graphics.drawable.ColorDrawable
import android.util.AttributeSet
import android.view.ViewGroup
import android.webkit.WebView
import android.widget.FrameLayout
import android.widget.ImageView
import androidx.core.view.isVisible
import androidx.core.view.updateLayoutParams
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout

/**
 * Port of Hotwire Native's HotwireView (navigation-fragments). Hosts the shared WebView
 * inside a pull-to-refresh container, shows a screenshot of the last page while the
 * WebView is elsewhere, and a pull-to-refresh error container.
 */
class HotwiredView @JvmOverloads constructor(
  context: Context,
  attrs: AttributeSet? = null,
  defStyleAttr: Int = 0,
) : FrameLayout(context, attrs, defStyleAttr) {

  val webViewRefresh: SwipeRefreshLayout get() = findViewById(R.id.hotwired_webview_container)
  val errorRefresh: SwipeRefreshLayout get() = findViewById(R.id.hotwired_error_refresh)
  private val errorContainer: ViewGroup get() = findViewById(R.id.hotwired_error_container)
  val screenshotView: ImageView get() = findViewById(R.id.hotwired_screenshot)

  fun attachWebView(webView: WebView, onAttachedToNewDestination: (Boolean) -> Unit) {
    if (webView.parent != null) {
      onAttachedToNewDestination(false)
      return
    }

    // Match the WebView background with its new parent
    (background as? ColorDrawable)?.let { webView.setBackgroundColor(it.color) }

    val container = webViewRefresh
    container.post {
      // The message queue is out of our control: make sure the view is still attached
      // and the WebView hasn't found a new parent in the meantime.
      if (isAttachedToWindow && webView.parent == null) {
        // The WebView must fill the container so the page viewport gets the container's height.
        webView.updateLayoutParams { height = LayoutParams.MATCH_PARENT }
        container.addView(webView)
        onAttachedToNewDestination(true)
      }
    }
  }

  fun detachWebView(webView: WebView, onDetached: () -> Unit) {
    val container = webViewRefresh
    // Already off-window (e.g. dismissing a sheet): posting would be ignored, so detach now.
    if (container.windowToken == null) {
      container.removeView(webView)
      onDetached()
    } else {
      container.post {
        container.removeView(webView)
        onDetached()
      }
    }
  }

  fun addScreenshot(screenshot: Bitmap?) {
    if (screenshot == null) return
    screenshotView.setImageBitmap(screenshot)
    screenshotView.isVisible = true
  }

  fun removeScreenshot() {
    screenshotView.setImageBitmap(null)
    screenshotView.isVisible = false
  }

  fun removeErrorView() {
    errorContainer.removeAllViews()
    errorContainer.isVisible = false
    errorRefresh.apply {
      isVisible = false
      isEnabled = false
      isRefreshing = false
    }
  }

  fun currentOrientation(): Int = context.resources.configuration.orientation
}
