package dev.hotwire.core.config

import android.content.Context
import android.webkit.WebView
import dev.hotwire.core.logging.DefaultHotwireLogger
import dev.hotwire.core.logging.HotwireLogger
import dev.hotwire.core.turbo.config.PathConfiguration
import dev.hotwire.core.turbo.offline.OfflineRequestHandler
import dev.hotwire.core.turbo.webview.HotwireWebView

// react-native-hotwire: trimmed from upstream, see VENDOR.md. The bridge component
// registry and JSON converter are gone because bridge components are implemented in
// JavaScript by react-native-hotwire, which also sets the user agent per session.
class HotwireConfig internal constructor() {
    /**
     * The path configuration that defines your navigation rules.
     */
    val pathConfiguration = PathConfiguration()

    /**
     * Experimental: API may be removed, not ready for production use.
     */
    var offlineRequestHandler: OfflineRequestHandler? = null

    /**
     * The logger used by the library. Replace to route logs elsewhere.
     */
    var logger: HotwireLogger = DefaultHotwireLogger

    /**
     * Enables/disables debugging of web contents loaded into WebViews.
     */
    var webViewDebuggingEnabled = false
        set(value) {
            field = value
            WebView.setWebContentsDebuggingEnabled(value)
        }

    /**
     * Called whenever a new WebView instance needs to be (re)created.
     */
    var makeCustomWebView: (context: Context) -> HotwireWebView = { context ->
        HotwireWebView(context, null)
    }

    /**
     * Set a custom user agent application prefix for every WebView instance.
     */
    var applicationUserAgentPrefix: String? = null

    /**
     * The user agent HotwireWebView starts with. react-native-hotwire overrides it
     * per session with one that also lists the JavaScript bridge components.
     */
    val userAgent: String get() {
        return listOf(
            applicationUserAgentPrefix,
            "Hotwire Native Android; Turbo Native Android;"
        ).filterNotNull().joinToString(" ")
    }

    fun userAgentWithWebViewDefault(context: Context): String {
        return "$userAgent ${Hotwire.webViewInfo(context).defaultUserAgent}"
    }
}
