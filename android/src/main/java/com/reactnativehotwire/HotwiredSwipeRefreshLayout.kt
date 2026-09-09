package com.reactnativehotwire

import android.content.Context
import android.util.AttributeSet
import androidx.core.view.children
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout
import dev.hotwire.core.turbo.webview.HotwireWebView

/**
 * Port of Hotwire Native's HotwireSwipeRefreshLayout. Hosts the shared WebView.
 */
class HotwiredSwipeRefreshLayout @JvmOverloads constructor(context: Context, attrs: AttributeSet? = null) :
  SwipeRefreshLayout(context, attrs) {

  init {
    // SwipeRefreshLayout's custom child drawing order assumes a stable child list. The
    // WebView is added and removed while the view is on screen, which can make
    // getChildDrawingOrder() return an index past the child count and crash in draw.
    // The WebView is the only child besides the spinner, so the order doesn't matter.
    isChildrenDrawingOrderEnabled = false
  }

  override fun canChildScrollUp(): Boolean {
    val webView = children.firstOrNull() as? HotwireWebView ?: return false
    return webView.scrollY > 0 || webView.elementTouchPreventsPullsToRefresh
  }
}
