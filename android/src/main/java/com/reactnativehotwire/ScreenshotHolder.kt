package com.reactnativehotwire

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.graphics.Bitmap
import android.graphics.Rect
import android.os.Handler
import android.os.Looper
import android.view.PixelCopy
import android.view.View
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume

/**
 * Port of Hotwire Native's HotwireViewScreenshotHolder. Captures the page before the
 * shared WebView moves to another screen so the old screen keeps showing it.
 */
class ScreenshotHolder {
  private var bitmap: Bitmap? = null
  private var screenshotOrientation = 0
  private var screenshotZoomed = false
  var currentlyZoomed = false

  fun reset() {
    bitmap = null
    screenshotOrientation = 0
    screenshotZoomed = false
  }

  fun showScreenshotIfAvailable(view: HotwiredView) {
    if (screenshotOrientation == view.currentOrientation() && screenshotZoomed == currentlyZoomed) {
      bitmap?.let { view.addScreenshot(it) }
    }
  }

  suspend fun captureScreenshot(view: HotwiredView) {
    bitmap = copyViewToBitmap(view)
    screenshotOrientation = view.currentOrientation()
    screenshotZoomed = currentlyZoomed
  }

  private suspend fun copyViewToBitmap(view: HotwiredView): Bitmap? {
    return suspendCancellableCoroutine { continuation ->
      val window = view.activity?.window

      if (window == null || !view.isLaidOut || !hasEnoughMemoryForScreenshot() ||
        view.width <= 0 || view.height <= 0
      ) {
        if (continuation.isActive) continuation.resume(null)
        return@suspendCancellableCoroutine
      }

      val rect = Rect()
      view.getGlobalVisibleRect(rect)
      val bitmap = Bitmap.createBitmap(rect.width(), rect.height(), Bitmap.Config.ARGB_8888)

      try {
        PixelCopy.request(
          window, rect, bitmap,
          { result ->
            if (continuation.isActive) {
              continuation.resume(if (result == PixelCopy.SUCCESS) bitmap else null)
            }
          },
          Handler(Looper.getMainLooper())
        )
      } catch (exception: Exception) {
        if (continuation.isActive) continuation.resume(null)
      }
    }
  }

  private fun hasEnoughMemoryForScreenshot(): Boolean {
    val runtime = Runtime.getRuntime()
    val remaining = 1f - (runtime.totalMemory().toFloat() / runtime.maxMemory().toFloat())
    return remaining > .20
  }

  private val View.activity: Activity?
    get() {
      var context: Context? = context
      while (context is ContextWrapper) {
        if (context is Activity) return context
        context = context.baseContext
      }
      return null
    }
}
