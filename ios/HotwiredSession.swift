import UIKit
import WebKit

/// What a session needs from the view currently showing its web view.
protocol HotwiredSessionSubscriber: AnyObject {
  func handleMessage(_ message: String)
  func didProposeVisit(_ proposal: VisitProposal)
  func didProposeVisitToCrossOriginRedirect(_ location: URL)
  func didFailRequest(for visitable: Visitable, error: HotwireNativeError)
  func didOpenExternalUrl(_ url: URL)
  func didStartFormSubmission()
  func didFinishFormSubmission()
  func processDidTerminate()
  func handleAlert(message: String, completion: @escaping () -> Void)
  func handleConfirm(message: String, completion: @escaping (Bool) -> Void)
  func refresh()
}

/// Wraps a Hotwire `Session`, forwarding its delegate callbacks, page messages and
/// JavaScript dialogs to whichever HotwiredVisitableView is currently on screen.
final class HotwiredSession: NSObject {
  let handle: String
  private let webViewConfiguration: WKWebViewConfiguration
  private weak var subscriber: HotwiredSessionSubscriber?

  init(handle: String, webViewConfiguration: WKWebViewConfiguration) {
    self.handle = handle
    self.webViewConfiguration = webViewConfiguration
    super.init()
    webViewConfiguration.userContentController.add(self, name: "nativeApp")
  }

  private(set) lazy var turboSession: Session = makeSession()

  var webView: WKWebView {
    turboSession.webView
  }

  private func makeSession() -> Session {
    let session = Session(webViewConfiguration: webViewConfiguration)
    session.delegate = self
    session.webView.allowsLinkPreview = false
    session.webView.scrollView.contentInsetAdjustmentBehavior = .never
    session.webView.uiDelegate = self
    return session
  }

  // MARK: Web content process termination
  //
  // WebKit kills the content process of a backgrounded web view under memory pressure and
  // leaves a white page behind. Upstream's Navigator handles this in two steps and so does
  // this: reload right away when the page is on screen, defer to the next foreground when
  // the app is in the background, and on every foreground probe a session whose process
  // died without notice and rebuild it.

  private var terminatedInBackground = false

  /// Reloads the page whose process died, if it is still parented. An off-screen page is
  /// left alone: reloading it fetches for nothing and its next visit would connect bridge
  /// components twice. In the background the reload waits for `inspect()`.
  private func reloadIfPermitted() {
    guard let visitable = turboSession.activeVisitable as? UIViewController, visitable.parent != nil else {
      return
    }
    if UIApplication.shared.applicationState == .background {
      terminatedInBackground = true
      return
    }
    turboSession.reload()
  }

  /// Called when the app enters the foreground.
  func inspect() {
    if terminatedInBackground {
      terminatedInBackground = false
      turboSession.reload()
      return
    }
    guard turboSession.topmostVisitable != nil else { return }

    // A dead process fails every script evaluation; that is the only signal WebKit gives.
    webView.evaluateJavaScript("1") { [weak self] _, error in
      guard error != nil else { return }
      self?.recreateWebView()
    }
  }

  /// Replaces the session and its web view, then visits the active page again in place.
  private func recreateWebView() {
    guard let visitable = turboSession.activeVisitable else { return }
    visitable.deactivateVisitableWebView()
    turboSession = makeSession()
    turboSession.visit(visitable, options: VisitOptions(action: .replace))
  }

  func visitableViewWillAppear(_ view: HotwiredSessionSubscriber) {
    subscriber = view
  }

  func visit(_ visitable: Visitable) {
    turboSession.visit(visitable)
  }

  func reload() {
    turboSession.reload()
  }

  func refresh() {
    subscriber?.refresh()
  }

  func clearSnapshotCache() {
    turboSession.clearSnapshotCache()
  }
}

extension HotwiredSession: SessionDelegate {
  func sessionWebViewProcessDidTerminate(_ session: Session) {
    subscriber?.processDidTerminate()
    reloadIfPermitted()
  }

  func session(_ session: Session, didProposeVisit proposal: VisitProposal) {
    subscriber?.didProposeVisit(proposal)
  }

  func session(_ session: Session, didProposeVisitToCrossOriginRedirect location: URL) {
    subscriber?.didProposeVisitToCrossOriginRedirect(location)
  }

  func session(_ session: Session, didFailRequestForVisitable visitable: Visitable, error: HotwireNativeError) {
    subscriber?.didFailRequest(for: visitable, error: error)
  }

  /// Navigation policy for web view navigations that are not Turbo visits. Link clicks
  /// and main-frame navigations are cancelled: same-app links become visit proposals via
  /// Turbo, everything else is handed to JS as an external URL, and a main-frame reload
  /// is turned into a session reload.
  func session(_ session: Session, decidePolicyFor navigationAction: WKNavigationAction) -> WebViewPolicyManager.Decision {
    if let url = navigationAction.request.url, navigationAction.shouldOpenURLExternally {
      subscriber?.didOpenExternalUrl(url)
    } else if navigationAction.shouldReloadPage {
      session.reload()
    }

    return navigationAction.shouldNavigateInApp ? .cancel : .allow
  }

  func sessionDidStartFormSubmission(_ session: Session) {
    subscriber?.didStartFormSubmission()
  }

  func sessionDidFinishFormSubmission(_ session: Session) {
    subscriber?.didFinishFormSubmission()
  }
}

// Messages posted by the injected bridge script via webkit.messageHandlers.nativeApp.
extension HotwiredSession: WKScriptMessageHandler {
  func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
    guard let body = message.body as? String else { return }
    subscriber?.handleMessage(body)
  }
}

// window.alert / window.confirm. The completion handlers must always be called.
extension HotwiredSession: WKUIDelegate {
  func webView(
    _ webView: WKWebView,
    runJavaScriptAlertPanelWithMessage message: String,
    initiatedByFrame frame: WKFrameInfo,
    completionHandler: @escaping () -> Void
  ) {
    guard let subscriber else {
      completionHandler()
      return
    }
    subscriber.handleAlert(message: message, completion: completionHandler)
  }

  func webView(
    _ webView: WKWebView,
    runJavaScriptConfirmPanelWithMessage message: String,
    initiatedByFrame frame: WKFrameInfo,
    completionHandler: @escaping (Bool) -> Void
  ) {
    guard let subscriber else {
      completionHandler(false)
      return
    }
    subscriber.handleConfirm(message: message, completion: completionHandler)
  }
}
