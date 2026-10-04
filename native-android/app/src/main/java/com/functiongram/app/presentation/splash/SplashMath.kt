package com.functiongram.app.presentation.splash

import kotlin.math.hypot

/**
 * Radius of the pink ring. At progress 1 it reaches the screen corner
 * (half the diagonal), so the white cover is gone and the interface is visible.
 */
fun splashRevealRadius(widthPx: Float, heightPx: Float, progress: Float): Float {
    val width = if (widthPx.isFinite()) widthPx.coerceAtLeast(0f) else 0f
    val height = if (heightPx.isFinite()) heightPx.coerceAtLeast(0f) else 0f
    val clamped = if (progress.isFinite()) progress.coerceIn(0f, 1f) else 0f
    return hypot(width.toDouble(), height.toDouble()).toFloat() / 2f * clamped
}
