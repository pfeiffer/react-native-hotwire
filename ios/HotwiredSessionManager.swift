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
