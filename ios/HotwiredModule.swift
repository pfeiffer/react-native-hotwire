import ExpoModulesCore

final class NoSessionException: GenericException<String> {
  override var reason: String {
    "No session with handle \"\(param)\""
  }
}

final class InvalidPathConfigurationException: GenericException<String> {
  override var reason: String {
    "Invalid path configuration: \(param)"
  }
}

public class HotwiredModule: Module, PathConfigurationDelegate {
  public func definition() -> ModuleDefinition {
    Name("Hotwire")

    Events("onPathConfigurationUpdate")

    OnCreate {
      Hotwire.config.pathConfiguration.delegate = self
    }

    // Hotwire's path configuration: `{ settings, rules }`, see README "Path configuration".
    // The bundled document loads at once; the URL, if any, loads after it and on later
    // launches the copy cached from it, as upstream's loader does. Sessions share the one
    // PathConfiguration instance, so proposals pick the new rules up immediately.
    AsyncFunction("loadPathConfiguration") { (document: [String: Any]?, url: String?) throws in
      var sources: [PathConfiguration.Source] = []
      if let document {
        guard JSONSerialization.isValidJSONObject(document) else {
          throw InvalidPathConfigurationException("document is not JSON")
        }
        sources.append(.data(try JSONSerialization.data(withJSONObject: document)))
      }
      if let url {
        guard let remote = URL(string: url) else {
          throw InvalidPathConfigurationException("bad url \(url)")
        }
        sources.append(.server(remote))
      }
      Hotwire.config.pathConfiguration.sources = sources
    }.runOnQueue(.main)

    AsyncFunction("getPathConfigurationSettings") { () -> [String: Any] in
      Hotwire.config.pathConfiguration.settings
    }

    AsyncFunction("getPathProperties") { (url: String) throws -> [String: Any] in
      guard let parsed = URL(string: url) else {
        throw InvalidPathConfigurationException("bad url \(url)")
      }
      return Hotwire.config.pathConfiguration.properties(for: parsed) as [String: Any]
    }.runOnQueue(.main)

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
        "onCrossOriginRedirect",
        "onFormSubmissionStart",
        "onFormSubmissionEnd",
        "onScroll",
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

  public func pathConfigurationDidUpdate() {
    sendEvent("onPathConfigurationUpdate", ["settings": Hotwire.config.pathConfiguration.settings])
  }

  private func session(_ handle: String) throws -> HotwiredSession {
    guard let session = HotwiredSessionManager.shared.session(for: handle) else {
      throw NoSessionException(handle)
    }
    return session
  }
}
