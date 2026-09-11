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
  let onCrossOriginRedirect = EventDispatcher()
  let onFormSubmissionStart = EventDispatcher()
  let onFormSubmissionEnd = EventDispatcher()
  let onScroll = EventDispatcher()
  let onShowLoading = EventDispatcher()
  let onHideLoading = EventDispatcher()
  let onContentProcessDidTerminate = EventDispatcher()

  // MARK: State

  private let webViewConfiguration: WKWebViewConfiguration = {
    // Upstream's makeWebViewConfiguration: mobile pages even on iPad, one process pool for
    // every session. Media plays as it does in Safari, inline and with muted autoplay;
    // WKWebView's own defaults send every video fullscreen and block all autoplay, and
    // the page decides such things with its markup, not the app.
    let configuration = WKWebViewConfiguration()
    configuration.defaultWebpagePreferences.preferredContentMode = .mobile
    configuration.processPool = HotwiredSessionManager.shared.processPool
    configuration.allowsInlineMediaPlayback = true
    configuration.mediaTypesRequiringUserActionForPlayback = []
    return configuration
  }()

  /// nil until the first visit or appearance; also nil after removeFromSuperview, which
  /// is how the view knows it is no longer attached. Prop setters must never create it.
  private var session: HotwiredSession?
  private var webView: WKWebView? { session?.webView }

  /// Called from `visitIfNeeded` and `visitableWillAppear`, both of which run after all
  /// props for the render are applied. Props arrive in arbitrary order, and the WKWebView
  /// must not exist before `applicationNameForUserAgent` reached its configuration.
  /// Note the configuration only matters for the first view on a handle: later views
  /// join the existing session and web view (see README, "Sessions").
  private func createSessionIfNeeded() -> HotwiredSession {
    if let session {
      return session
    }
    let created = HotwiredSessionManager.shared.findOrCreateSession(
      handle: sessionHandle,
      webViewConfiguration: webViewConfiguration
    )
    session = created
    return created
  }

  private lazy var controller: HotwiredVisitableViewController? = HotwiredVisitableViewController(
    hostViewController: hostViewController,
    delegate: self
  )

  private var alertCompletion: (() -> Void)?
  private var confirmCompletion: ((Bool) -> Void)?

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
      return
    }

    // A native tab bar detaches an unselected tab's views from the window and re-attaches
    // them on return, so this runs more than once per view.
    if controller.parent !== host {
      host.addChild(controller)
      addSubview(controller.view)
      controller.view.frame = bounds
      controller.didMove(toParent: host)
    }

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
    controller?.prepareForRemoval()
    controller?.willMove(toParent: nil)
    controller?.view.removeFromSuperview()
    controller?.removeFromParent()
    session = nil
    controller = nil
  }

  // MARK: Visiting

  func visitIfNeeded() {
    guard let controller, controller.initialVisitableURL.absoluteString != url, let target = URL(string: url) else {
      return
    }
    controller.setInitialURL(target)
    let activeSession = createSessionIfNeeded()
    // Apply props that were set before the web view existed.
    configureWebView()
    activeSession.visit(controller)
  }

  private func configureWebView() {
    guard let webView else { return }

    if #available(iOS 16.4, *) {
      webView.isInspectable = webViewDebuggingEnabled
    }
    webView.scrollView.isScrollEnabled = scrollEnabled
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

  /// Maps Hotwire's error types onto the status codes shared with JS (see SystemStatusCode).
  private func statusCode(for error: HotwireNativeError) -> Int {
    switch error {
    case .http(let httpError):
      return httpError.statusCode
    case .load(.contentTypeMismatch):
      return -2
    case .load:
      return -3
    case .web(let webError):
      if webError.isTimeout { return -1 }
      if webError.isOffline || webError.isConnectionError { return 0 }
      switch webError.errorCode {
      case 0, -1, -2: return webError.errorCode
      default: return -4
      }
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
        "properties": proposal.properties,
      ])
    }
  }

  func didProposeVisitToCrossOriginRedirect(_ location: URL) {
    onCrossOriginRedirect(["url": location.absoluteString])
  }

  func didFailRequest(for visitable: Visitable, error: HotwireNativeError) {
    onError([
      "url": visitable.currentVisitableURL.absoluteString,
      "description": error.localizedDescription,
      "statusCode": statusCode(for: error),
    ])
  }

  func didOpenExternalUrl(_ url: URL) {
    onOpenExternalUrl(["url": url.absoluteString])
  }

  func didStartFormSubmission() {
    onFormSubmissionStart(["url": url])
  }

  func didFinishFormSubmission() {
    onFormSubmissionEnd(["url": url])
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
  // React Native's ScrollView event, so what reads one reads this.
  func visitableDidScroll(_ scrollView: UIScrollView) {
    let velocity = scrollView.panGestureRecognizer.velocity(in: scrollView)
    onScroll([
      "contentInset": [
        "top": scrollView.contentInset.top, "left": scrollView.contentInset.left,
        "bottom": scrollView.contentInset.bottom, "right": scrollView.contentInset.right,
      ],
      "contentOffset": ["x": scrollView.contentOffset.x, "y": scrollView.contentOffset.y],
      "contentSize": ["width": scrollView.contentSize.width, "height": scrollView.contentSize.height],
      "layoutMeasurement": ["width": scrollView.bounds.width, "height": scrollView.bounds.height],
      "velocity": ["x": velocity.x, "y": velocity.y],
      "zoomScale": scrollView.zoomScale,
    ])
  }

  func visitableWillAppear() {
    createSessionIfNeeded().visitableViewWillAppear(self)
  }

  func visitableDidAppear() {
    configureWebView()
  }

  func visitableWillDisappear() {
    // Never leave a WebKit completion handler pending.
    sendAlertResult()
    sendConfirmResult(false)
  }

  func visitableDidRender() {
    let loadedUrl = webView?.url?.absoluteString ?? url
    guard let webView else {
      onLoad(["title": "", "url": loadedUrl])
      return
    }
    // From the document, not `webView.title`: WebKit updates that property after the
    // render message, so it can still name the previous page.
    webView.evaluateJavaScript("document.title") { [weak self] title, _ in
      self?.onLoad(["title": title as? String ?? "", "url": loadedUrl])
    }
  }

  func showVisitableActivityIndicator() {
    if isRefreshing { return }
    onShowLoading([:])
  }

  func hideVisitableActivityIndicator() {
    onHideLoading([:])
  }
}
