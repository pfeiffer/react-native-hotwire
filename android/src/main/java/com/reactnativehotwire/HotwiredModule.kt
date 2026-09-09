package com.reactnativehotwire

import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

class ProgressViewOffsetRecord : Record {
  @Field val scale: Boolean = false
  @Field val start: Int = 0
  @Field val end: Int = 0
}

class NoSessionException(handle: String) : CodedException("No session with handle \"$handle\"")

class HotwiredModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("Hotwire")

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
