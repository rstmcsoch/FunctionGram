package com.functiongram.app.presentation.messaging

/**
 * Layout math that does not depend on a device.
 * [remainingImePaddingPx] is the extra space under a screen that already
 * reserved [consumedBottomPx] for the dock or navigation bar.
 */
object MessagingLayout {
    fun remainingImePaddingPx(consumedBottomPx: Int, imeBottomPx: Int): Int {
        require(consumedBottomPx >= 0) { "consumed inset cannot be negative" }
        require(imeBottomPx >= 0) { "ime inset cannot be negative" }
        return (imeBottomPx - consumedBottomPx).coerceAtLeast(0)
    }
}

data class Pan(val x: Float, val y: Float)

object PhotoGestures {
    const val MIN_SCALE = 1f
    const val MAX_SCALE = 5f

    fun nextScale(current: Float, zoom: Float): Float {
        if (!current.isFinite() || !zoom.isFinite() || zoom <= 0f) return MIN_SCALE
        return (current * zoom).coerceIn(MIN_SCALE, MAX_SCALE)
    }

    fun clamp(x: Float, y: Float, scale: Float, viewWidth: Float, viewHeight: Float): Pan {
        if (!scale.isFinite() || scale <= MIN_SCALE) return Pan(0f, 0f)
        if (viewWidth <= 0f || viewHeight <= 0f) return Pan(0f, 0f)
        val maxX = viewWidth * (scale - 1f) / 2f
        val maxY = viewHeight * (scale - 1f) / 2f
        val safeX = if (x.isFinite()) x else 0f
        val safeY = if (y.isFinite()) y else 0f
        return Pan(safeX.coerceIn(-maxX, maxX), safeY.coerceIn(-maxY, maxY))
    }
}
