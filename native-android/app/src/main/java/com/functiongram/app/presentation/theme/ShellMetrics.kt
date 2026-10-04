package com.functiongram.app.presentation.theme

/**
 * Layout numbers from app/globals.css.
 * CSS pixels are treated as dp: the site's 1080px sidebar breakpoint is the
 * same density-independent switch used here, not a fixed phone width.
 */
enum class ShellForm {
    DOCK,
    SIDEBAR,
}

data class ChromeMetrics(
    val form: ShellForm,
    val dockHeightDp: Int,
    val dockMaxWidthDp: Int,
    val headerHeightDp: Int,
    val headerGapDp: Int,
    val headerTopMinDp: Int,
    val headerTopSafeExtraDp: Int,
    val sidebarWidthDp: Int,
)

object SiteMetrics {
    const val SIDEBAR_MIN_WIDTH_DP = 1081f
    const val SIDEBAR_WIDTH_DP = 252
    const val DOCK_BOTTOM_MIN_DP = 16
    const val DOCK_BOTTOM_SAFE_EXTRA_DP = 12
    const val DOCK_INSET_EXTRA_DP = 24
    const val HEADER_INSET_EXTRA_DP = 12
    const val CONTENT_BOTTOM_EXTRA_DP = 8
    const val MOTION_FAST_MS = 150
    const val MOTION_MS = 200
    const val MOTION_SLOW_MS = 320
    const val SPLASH_REVEAL_MS = 900
    const val SPLASH_HOLD_MS = 180L
    val EASE_CONTROL_POINTS = floatArrayOf(0.2f, 0.7f, 0.3f, 1f)
    const val RADIUS_BUTTON_DP = 13
    const val RADIUS_CARD_DP = 18
    const val RADIUS_DIALOG_DP = 22
    const val RADIUS_FIELD_DP = 12
    const val RADIUS_NAV_DP = 13
}

fun chromeMetrics(widthDp: Float, heightDp: Float): ChromeMetrics {
    val width = if (widthDp.isFinite()) widthDp.coerceAtLeast(0f) else 0f
    val height = if (heightDp.isFinite()) heightDp.coerceAtLeast(0f) else 0f
    val form = if (width >= SiteMetrics.SIDEBAR_MIN_WIDTH_DP) ShellForm.SIDEBAR else ShellForm.DOCK
    val slim = width <= 400f
    val wide = width >= 430f && width <= 1080f
    val shortLandscape = height <= 520f && width <= 1080f
    val dockHeight = when {
        shortLandscape -> 54
        wide -> 64
        slim -> 60
        else -> 62
    }
    val dockMax = when {
        shortLandscape -> 400
        wide -> 480
        else -> 420
    }
    return ChromeMetrics(
        form = form,
        dockHeightDp = dockHeight,
        dockMaxWidthDp = dockMax,
        headerHeightDp = if (shortLandscape) 52 else 58,
        headerGapDp = if (slim) 10 else 12,
        headerTopMinDp = if (shortLandscape) 6 else 8,
        headerTopSafeExtraDp = if (shortLandscape) 4 else 6,
        sidebarWidthDp = SiteMetrics.SIDEBAR_WIDTH_DP,
    )
}

/** CSS --header-inset: header height + header top + 12. */
fun headerInsetDp(metrics: ChromeMetrics, statusBarDp: Float): Float {
    val status = statusBarDp.coerceAtLeast(0f)
    val top = maxOf(metrics.headerTopMinDp.toFloat(), status + metrics.headerTopSafeExtraDp)
    return metrics.headerHeightDp + top + SiteMetrics.HEADER_INSET_EXTRA_DP
}

/** CSS --dock-inset: dock height + bottom gap + 24. */
fun dockInsetDp(metrics: ChromeMetrics, navigationBarDp: Float): Float {
    val navigation = navigationBarDp.coerceAtLeast(0f)
    val bottom = maxOf(
        SiteMetrics.DOCK_BOTTOM_MIN_DP.toFloat(),
        navigation + SiteMetrics.DOCK_BOTTOM_SAFE_EXTRA_DP,
    )
    return metrics.dockHeightDp + bottom + SiteMetrics.DOCK_INSET_EXTRA_DP
}

/** Site main-surface padding adds another 8px under the dock inset. */
fun contentBottomPaddingDp(metrics: ChromeMetrics, navigationBarDp: Float): Float =
    dockInsetDp(metrics, navigationBarDp) + SiteMetrics.CONTENT_BOTTOM_EXTRA_DP

fun dockGlyphDp(widthDp: Float, heightDp: Float): Int {
    val width = widthDp.coerceAtLeast(0f)
    val height = heightDp.coerceAtLeast(0f)
    val shortLandscape = height <= 520f && width <= 1080f
    return when {
        shortLandscape -> 38
        width <= 400f -> 42
        else -> 44
    }
}
