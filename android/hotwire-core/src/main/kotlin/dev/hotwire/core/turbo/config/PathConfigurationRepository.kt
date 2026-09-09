package dev.hotwire.core.turbo.config

import android.content.Context
import android.content.SharedPreferences
import androidx.core.content.edit
import dev.hotwire.core.logging.logError
import dev.hotwire.core.turbo.http.HotwireHttpClient
import dev.hotwire.core.turbo.util.dispatcherProvider
import dev.hotwire.core.turbo.util.toJson
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.withContext
import okhttp3.Request

internal class PathConfigurationRepository {
    private val cacheFile = "turbo"

    suspend fun getRemoteConfiguration(
        url: String,
        options: PathConfiguration.LoaderOptions
    ): String? {
        val requestBuilder = Request.Builder().url(url)

        options.httpHeaders.forEach { (key, value) ->
            requestBuilder.header(key, value)
        }

        val request = requestBuilder.build()
        return issueRequest(request)
    }

    fun getBundledConfiguration(
        context: Context,
        filePath: String
    ): String {
        return contentFromAsset(context, filePath)
    }

    fun getCachedConfigurationForUrl(
        context: Context,
        url: String
    ): String? {
        return prefs(context).getString(url, null)
    }

    fun cacheConfigurationForUrl(
        context: Context,
        url: String,
        pathConfiguration: PathConfigurationData
    ) {
        prefs(context).edit {
            putString(url, pathConfiguration.toJson())
        }
    }

    private suspend fun issueRequest(request: Request): String? = try {
        val call = HotwireHttpClient.instance.newCall(request)

        // react-native-hotwire: OkHttp stays on 4.x (React Native pins it), which has no
        // okhttp-coroutines artifact, so the call executes synchronously on the IO dispatcher.
        withContext(dispatcherProvider.io) {
            call.execute().use { response ->
                if (response.isSuccessful) {
                    response.body?.string()
                } else {
                    logError(
                        "remotePathConfigurationFailure",
                        Exception("location: ${request.url}, status code: ${response.code}")
                    )
                    null
                }
            }
        }
    } catch (e: CancellationException) {
        throw e
    } catch (e: Exception) {
        logError("remotePathConfigurationException", e)
        null
    }

    private fun prefs(context: Context): SharedPreferences {
        return context.getSharedPreferences(cacheFile, Context.MODE_PRIVATE)
    }

    private fun contentFromAsset(context: Context, filePath: String): String {
        return context.assets.open(filePath).use {
            String(it.readBytes())
        }
    }
}
