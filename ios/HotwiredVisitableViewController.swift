import UIKit

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
final class HotwiredVisitableViewController: UIViewController, Visitable {
  weak var delegate: HotwiredVisitableViewControllerDelegate?
  weak var visitableDelegate: VisitableDelegate?
  var visitableURL: URL!

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

  private(set) lazy var visitableView: VisitableView! = {
    let view = VisitableView(frame: .zero)
    view.translatesAutoresizingMaskIntoConstraints = false
    return view
  }()

  var visitableViewController: UIViewController {
    hostViewController?.parent ?? self
  }

  func visitableDidRender() {
    delegate?.visitableDidRender()
  }

  func showVisitableActivityIndicator() {
    delegate?.showVisitableActivityIndicator()
  }

  func hideVisitableActivityIndicator() {
    delegate?.hideVisitableActivityIndicator()
  }
}
