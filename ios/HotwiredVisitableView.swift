import ExpoModulesCore
import UIKit
import WebKit

// Turbo 8 exposes session.refresh; older Turbo falls back to a replace visit.
private let refreshScript = """
typeof Turbo.session.refresh === 'function'
  ? Turbo.session.refresh(document.baseURI)
  : Turbo.visit(document.baseURI, { action: 'replace', shouldCacheSnapshot: false })
"""

/// The native side of `VisitableView`. Attaches a HotwiredVisitableViewController to the
/// React Native screen's view controller and asks the shared session to visit `url`.
final class HotwiredVisitableView: ExpoView {
  // MARK: Props

  var url: String = ""
  var sessionHandle: String = "Default"
  var applicationNameForUserAgent: String? {
    didSet { webViewConfiguration.applicationNameForUserAgent = applicationNameForUserAgent }
  }
  var pullToRefreshEnabled = true {
    didSet { controller?.visitableView.allowsPullToRefresh = pullToRefreshEnabled }
  }
  var scrollEnabled = true {
    didSet { configureWebView() }
  }
  var contentInset: UIEdgeInsets = .zero {
    didSet { configureWebView() }
  }
  var webViewDebuggingEnabled = false {
    didSet { configureWebView() }
  }

  // MARK: Events

  let onLoad = EventDispatcher()
  let onMessage = EventDispatcher()
  let onError = EventDispatcher()
  let onVisitProposal = EventDispatcher()
  let onWebAlert = EventDispatcher()
  let onWebConfirm = EventDispatcher()
  let onOpenExternalUrl = EventDispatcher()
  let onFormSubmissionStarted = EventDispatcher()
  let onFormSubmissionFinished = EventDispatcher()
  let onShowLoading = EventDispatcher()
  let onHideLoading = EventDispatcher()
  let onContentProcessDidTerminate = EventDispatcher()

  // MARK: State

  private let webViewConfiguration = WKWebViewConfiguration()
  private var _session: HotwiredSession?
  private var session: HotwiredSession? {
    if _session == nil {
      _session = HotwiredSessionManager.shared.findOrCreateSession(
        handle: sessionHandle,
        webViewConfiguration: webViewConfiguration
      )
    }
    return _session
  }
  private var webView: WKWebView? { session?.webView }

  private lazy var controller: HotwiredVisitableViewController? = HotwiredVisitableViewController(
    hostViewController: hostViewController,
    delegate: self
  )

  private var alertCompletion: (() -> Void)?
  private var confirmCompletion: ((Bool) -> Void)?
  private var webViewUrlObservation: NSKeyValueObservation?

  private var isRefreshing: Bool {
    controller?.visitableView.isRefreshing ?? false
  }

  /// The React Native screen's view controller (the nearest one up the responder chain).
  private var hostViewController: UIViewController? {
    var responder: UIResponder? = self
    while let next = responder?.next {
      if let viewController = next as? UIViewController {
        return viewController
      }
      responder = next
    }
    return nil
  }

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
  }

  // MARK: Attaching to the screen

  override func willMove(toWindow newWindow: UIWindow?) {
    super.willMove(toWindow: newWindow)

    // UIPageViewController doesn't always forward viewWillAppear to child controllers,
    // so start the appearance transition ourselves when hosted in a pager.
    if newWindow != nil, hostViewController?.parent is UIPageViewController {
      controller?.beginAppearanceTransition(true, animated: false)
    }
  }

  override func didMoveToWindow() {
    super.didMoveToWindow()

    guard window != nil, let host = hostViewController, let controller else {
      stopObservingWebViewUrl()
      return
    }

    host.addChild(controller)
    addSubview(controller.view)
    controller.view.frame = bounds
    controller.didMove(toParent: host)
    registerContentScrollView()

    if host.parent is UIPageViewController {
      controller.endAppearanceTransition()
    }
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    controller?.view.frame = bounds
  }

  override func removeFromSuperview() {
    super.removeFromSuperview()
    stopObservingWebViewUrl()
    controller?.willMove(toParent: nil)
    controller?.view.removeFromSuperview()
    controller?.removeFromParent()
    _session = nil
    controller = nil
  }

  /// react-native-screens finds a screen's content scroll view by walking `subviews[0]`
  /// down from the screen, which never reaches the web view because Hotwire's
  /// VisitableView adds its activity indicator first. Register the scroll view
  /// explicitly so the tab bar gets its scroll-edge appearance and minimize behavior.
  private func registerContentScrollView() {
    guard let scrollView = webView?.scrollView else { return }

    DispatchQueue.main.async { [weak self] in
      guard let self else { return }
      var candidate = self.hostViewController
      while let current = candidate {
        if current.parent is UITabBarController {
          current.setContentScrollView(scrollView, for: .all)
          return
        }
        candidate = current.parent
      }
    }
  }

  // MARK: Visiting

  func visitIfNeeded() {
    guard let controller, controller.visitableURL?.absoluteString != url, let target = URL(string: url) else {
      return
    }
    controller.visitableURL = target
    session?.visit(controller)
  }

  private func configureWebView() {
    guard let webView else { return }

    if #available(iOS 16.4, *) {
      webView.isInspectable = webViewDebuggingEnabled
    }
    webView.scrollView.isScrollEnabled = scrollEnabled
    webView.scrollView.contentInset = contentInset
  }

  /// Keeps `visitableURL` in step with Turbo Frame navigations so pull-to-refresh
  /// reloads the right page. Only while this controller owns the shared web view,
  /// otherwise a background visitable's URL would be overwritten.
  private func startObservingWebViewUrl() {
    stopObservingWebViewUrl()
    webViewUrlObservation = webView?.observe(\.url, options: [.new]) { [weak self] _, change in
      guard let self,
            let newUrl = change.newValue ?? nil,
            let controller = self.controller,
            self.session?.turboSession.activeVisitable === controller,
            controller.visitableURL != newUrl
      else { return }
      controller.visitableURL = newUrl
    }
  }

  private func stopObservingWebViewUrl() {
    webViewUrlObservation?.invalidate()
    webViewUrlObservation = nil
  }

  // MARK: Commands

  func injectJavaScript(_ script: String) {
    webView?.evaluateJavaScript(script)
  }

  func reload() {
    session?.reload()
  }

  func sendAlertResult() {
    alertCompletion?()
    alertCompletion = nil
  }

  func sendConfirmResult(_ result: Bool) {
    confirmCompletion?(result)
    confirmCompletion = nil
  }

  private func statusCode(for error: Error) -> Int {
    switch error as? TurboError {
    case .networkFailure: return 0
    case .timeoutFailure: return -1
    case .contentTypeMismatch: return -2
    case .pageLoadFailure: return -3
    case .http(let statusCode): return statusCode
    case .none: return -4
    }
  }
}

// MARK: - HotwiredSessionSubscriber

extension HotwiredVisitableView: HotwiredSessionSubscriber {
  func handleMessage(_ message: String) {
    onMessage(["message": message])
  }

  func didProposeVisit(_ proposal: VisitProposal) {
    if webView?.url == proposal.url && proposal.options.action == .replace {
      // Reopening the current page: refresh in place instead of navigating.
      refresh()
    } else {
      onVisitProposal([
        "url": proposal.url.absoluteString,
        "action": proposal.options.action.rawValue,
      ])
    }
  }

  func didProposeVisitToCrossOriginRedirect(_ location: URL) {
    onOpenExternalUrl(["url": location.absoluteString])
  }

  func didFailRequest(for visitable: Visitable, error: Error) {
    onError([
      "url": visitable.visitableURL.absoluteString,
      "description": error.localizedDescription,
      "statusCode": statusCode(for: error),
    ])
  }

  func didOpenExternalUrl(_ url: URL) {
    onOpenExternalUrl(["url": url.absoluteString])
  }

  func didStartFormSubmission() {
    onFormSubmissionStarted(["url": url])
  }

  func didFinishFormSubmission() {
    onFormSubmissionFinished(["url": url])
  }

  func processDidTerminate() {
    onContentProcessDidTerminate(["url": url])
  }

  func handleAlert(message: String, completion: @escaping () -> Void) {
    alertCompletion = completion
    onWebAlert(["message": message])
  }

  func handleConfirm(message: String, completion: @escaping (Bool) -> Void) {
    confirmCompletion = completion
    onWebConfirm(["message": message])
  }

  func refresh() {
    webView?.evaluateJavaScript(refreshScript)
  }
}

// MARK: - HotwiredVisitableViewControllerDelegate

extension HotwiredVisitableView: HotwiredVisitableViewControllerDelegate {
  func visitableWillAppear() {
    session?.visitableViewWillAppear(self)
  }

  func visitableDidAppear() {
    configureWebView()
    startObservingWebViewUrl()
    // The web view is shared, so whichever visitable is on screen claims the scroll
    // view registration; in a pager the last mounted page would otherwise keep it.
    registerContentScrollView()
  }

  func visitableWillDisappear() {
    stopObservingWebViewUrl()
    // Never leave a WebKit completion handler pending.
    sendAlertResult()
    sendConfirmResult(false)
  }

  func visitableDidRender() {
    onLoad([
      "title": webView?.title ?? "",
      "url": webView?.url?.absoluteString ?? url,
    ])
  }

  func showVisitableActivityIndicator() {
    if isRefreshing { return }
    onShowLoading([:])
  }

  func hideVisitableActivityIndicator() {
    onHideLoading([:])
  }
}
