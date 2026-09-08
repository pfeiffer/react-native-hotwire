package com.reactnativehotwired

import android.content.Intent
import expo.modules.kotlin.AppContext

/** One session (and therefore one WebView) per handle, shared by every view using that handle. */
object SessionManager {
  private val sessions = mutableMapOf<String, HotwiredSession>()

  val handles: List<String> get() = sessions.keys.toList()

  fun session(handle: String): HotwiredSession? = sessions[handle]

  fun findOrCreateSession(appContext: AppContext, handle: String, applicationNameForUserAgent: String?): HotwiredSession =
    sessions.getOrPut(handle) { HotwiredSession(appContext, handle, applicationNameForUserAgent) }

  fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
    sessions.values.forEach { it.onActivityResult(requestCode, resultCode, data) }
  }
}
