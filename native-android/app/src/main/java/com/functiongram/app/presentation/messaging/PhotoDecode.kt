package com.functiongram.app.presentation.messaging

import android.graphics.Bitmap
import android.graphics.BitmapFactory

object PhotoDecode {
    fun decode(bytes: ByteArray, maxSide: Int = 2048): Bitmap? {
        if (bytes.isEmpty() || maxSide < 1) return null
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null
        var sample = 1
        while (bounds.outWidth / sample > maxSide || bounds.outHeight / sample > maxSide) {
            sample *= 2
        }
        val options = BitmapFactory.Options().apply { inSampleSize = sample }
        return BitmapFactory.decodeByteArray(bytes, 0, bytes.size, options)
    }
}
