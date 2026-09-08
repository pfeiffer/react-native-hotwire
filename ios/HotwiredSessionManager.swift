import Foundation
import WebKit

/// One session (and therefore one WKWebView) per handle, shared by every
/// HotwiredVisitableView that uses that handle.
final class HotwiredSessionManager {
  static let shared = HotwiredSessionManager()

  private var sessions: [String: HotwiredSession] = [:]

  var handles: [String] {
    Array(sessions.keys)
  }

  func session(for handle: String) -> HotwiredSession? {
    sessions[handle]
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
