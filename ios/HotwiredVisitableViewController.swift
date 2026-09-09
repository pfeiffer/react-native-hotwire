import UIKit
import WebKit

protocol HotwiredVisitableViewControllerDelegate: AnyObject {
  func visitableWillAppear()
  func visitableDidAppear()
  func visitableWillDisappear()
  func visitableDidRender()
  func showVisitableActivityIndicator()
  func hideVisitableActivityIndicator()
}

/// The `Visitable` a Hotwire session drives. Hotwire expects one view controller per
/// page; this one is a child of the React Native screen's view controller and hosts the
/// VisitableView into which the session moves its shared web view.
///
/// Location tracking follows upstream's VisitableViewController: while this visitable
/// owns the web view its location is the web view's URL (Turbo Frame navigations
/// included); when the web view moves to another visitable the last URL is frozen so a
/// later restore or refresh targets the right page.
final class HotwiredVisitableViewController: UIViewController, Visitable {
  weak var delegate: HotwiredVisitableViewControllerDelegate?
  weak var visitableDelegate: VisitableDelegate?

  private(set) var initialVisitableURL: URL = URL(string: "about:blank")!
  var currentVisitableURL: URL {
    switch locationState {
    case .resolved: return visitableView.webView?.url ?? initialVisitableURL
    case .initialized(let url), .deactivated(let url): return url
    }
  }

  private enum LocationState {
    case resolved
    case initialized(URL)
    case deactivated(URL)
  }
  private var locationState: LocationState = .initialized(URL(string: "about:blank")!)

  private weak var hostViewController: UIViewController?

  init(hostViewController: UIViewController?, delegate: HotwiredVisitableViewControllerDelegate) {
    self.hostViewController = hostViewController
    self.delegate = delegate
    super.init(nibName: nil, bundle: nil)
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) is not supported")
  }

  /// Sets the page this visitable represents. Call before the first visit.
  func setInitialURL(_ url: URL) {
    initialVisitableURL = url
    locationState = .initialized(url)
  }

  // MARK: View lifecycle

  override func viewDidLoad() {
    super.viewDidLoad()
    view.addSubview(visitableView)
    NSLayoutConstraint.activate([
      visitableView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      visitableView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
      visitableView.topAnchor.constraint(equalTo: view.topAnchor),
      visitableView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
    ])
  }

  override func viewWillAppear(_ animated: Bool) {
    super.viewWillAppear(animated)
    visitableDelegate?.visitableViewWillAppear(self)
    delegate?.visitableWillAppear()
  }

  override func viewDidAppear(_ animated: Bool) {
    super.viewDidAppear(animated)
    visitableDelegate?.visitableViewDidAppear(self)
    delegate?.visitableDidAppear()
  }

  override func viewWillDisappear(_ animated: Bool) {
    super.viewWillDisappear(animated)
    delegate?.visitableWillDisappear()
  }

  // MARK: Visitable

  private(set) lazy var visitableView: VisitableView = {
    let view = VisitableView(frame: .zero)
    view.translatesAutoresizingMaskIntoConstraints = false
    return view
  }()

  var visitableViewController: UIViewController {
    hostViewController?.parent ?? self
  }

  func visitableDidRender() {
    locationState = .resolved
    delegate?.visitableDidRender()
  }

  func showVisitableActivityIndicator() {
    delegate?.showVisitableActivityIndicator()
  }

  func hideVisitableActivityIndicator() {
    delegate?.hideVisitableActivityIndicator()
  }

  func visitableDidActivateWebView(_ webView: WKWebView) {
    registerContentScrollView()
    dragObservation = webView.scrollView.panGestureRecognizer.observe(\.state) { [weak self] recognizer, _ in
      if recognizer.state == .began {
        self?.registerContentScrollView()
      }
    }
  }

  func visitableWillDeactivateWebView() {
    dragObservation = nil
    locationState = .deactivated(visitableView.webView?.url ?? initialVisitableURL)
  }

  // MARK: Content scroll view

  private var dragObservation: NSKeyValueObservation?

  /// UIKit drives bar behavior from content scroll views: the navigation bar's large title
  /// and scroll-edge effect from the stack's top controller (the react-native-screens screen
  /// above this one), the tab bar's scroll-edge effect and minimize behavior from the
  /// controller directly under the UITabBarController. Neither finds the web view by itself:
  /// Hotwire registers it on `visitableViewController` only, and UIKit's `subviews[0]`
  /// heuristic stops at whatever the React Native tree puts first (a sibling view, a pager's
  /// own scroll view). So register it on every ancestor below the tab bar controller.
  ///
  /// Registered when this visitable takes the web view, and again whenever the user starts
  /// dragging it. Attach and appearance callbacks cannot stand in for the drag: a SwiftUI
  /// pager keeps neighboring pages in the window, so arriving on a page fires nothing for it
  /// while the neighbor it prepares attaches and would take the registration. The drag is
  /// the one signal that always names the page the user is on. Before the controller is
  /// parented there is nothing to register on.
  private func registerContentScrollView() {
    guard let scrollView = visitableView.webView?.scrollView else { return }

    var ancestor = parent
    while let current = ancestor, !(current is UITabBarController) {
      current.setContentScrollView(scrollView, for: .all)
      ancestor = current.parent
    }
  }
}
