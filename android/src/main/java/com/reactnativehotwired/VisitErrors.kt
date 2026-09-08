package com.reactnativehotwired

import android.webkit.WebViewClient
import dev.hotwire.core.turbo.errors.HttpError
import dev.hotwire.core.turbo.errors.LoadError
import dev.hotwire.core.turbo.errors.VisitError
import dev.hotwire.core.turbo.errors.WebError
import dev.hotwire.core.turbo.errors.WebSslError

/** Maps Hotwire's error types onto the status codes shared with JS (see SystemStatusCode). */
object VisitErrors {
  private const val NETWORK_FAILURE = 0
  private const val TIMEOUT_FAILURE = -1
  private const val CONTENT_TYPE_MISMATCH = -2
  private const val PAGE_LOAD_FAILURE = -3
  private const val UNKNOWN = -4

  fun statusCode(error: VisitError): Int {
    val code = when (error) {
      is HttpError -> error.statusCode
      is WebError -> error.errorCode
      is WebSslError -> error.errorCode
      is LoadError -> CONTENT_TYPE_MISMATCH
      else -> NETWORK_FAILURE
    }

    return when (code) {
      WebViewClient.ERROR_CONNECT -> NETWORK_FAILURE
      WebViewClient.ERROR_TIMEOUT -> TIMEOUT_FAILURE
      // Hotwire reports ERROR_UNKNOWN for SSL errors and turboFailedToLoad
      WebViewClient.ERROR_UNKNOWN -> PAGE_LOAD_FAILURE
      else -> if (code > 0) code else UNKNOWN
    }
  }

  fun description(error: VisitError): String {
    val code = statusCode(error)
    return when {
      code == NETWORK_FAILURE -> "A network error occurred."
      code == TIMEOUT_FAILURE -> "A network timeout occurred."
      code == CONTENT_TYPE_MISMATCH -> "The server returned an invalid content type."
      code == PAGE_LOAD_FAILURE -> "The page could not be loaded due to a configuration error."
      code > 0 -> "There was an HTTP Error ($code)."
      else -> "An error occurred."
    }
  }
}
