package dev.hotwire.core.turbo.visit

import com.google.gson.annotations.SerializedName
import dev.hotwire.core.turbo.util.truncateMiddle
import dev.hotwire.core.turbo.util.withoutNewLineChars
import dev.hotwire.core.turbo.util.withoutRepeatingWhitespace

data class VisitResponse(
    @SerializedName("statusCode") val statusCode: Int,
    @SerializedName("responseHTML") val responseHTML: String? = null,
    // react-native-hotwire: Turbo's flag for a response that came from a redirect.
    @SerializedName("redirected") val redirected: Boolean = false
) {
    override fun toString(): String {
        val response = responseHTML
            ?.withoutNewLineChars()
            ?.withoutRepeatingWhitespace()
            ?.truncateMiddle(maxChars = 50)

        return "VisitResponse(" +
                    "statusCode=$statusCode, " +
                    "responseHTML=$response, " +
                    "responseLength=${responseHTML?.length ?: 0}" +
                ")"
    }
}
