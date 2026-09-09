package com.reactnativehotwire

import dev.hotwire.core.config.Hotwire
import dev.hotwire.core.turbo.config.PathConfiguration
import dev.hotwire.core.turbo.config.PathConfigurationLoadState
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import org.json.JSONObject

class ProgressViewOffsetRecord : Record {
  @Field val scale: Boolean = false
  @Field val start: Int = 0
  @Field val end: Int = 0
}

class NoSessionException(handle: String) : CodedException("No session with handle \"$handle\"")

class HotwiredModule : Module() {
  private val scope = CoroutineScope(Dispatchers.Main + SupervisorJob())

  override fun definition() = ModuleDefinition {
    Name("Hotwire")

    Events("onPathConfigurationUpdate")

    OnCreate {
      // Every load, bundled, cached or remote, reaches JS with the settings it carries.
      scope.launch {
        Hotwire.config.pathConfiguration.loadState.collect { state ->
          if (state is PathConfigurationLoadState.Loaded) {
            sendEvent("onPathConfigurationUpdate", mapOf("settings" to Hotwire.config.pathConfiguration.settings))
          }
        }
      }
    }

    OnDestroy {
      scope.cancel()
    }

    // Hotwire's path configuration: `{ settings, rules }`, see README "Path configuration".
    // The bundled document loads at once unless a copy cached from the URL exists; the URL,
    // if any, loads after and refreshes that cache, as upstream's loader does.
    AsyncFunction("loadPathConfiguration") { document: Map<String, Any?>?, url: String? ->
      val context = appContext.reactContext ?: throw CodedException("No React context")
      Hotwire.loadPathConfiguration(
        context,
        PathConfiguration.Location(
          remoteFileUrl = url,
          bundledJson = document?.let { JSONObject(it).toString() },
        ),
      )
    }

    AsyncFunction("getPathConfigurationSettings") {
      Hotwire.config.pathConfiguration.settings
    }

    AsyncFunction("discardProposedVisit") { url: String ->
      SessionManager.discardProposedVisitOptions(url)
    }

    AsyncFunction("getSessionHandles") {
      SessionManager.handles
    }

    AsyncFunction("reloadSession") { handle: String ->
      session(handle).reload()
    }

    AsyncFunction("refreshSession") { handle: String ->
      session(handle).refresh()
    }

    AsyncFunction("clearSessionSnapshotCache") { handle: String ->
      session(handle).clearSnapshotCache()
    }

    // Results of the file chooser started by FileChooserDelegate.
    OnActivityResult { _, payload ->
      SessionManager.onActivityResult(payload.requestCode, payload.resultCode, payload.data)
    }

    View(HotwiredVisitableView::class) {
      Events(
        "onLoad",
        "onMessage",
        "onError",
        "onVisitProposal",
        "onWebAlert",
        "onWebConfirm",
        "onOpenExternalUrl",
        "onCrossOriginRedirect",
        "onFormSubmissionStarted",
        "onFormSubmissionFinished",
        "onShowLoading",
        "onHideLoading",
        "onContentProcessDidTerminate",
      )

      Prop("url") { view: HotwiredVisitableView, url: String ->
        view.url = url
      }

      Prop("sessionHandle") { view: HotwiredVisitableView, handle: String ->
        view.sessionHandle = handle
      }

      Prop("applicationNameForUserAgent") { view: HotwiredVisitableView, name: String? ->
        view.applicationNameForUserAgent = name
      }

      Prop("pullToRefreshEnabled") { view: HotwiredVisitableView, enabled: Boolean ->
        view.pullToRefreshEnabled = enabled
      }

      Prop("scrollEnabled") { view: HotwiredVisitableView, enabled: Boolean ->
        view.scrollEnabled = enabled
      }

      Prop("progressViewOffset") { view: HotwiredVisitableView, offset: ProgressViewOffsetRecord? ->
        view.progressViewOffset = offset
      }

      Prop("webViewDebuggingEnabled") { view: HotwiredVisitableView, enabled: Boolean ->
        view.webViewDebuggingEnabled = enabled
      }

      AsyncFunction("injectJavaScript") { view: HotwiredVisitableView, script: String ->
        view.injectJavaScript(script)
      }

      AsyncFunction("reload") { view: HotwiredVisitableView ->
        view.reload(displayProgress = true)
      }

      AsyncFunction("refresh") { view: HotwiredVisitableView ->
        view.refresh()
      }

      AsyncFunction("sendAlertResult") { view: HotwiredVisitableView ->
        view.sendAlertResult()
      }

      AsyncFunction("sendConfirmResult") { view: HotwiredVisitableView, result: Boolean ->
        view.sendConfirmResult(result)
      }

      OnViewDestroys { view: HotwiredVisitableView ->
        view.detachWebView()
      }
    }
  }

  private fun session(handle: String): HotwiredSession =
    SessionManager.session(handle) ?: throw NoSessionException(handle)
}
