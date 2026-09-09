package com.reactnativehotwired

import android.content.Intent
import expo.modules.kotlin.AppContext

/** One session (and therefore one WebView) per handle, shared by every view using that handle. */
object SessionManager {
  private val sessions = mutableMapOf<String, HotwiredSession>()

  val handles: List<String> get() = sessions.keys.toList()

  fun session(handle: String): HotwiredSession? = sessions[handle]

  /**
   * A session whose render process died is replaced, WebView and all, the way upstream's
   * Navigator creates a new session when a destination finds `isRenderProcessGone`.
   */
  fun findOrCreateSession(appContext: AppContext, handle: String, applicationNameForUserAgent: String?): HotwiredSession =
    sessions[handle]?.takeUnless { it.isRenderProcessGone }
      ?: HotwiredSession(appContext, handle, applicationNameForUserAgent).also { sessions[handle] = it }

  fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
    sessions.values.forEach { it.onActivityResult(requestCode, resultCode, data) }
  }
}
