import ExpoModulesCore

struct ContentInsetRecord: Record {
  @Field var top: Double = 0
  @Field var left: Double = 0
  @Field var bottom: Double = 0
  @Field var right: Double = 0

  var edgeInsets: UIEdgeInsets {
    UIEdgeInsets(top: top, left: left, bottom: bottom, right: right)
  }
}

final class NoSessionException: GenericException<String> {
  override var reason: String {
    "No session with handle \"\(param)\""
  }
}

public class HotwiredModule: Module {
  public func definition() -> ModuleDefinition {
    Name("Hotwire")

    AsyncFunction("getSessionHandles") { () -> [String] in
      HotwiredSessionManager.shared.handles
    }.runOnQueue(.main)

    AsyncFunction("reloadSession") { (handle: String) throws in
      try self.session(handle).reload()
    }.runOnQueue(.main)

    AsyncFunction("refreshSession") { (handle: String) throws in
      try self.session(handle).refresh()
    }.runOnQueue(.main)

    AsyncFunction("clearSessionSnapshotCache") { (handle: String) throws in
      try self.session(handle).clearSnapshotCache()
    }.runOnQueue(.main)

    View(HotwiredVisitableView.self) {
      Events(
        "onLoad",
        "onMessage",
        "onError",
        "onVisitProposal",
        "onWebAlert",
        "onWebConfirm",
        "onOpenExternalUrl",
        "onFormSubmissionStarted",
        "onFormSubmissionFinished",
        "onShowLoading",
        "onHideLoading",
        "onContentProcessDidTerminate"
      )

      Prop("url") { (view: HotwiredVisitableView, url: String) in
        view.url = url
      }

      Prop("sessionHandle") { (view: HotwiredVisitableView, handle: String) in
        view.sessionHandle = handle
      }

      Prop("applicationNameForUserAgent") { (view: HotwiredVisitableView, name: String?) in
        view.applicationNameForUserAgent = name
      }

      Prop("pullToRefreshEnabled") { (view: HotwiredVisitableView, enabled: Bool) in
        view.pullToRefreshEnabled = enabled
      }

      Prop("scrollEnabled") { (view: HotwiredVisitableView, enabled: Bool) in
        view.scrollEnabled = enabled
      }

      Prop("contentInset") { (view: HotwiredVisitableView, inset: ContentInsetRecord?) in
        view.contentInset = inset?.edgeInsets ?? .zero
      }

      Prop("webViewDebuggingEnabled") { (view: HotwiredVisitableView, enabled: Bool) in
        view.webViewDebuggingEnabled = enabled
      }

      // All props for this render are applied; safe to start the visit.
      OnViewDidUpdateProps { (view: HotwiredVisitableView) in
        view.visitIfNeeded()
      }

      AsyncFunction("injectJavaScript") { (view: HotwiredVisitableView, script: String) in
        view.injectJavaScript(script)
      }

      AsyncFunction("reload") { (view: HotwiredVisitableView) in
        view.reload()
      }

      AsyncFunction("refresh") { (view: HotwiredVisitableView) in
        view.refresh()
      }

      AsyncFunction("sendAlertResult") { (view: HotwiredVisitableView) in
        view.sendAlertResult()
      }

      AsyncFunction("sendConfirmResult") { (view: HotwiredVisitableView, result: Bool) in
        view.sendConfirmResult(result)
      }
    }
  }

  private func session(_ handle: String) throws -> HotwiredSession {
    guard let session = HotwiredSessionManager.shared.session(for: handle) else {
      throw NoSessionException(handle)
    }
    return session
  }
}
