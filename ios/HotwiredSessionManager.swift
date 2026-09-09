import Foundation
import WebKit

/// One session (and therefore one WKWebView) per handle, shared by every
/// HotwiredVisitableView that uses that handle.
final class HotwiredSessionManager {
  static let shared = HotwiredSessionManager()

  private var sessions: [String: HotwiredSession] = [:]
  private var lifecycleObserver: AppLifecycleObserver?

  private init() {
    lifecycleObserver = AppLifecycleObserver(delegate: self)
  }

  var handles: [String] {
    Array(sessions.keys)
  }

  func session(for handle: String) -> HotwiredSession? {
    sessions[handle]
  }

  // A proposal carries the visit's options, and after a form submission that includes the
  // redirect's response, status and HTML. Upstream visits the new screen with those, so
  // the page is not fetched again and a flash set on the redirect renders. The proposal
  // reaches JS as a URL and the screen it opens may be on another session, a modal's form
  // redirecting into a tab, so the options wait here, across sessions, for the view that
  // visits that URL. The visit handler discards them when the app drops a proposal, and
  // they expire regardless, in case an app routing proposals itself drops one silently.
  private var proposedVisitOptions: [URL: (options: VisitOptions, at: Date)] = [:]

  func storeProposedVisitOptions(_ options: VisitOptions, for url: URL) {
    proposedVisitOptions[url] = (options, Date())
  }

  func takeProposedVisitOptions(for url: URL) -> VisitOptions? {
    guard let entry = proposedVisitOptions.removeValue(forKey: url) else { return nil }
    return Date().timeIntervalSince(entry.at) < 3 ? entry.options : nil
  }

  /// The app dropped the proposal; nothing will visit it.
  func discardProposedVisitOptions(for url: URL) {
    proposedVisitOptions.removeValue(forKey: url)
  }

  func findOrCreateSession(handle: String, webViewConfiguration: WKWebViewConfiguration) -> HotwiredSession {
    if let session = sessions[handle] {
      return session
    }
    let session = HotwiredSession(handle: handle, webViewConfiguration: webViewConfiguration)
    sessions[handle] = session
    return session
  }
}

extension HotwiredSessionManager: AppLifecycleObserverDelegate {
  func appDidEnterBackground() {}

  /// Upstream's Navigator inspects its sessions on every foreground; here every session.
  func appWillEnterForeground() {
    sessions.values.forEach { $0.inspect() }
  }
}
