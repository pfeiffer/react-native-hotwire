package com.reactnativehotwire

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Message
import android.webkit.JsResult
import android.webkit.PermissionRequest
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebView
import androidx.core.content.ContextCompat
import com.facebook.react.modules.core.PermissionAwareActivity
import expo.modules.kotlin.AppContext

private const val WEB_PERMISSION_REQUEST_CODE = 3

/**
 * Routes window.open, file inputs, media permission requests and JavaScript dialogs from
 * the shared WebView to the view currently subscribed to the session.
 */
class HotwiredWebChromeClient(private val appContext: AppContext, private val session: HotwiredSession) : WebChromeClient() {

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

  // getUserMedia: the page asks for the camera or microphone. Each resource needs manifest
  // permissions the app must declare; the dangerous ones are asked for at runtime, as
  // upstream's WebViewPermissionDelegate does, and the request is answered with the result.
  override fun onPermissionRequest(request: PermissionRequest) {
    val resources = request.resources?.toList().orEmpty()
    val required = resources.flatMap { resource ->
      when (resource) {
        PermissionRequest.RESOURCE_VIDEO_CAPTURE -> listOf(Manifest.permission.CAMERA)
        PermissionRequest.RESOURCE_AUDIO_CAPTURE -> listOf(Manifest.permission.RECORD_AUDIO, Manifest.permission.MODIFY_AUDIO_SETTINGS)
        else -> return request.deny()
      }
    }.distinct()
    val context = appContext.reactContext ?: return request.deny()
    if (required.any { !isDeclared(context.packageName, it) }) return request.deny()

    val runtime = listOf(Manifest.permission.CAMERA, Manifest.permission.RECORD_AUDIO)
    val missing = required.filter { it in runtime && ContextCompat.checkSelfPermission(context, it) != PackageManager.PERMISSION_GRANTED }
    if (missing.isEmpty()) return request.grant(resources.toTypedArray())

    val activity = appContext.currentActivity as? PermissionAwareActivity ?: return request.deny()
    activity.requestPermissions(missing.toTypedArray(), WEB_PERMISSION_REQUEST_CODE) { code, _, results ->
      if (code == WEB_PERMISSION_REQUEST_CODE) {
        if (results.isNotEmpty() && results.all { it == PackageManager.PERMISSION_GRANTED }) {
          request.grant(resources.toTypedArray())
        } else {
          request.deny()
        }
      }
      code == WEB_PERMISSION_REQUEST_CODE
    }
  }

  private fun isDeclared(packageName: String, permission: String): Boolean {
    val context = appContext.reactContext ?: return false
    val info = context.packageManager.getPackageInfo(packageName, PackageManager.GET_PERMISSIONS)
    return info.requestedPermissions?.contains(permission) == true
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
