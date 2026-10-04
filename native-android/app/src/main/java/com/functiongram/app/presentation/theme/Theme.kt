package com.functiongram.app.presentation.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.ui.graphics.Color

@Immutable
data class FgTokens(
    val subtle: Color,
    val soft: Color,
    val accent: Color,
    val accentForeground: Color,
    val glassNav: Color,
    val glassStrong: Color,
    val glassSoft: Color,
    val glassBorder: Color,
    val dock: Color,
    val dockBorder: Color,
    val dockPill: Color,
    val dockPillBorder: Color,
    val dockFallback: Color,
    val glassHighlight: Color,
    val primaryBright: Color,
    val primaryDeep: Color,
    val ring: Color,
    val input: Color,
)

internal fun ThemePalette.toTokens(): FgTokens = FgTokens(
    subtle = subtle.toComposeColor(),
    soft = soft.toComposeColor(),
    accent = accent.toComposeColor(),
    accentForeground = accentForeground.toComposeColor(),
    glassNav = glassNav.toComposeColor(),
    glassStrong = glassStrong.toComposeColor(),
    glassSoft = glassSoft.toComposeColor(),
    glassBorder = glassBorder.toComposeColor(),
    dock = dock.toComposeColor(),
    dockBorder = dockBorder.toComposeColor(),
    dockPill = dockPill.toComposeColor(),
    dockPillBorder = dockPillBorder.toComposeColor(),
    dockFallback = dockFallback.toComposeColor(),
    glassHighlight = glassHighlight.toComposeColor(),
    primaryBright = primaryBright.toComposeColor(),
    primaryDeep = primaryDeep.toComposeColor(),
    ring = ring.toComposeColor(),
    input = input.toComposeColor(),
)

val LocalFgTokens = staticCompositionLocalOf { SitePalette.light.toTokens() }

@Composable
fun FunctionGramTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    val palette = SitePalette.forDark(darkTheme)
    MaterialTheme(
        colorScheme = palette.toColorScheme(),
        typography = FunctionGramTypography,
    ) {
        CompositionLocalProvider(LocalFgTokens provides palette.toTokens(), content = content)
    }
}
