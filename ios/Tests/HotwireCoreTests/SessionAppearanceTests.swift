import WebKit
import XCTest

@testable import HotwireCore

/// The view controller against a real session and web view. The first page is cold-booted
/// from an HTML string that carries Turbo, so nothing touches the network; the second
/// page's visit is a JavaScript visit whose request never completes, which leaves the
/// session mid-navigation for as long as the test needs.
final class SessionAppearanceTests: XCTestCase {
  private var session: Session!
  private var pages: PageDelegate!

  override func setUp() {
    super.setUp()
    session = Session(webViewConfiguration: WKWebViewConfiguration())
    pages = PageDelegate()
    session.delegate = pages
  }

  /// Settings beneath a modal; a deep link closes the modal and pushes a profile. The
  /// profile's visit starts before UIKit reports Settings appearing for the dismissal.
  private var settings: HotwiredVisitableViewController!
  private var profile: HotwiredVisitableViewController!

  private func startForwardVisit() throws {
    settings = try bootedPage("https://app.test/settings")
    profile = page("https://app.test/users/1")
    session.visit(profile)
    XCTAssertTrue(session.activeVisitable === profile)
    XCTAssertTrue(session.topmostVisitable === settings)
  }

  func test_page_left_by_a_forward_visit_does_not_report_its_appearance() throws {
    try startForwardVisit()

    settings.viewWillAppear(false)
    settings.viewDidAppear(false)

    XCTAssertTrue(session.activeVisitable === profile, "restored the page being left")
    XCTAssertTrue(session.topmostVisitable === settings)
    XCTAssertEqual(settings.currentVisitableURL.path, "/settings")
  }

  func test_forward_navigation_completes_when_the_pushed_page_appears() throws {
    try startForwardVisit()
    settings.viewWillAppear(false)
    settings.viewDidAppear(false)

    profile.viewWillAppear(false)

    XCTAssertTrue(session.topmostVisitable === profile)
    XCTAssertTrue(session.activeVisitable === profile)
  }

  func test_page_beneath_one_popped_before_it_appeared_restores() throws {
    try startForwardVisit()

    profile.prepareForRemoval()
    XCTAssertNil(session.activeVisitable)
    settings.viewWillAppear(false)

    XCTAssertTrue(session.activeVisitable === settings, "the page beneath did not restore")
  }

  // MARK: Pages

  private func page(_ url: String) -> HotwiredVisitableViewController {
    let controller = HotwiredVisitableViewController(hostViewController: nil, delegate: pages)
    controller.setInitialURL(URL(string: url)!)
    return controller
  }

  /// A page cold-booted from HTML carrying Turbo, appeared, rendered and topmost.
  private func bootedPage(_ url: String) throws -> HotwiredVisitableViewController {
    let controller = page(url)
    let loaded = expectation(description: "\(url) loaded")
    pages.onLoadWebView = { loaded.fulfill() }
    let response = VisitResponse(statusCode: 200, redirected: false, responseHTML: try turboPage(url))
    session.visit(controller, options: VisitOptions(action: .advance, response: response))
    controller.viewWillAppear(false)
    controller.viewDidAppear(false)
    // The first web view in a process waits for WebKit to start; a CI runner takes over a minute.
    wait(for: [loaded], timeout: 180)
    pages.onLoadWebView = nil
    XCTAssertTrue(session.topmostVisitable === controller)
    XCTAssertTrue(session.activeVisitable === controller)
    return controller
  }

  private func turboPage(_ url: String) throws -> String {
    let turbo = try String(contentsOf: Self.turboURL)
    return """
      <!doctype html>
      <html><head><meta charset="utf-8"><title>\(url)</title>
      <script>\(turbo)</script>
      </head><body><h1>\(url)</h1></body></html>
      """
  }

  /// Turbo 8, the copy the end-to-end server serves.
  private static let turboURL = URL(fileURLWithPath: #filePath)
    .deletingLastPathComponent()
    .appendingPathComponent("../../../e2e/server/turbo.js")
    .standardizedFileURL
}

/// Stands in for the React Native view and the session manager.
private final class PageDelegate: NSObject, HotwiredVisitableViewControllerDelegate, SessionDelegate {
  var onLoadWebView: (() -> Void)?

  func sessionDidLoadWebView(_ session: Session) { onLoadWebView?() }
  func session(_ session: Session, didProposeVisit proposal: VisitProposal) {}
  func session(_ session: Session, didProposeVisitToCrossOriginRedirect location: URL) {}
  func session(_ session: Session, didFailRequestForVisitable visitable: Visitable, error: HotwireNativeError) {}
  func session(_ session: Session, decidePolicyFor navigationAction: WKNavigationAction) -> WebViewPolicyManager.Decision { .allow }
  func sessionWebViewProcessDidTerminate(_ session: Session) {}

  func visitableDidScroll(_ scrollView: UIScrollView) {}
  func visitableWillAppear() {}
  func visitableDidAppear() {}
  func visitableWillDisappear() {}
  func visitableDidRender() {}
  func showVisitableActivityIndicator() {}
  func hideVisitableActivityIndicator() {}
}
