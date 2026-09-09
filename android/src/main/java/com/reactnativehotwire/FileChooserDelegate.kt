package com.reactnativehotwire

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Parcelable
import android.provider.MediaStore
import android.webkit.MimeTypeMap
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import java.io.File
import java.io.IOException

const val INPUT_FILE_REQUEST_CODE = 1

/**
 * Handles <input type="file"> by offering the camera (when the app holds the permission)
 * alongside the system document picker. Based on react-native-webview's RNCWebViewModuleImpl.
 */
class FileChooserDelegate(private val context: Context, private val currentActivity: () -> Activity?) {
  private var filePathCallback: ValueCallback<Array<Uri>>? = null
  private var outputImage: File? = null
  private var outputVideo: File? = null

  private enum class MimeType(val value: String) {
    DEFAULT("*/*"), IMAGE("image"), VIDEO("video")
  }

  fun onShowFileChooser(
    filePathCallback: ValueCallback<Array<Uri>>,
    fileChooserParams: WebChromeClient.FileChooserParams,
  ): Boolean {
    val activity = currentActivity() ?: return false
    val acceptTypes = fileChooserParams.acceptTypes
    val allowMultiple = fileChooserParams.mode == WebChromeClient.FileChooserParams.MODE_OPEN_MULTIPLE

    this.filePathCallback = filePathCallback

    val extraIntents = ArrayList<Parcelable>()
    if (!needsCameraPermission(activity)) {
      if (acceptsImages(acceptTypes)) photoIntent()?.let { extraIntents.add(it) }
      if (acceptsVideo(acceptTypes)) videoIntent()?.let { extraIntents.add(it) }
    }

    val chooserIntent = Intent(Intent.ACTION_CHOOSER).apply {
      putExtra(Intent.EXTRA_INTENT, fileChooserIntent(acceptTypes, allowMultiple))
      putExtra(Intent.EXTRA_INITIAL_INTENTS, extraIntents.toTypedArray())
    }
    activity.startActivityForResult(chooserIntent, INPUT_FILE_REQUEST_CODE)
    return true
  }

  fun onActivityResult(resultCode: Int, data: Intent?) {
    val callback = filePathCallback ?: return

    val imageTaken = (outputImage?.length() ?: 0) > 0
    val videoTaken = (outputVideo?.length() ?: 0) > 0

    // The camera activity doesn't return the file, so use the one we handed it.
    if (resultCode != Activity.RESULT_OK) {
      callback.onReceiveValue(null)
    } else if (imageTaken) {
      callback.onReceiveValue(arrayOf(outputUri(outputImage!!)))
    } else if (videoTaken) {
      callback.onReceiveValue(arrayOf(outputUri(outputVideo!!)))
    } else {
      callback.onReceiveValue(selectedFiles(data, resultCode))
    }

    if (!imageTaken) outputImage?.delete()
    if (!videoTaken) outputVideo?.delete()

    filePathCallback = null
    outputImage = null
    outputVideo = null
  }

  private fun needsCameraPermission(activity: Activity): Boolean {
    return try {
      val packageInfo = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        context.packageManager.getPackageInfo(
          context.packageName,
          PackageManager.PackageInfoFlags.of(PackageManager.GET_PERMISSIONS.toLong())
        )
      } else {
        @Suppress("DEPRECATION")
        context.packageManager.getPackageInfo(context.packageName, PackageManager.GET_PERMISSIONS)
      }
      val declaresCamera = packageInfo.requestedPermissions?.contains(Manifest.permission.CAMERA) == true

      declaresCamera &&
        ContextCompat.checkSelfPermission(activity, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED
    } catch (e: PackageManager.NameNotFoundException) {
      true
    }
  }

  private fun acceptedMimeTypes(types: Array<String>): Array<String> {
    // <input type="file"> without an accept attribute yields a single empty string.
    if (types.isEmpty() || (types.size == 1 && types[0].isEmpty())) {
      return arrayOf(MimeType.DEFAULT.value)
    }
    return types.map { type ->
      if (type.matches("\\.\\w+".toRegex())) {
        MimeTypeMap.getSingleton().getMimeTypeFromExtension(type.removePrefix(".")) ?: type
      } else {
        type
      }
    }.toTypedArray()
  }

  private fun acceptsImages(types: Array<String>) =
    acceptedMimeTypes(types).any { it.contains(MimeType.IMAGE.value) || it.contains(MimeType.DEFAULT.value) }

  private fun acceptsVideo(types: Array<String>) =
    acceptedMimeTypes(types).any { it.contains(MimeType.VIDEO.value) || it.contains(MimeType.DEFAULT.value) }

  private fun capturedFile(mimeType: MimeType): File {
    val (prefix, suffix) = when (mimeType) {
      MimeType.IMAGE -> "image-" to ".jpg"
      MimeType.VIDEO -> "video-" to ".mp4"
      MimeType.DEFAULT -> "file-" to ""
    }
    return File.createTempFile(prefix, suffix, context.getExternalFilesDir(null))
  }

  private fun outputUri(file: File): Uri =
    FileProvider.getUriForFile(context, "${context.packageName}.hotwired.fileprovider", file)

  private fun photoIntent(): Intent? = captureIntent(MimeType.IMAGE, MediaStore.ACTION_IMAGE_CAPTURE) { outputImage = it }

  private fun videoIntent(): Intent? = captureIntent(MimeType.VIDEO, MediaStore.ACTION_VIDEO_CAPTURE) { outputVideo = it }

  private fun captureIntent(mimeType: MimeType, action: String, store: (File) -> Unit): Intent? {
    return try {
      val file = capturedFile(mimeType)
      store(file)
      Intent(action).putExtra(MediaStore.EXTRA_OUTPUT, outputUri(file))
    } catch (e: IOException) {
      null
    } catch (e: IllegalArgumentException) {
      null
    }
  }

  private fun fileChooserIntent(acceptTypes: Array<String>, allowMultiple: Boolean): Intent {
    return Intent(Intent.ACTION_GET_CONTENT).apply {
      addCategory(Intent.CATEGORY_OPENABLE)
      type = MimeType.DEFAULT.value
      putExtra(Intent.EXTRA_MIME_TYPES, acceptedMimeTypes(acceptTypes))
      putExtra(Intent.EXTRA_ALLOW_MULTIPLE, allowMultiple)
    }
  }

  private fun selectedFiles(data: Intent?, resultCode: Int): Array<Uri>? {
    if (data == null) return null

    data.clipData?.let { clip ->
      return (0 until clip.itemCount).map { clip.getItemAt(it).uri }.toTypedArray()
    }

    return if (data.data != null && resultCode == Activity.RESULT_OK) {
      WebChromeClient.FileChooserParams.parseResult(resultCode, data)
    } else {
      null
    }
  }
}
