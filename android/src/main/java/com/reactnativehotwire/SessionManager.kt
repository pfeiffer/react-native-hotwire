package com.reactnativehotwire

import android.content.Intent
import android.os.SystemClock
import dev.hotwire.core.turbo.visit.VisitOptions
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

  // A proposal carries the visit's options, and after a form submission that includes the
  // redirect's response, status and HTML. Upstream visits the new screen with those, so
  // the page is not fetched again and a flash set on the redirect renders. The proposal
  // reaches JS as a URL and the screen it opens may be on another session, a modal's form
  // redirecting into a tab, so the options wait here, across sessions, for the view that
  // visits that URL. The visit handler discards them when the app drops a proposal, and
  // they expire regardless, in case an app routing proposals itself drops one silently.
  private val proposedVisitOptions = mutableMapOf<String, Pair<VisitOptions, Long>>()

  fun storeProposedVisitOptions(url: String, options: VisitOptions) {
    proposedVisitOptions[url] = options to SystemClock.elapsedRealtime()
  }

  fun takeProposedVisitOptions(url: String): VisitOptions? {
    val (options, at) = proposedVisitOptions.remove(url) ?: return null
    return if (SystemClock.elapsedRealtime() - at < 3_000) options else null
  }

  /** The app dropped the proposal; nothing will visit it. */
  fun discardProposedVisitOptions(url: String) {
    proposedVisitOptions.remove(url)
  }

  fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
    sessions.values.forEach { it.onActivityResult(requestCode, resultCode, data) }
  }
}
