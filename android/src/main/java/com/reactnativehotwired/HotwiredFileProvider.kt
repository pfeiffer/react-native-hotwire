package com.reactnativehotwired

import androidx.core.content.FileProvider

/** Own subclass so the manifest `<provider>` doesn't collide with other libraries'. */
class HotwiredFileProvider : FileProvider()
