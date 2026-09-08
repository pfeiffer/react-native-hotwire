package dev.hotwire.core.config

import android.content.Context
import android.webkit.WebView
import dev.hotwire.core.turbo.config.PathConfiguration
import dev.hotwire.core.turbo.http.HotwireHttpClient
import dev.hotwire.core.turbo.offline.OfflineRequestHandler
import dev.hotwire.core.turbo.webview.HotwireWebView

// react-native-hotwired: trimmed from upstream, see VENDOR.md. The bridge component
// registry and JSON converter are gone because bridge components are implemented in
// JavaScript by react-native-hotwired, which also sets the user agent per session.
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
     * Enables/disables debug logging. This should be disabled in production environments.
     */
    var debugLoggingEnabled = false
        set(value) {
            field = value
            HotwireHttpClient.reset()
        }

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
     * The user agent HotwireWebView starts with. react-native-hotwired overrides it
     * per session with one that also lists the JavaScript bridge components.
     */
    fun userAgent(context: Context): String {
        return listOf(
            applicationUserAgentPrefix,
            "Hotwire Native Android; Turbo Native Android;",
            Hotwire.webViewInfo(context).defaultUserAgent
        ).filterNotNull().joinToString(" ")
    }
}
