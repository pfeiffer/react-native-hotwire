package com.reactnativehotwire

import android.content.Intent
import android.net.Uri
import android.os.Message
import android.webkit.JsResult
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebView
import expo.modules.kotlin.AppContext

/**
 * Routes window.open, file inputs and JavaScript dialogs from the shared WebView to the
 * view currently subscribed to the session.
 */
class HotwiredWebChromeClient(appContext: AppContext, private val session: HotwiredSession) : WebChromeClient() {

  private val fileChooserDelegate = FileChooserDelegate(
    context = appContext.reactContext ?: throw IllegalStateException("React context is not available"),
    currentActivity = { appContext.currentActivity },
  )

  private val subscriber: SessionSubscriber? get() = session.subscriber

  fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
    if (requestCode == INPUT_FILE_REQUEST_CODE) {
      fileChooserDelegate.onActivityResult(resultCode, data)
    }
  }

  // target="_blank" links: hand the URL to JS instead of opening a second WebView.
  override fun onCreateWindow(view: WebView?, isDialog: Boolean, isUserGesture: Boolean, resultMsg: Message?): Boolean {
    val data = view?.hitTestResult?.extra ?: return false
    subscriber?.didOpenExternalUrl(Uri.parse(data).toString())
    return false
  }

  override fun onShowFileChooser(
    webView: WebView,
    filePathCallback: ValueCallback<Array<Uri>>,
    fileChooserParams: FileChooserParams,
  ): Boolean {
    return fileChooserDelegate.onShowFileChooser(filePathCallback, fileChooserParams)
  }

  override fun onJsAlert(view: WebView?, url: String?, message: String?, result: JsResult?): Boolean {
    val subscriber = subscriber
    if (subscriber == null) {
      result?.confirm()
    } else {
      subscriber.handleAlert(message ?: "") { result?.confirm() }
    }
    return true
  }

  override fun onJsConfirm(view: WebView?, url: String?, message: String?, result: JsResult?): Boolean {
    val subscriber = subscriber
    if (subscriber == null) {
      result?.cancel()
    } else {
      subscriber.handleConfirm(message ?: "") { confirmed -> if (confirmed) result?.confirm() else result?.cancel() }
    }
    return true
  }
}
