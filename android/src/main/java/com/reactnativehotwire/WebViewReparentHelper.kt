package com.reactnativehotwire

import android.content.Context
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout

/**
 * When a fullScreenModal (react-native-screens) is dismissed, the Fragment animation may
 * remove the WebView from its parent's children without clearing the WebView's mParent.
 * In that state removeView() silently fails and addView() throws "already has a parent",
 * and mParent can't be cleared via reflection (hidden API).
 *
 * The protected attachViewToParent() overwrites mParent without checking it, so claim
 * the view here and remove it normally, leaving mParent null.
 */
class WebViewReparentHelper(context: Context) : FrameLayout(context) {

  fun clearGhostParent(child: View) {
    val params = child.layoutParams
      ?: ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)

    attachViewToParent(child, 0, params)
    removeView(child)
  }
}
