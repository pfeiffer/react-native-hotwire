import WebKit
import XCTest

@testable import HotwireCore

/// The view controller on its own: where a page's location comes from at each point of the
/// web view's stay, what a pop hands the session, and which ancestors get the scroll view.
/// After upstream's VisitableViewControllerTests.
final class HotwiredVisitableViewControllerTests: XCTestCase {
  private let originalURL = URL(string: "https://app.test/settings")!
  private let nextURL = URL(string: "https://app.test/users/1")!

  private var webView: WebViewSpy!
  private var pages: PageDelegate!
  private var controller: HotwiredVisitableViewController!

  override func setUp() {
    super.setUp()
    webView = WebViewSpy()
    webView.overriddenURL = originalURL
    pages = PageDelegate()
    controller = HotwiredVisitableViewController(hostViewController: nil, delegate: pages)
    controller.setInitialURL(originalURL)
  }

  // MARK: Location

  func test_initial_url_and_current_url_match_on_init() {
    XCTAssertEqual(controller.initialVisitableURL, originalURL)
    XCTAssertEqual(controller.currentVisitableURL, originalURL)
  }

  func test_current_url_is_the_initial_url_until_the_page_renders() {
    controller.activateVisitableWebView(webView)
    webView.overriddenURL = nextURL

    XCTAssertEqual(controller.currentVisitableURL, originalURL)
  }

  func test_current_url_follows_the_web_view_once_rendered() {
    controller.activateVisitableWebView(webView)
    controller.visitableDidRender()
    webView.overriddenURL = nextURL

    XCTAssertEqual(controller.currentVisitableURL, nextURL)
  }

  func test_current_url_freezes_where_the_web_view_was_when_it_left() {
    controller.activateVisitableWebView(webView)
    controller.visitableDidRender()
    webView.overriddenURL = nextURL

    controller.deactivateVisitableWebView()
    webView.overriddenURL = URL(string: "https://app.test/elsewhere")!

    XCTAssertEqual(controller.currentVisitableURL, nextURL)
    XCTAssertNil(controller.visitableView.webView)
  }

  // MARK: Pop

  func test_removal_hands_the_session_the_disappearance_while_the_web_view_is_still_in_place() {
    let session = VisitableDelegateSpy()
    controller.visitableDelegate = session
    controller.activateVisitableWebView(webView)

    controller.prepareForRemoval()

    XCTAssertEqual(session.calls, ["willDisappear", "didDisappear"])
    XCTAssertTrue(session.webViewPresentAtWillDisappear)
  }

  func test_removal_without_the_web_view_leaves_the_session_alone() {
    let session = VisitableDelegateSpy()
    controller.visitableDelegate = session

    controller.prepareForRemoval()

    XCTAssertEqual(session.calls, [])
  }

  // MARK: Content scroll view

  func test_activating_the_web_view_registers_its_scroll_view_on_every_ancestor_below_the_tab_bar() {
    let host = UIViewController()
    let navigation = UINavigationController(rootViewController: host)
    let tabs = UITabBarController()
    tabs.viewControllers = [navigation]
    host.addChild(controller)

    controller.activateVisitableWebView(webView)

    XCTAssertTrue(host.contentScrollView(for: .top) === webView.scrollView)
    XCTAssertTrue(navigation.contentScrollView(for: .top) === webView.scrollView)
    XCTAssertNil(tabs.contentScrollView(for: .bottom))
  }
}

/// A web view whose URL the test decides.
private final class WebViewSpy: WKWebView {
  var overriddenURL: URL?
  override var url: URL? { overriddenURL }
}

/// Records what a session would be told.
private final class VisitableDelegateSpy: VisitableDelegate {
  var calls: [String] = []
  var webViewPresentAtWillDisappear = false

  func visitableViewWillAppear(_ visitable: Visitable) { calls.append("willAppear") }
  func visitableViewDidAppear(_ visitable: Visitable) { calls.append("didAppear") }
  func visitableViewWillDisappear(_ visitable: Visitable) {
    calls.append("willDisappear")
    webViewPresentAtWillDisappear = visitable.visitableView.webView != nil
  }
  func visitableViewDidDisappear(_ visitable: Visitable) { calls.append("didDisappear") }
  func visitableDidRequestReload(_ visitable: Visitable) { calls.append("reload") }
  func visitableDidRequestRefresh(_ visitable: Visitable) { calls.append("refresh") }
}

private final class PageDelegate: HotwiredVisitableViewControllerDelegate {
  func visitableDidScroll(_ scrollView: UIScrollView) {}
  func visitableWillAppear() {}
  func visitableDidAppear() {}
  func visitableWillDisappear() {}
  func visitableDidRender() {}
  func showVisitableActivityIndicator() {}
  func hideVisitableActivityIndicator() {}
}
