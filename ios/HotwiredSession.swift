import UIKit
import WebKit

/// What a session needs from the view currently showing its web view.
protocol HotwiredSessionSubscriber: AnyObject {
  func handleMessage(_ message: String)
  func didProposeVisit(_ proposal: VisitProposal)
  func didProposeVisitToCrossOriginRedirect(_ location: URL)
  func didFailRequest(for visitable: Visitable, error: Error)
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
  }

  lazy var turboSession: Session = {
    webViewConfiguration.userContentController.add(self, name: "nativeApp")

    let session = Session(webViewConfiguration: webViewConfiguration)
    session.delegate = self
    session.webView.allowsLinkPreview = false
    session.webView.scrollView.contentInsetAdjustmentBehavior = .never
    session.webView.uiDelegate = self
    return session
  }()

  var webView: WKWebView {
    turboSession.webView
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
  }

  func session(_ session: Session, didProposeVisit proposal: VisitProposal) {
    subscriber?.didProposeVisit(proposal)
  }

  func session(_ session: Session, didProposeVisitToCrossOriginRedirect location: URL) {
    subscriber?.didProposeVisitToCrossOriginRedirect(location)
  }

  func session(_ session: Session, didFailRequestForVisitable visitable: Visitable, error: Error) {
    subscriber?.didFailRequest(for: visitable, error: error)
  }

  func session(_ session: Session, openExternalURL url: URL) {
    subscriber?.didOpenExternalUrl(url)
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
