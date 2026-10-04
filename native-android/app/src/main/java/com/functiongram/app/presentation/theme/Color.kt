package com.functiongram.app.presentation.theme

import androidx.compose.material3.ColorScheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.ui.graphics.Color

val BrandPink = Color(SitePalette.light.primary.toInt())
val BrandPinkBright = Color(SitePalette.light.primaryBright.toInt())
val BrandPinkDeep = Color(SitePalette.light.primaryDeep.toInt())
val BrandPinkRing = Color(SitePalette.light.ring.toInt())
val BrandAccent = Color(SitePalette.light.accent.toInt())
val BrandAccentForeground = Color(SitePalette.light.accentForeground.toInt())
val BrandInk = Color(SitePalette.light.foreground.toInt())
val BrandMuted = Color(SitePalette.light.mutedForeground.toInt())
val BrandCanvas = Color(SitePalette.light.canvas.toInt())
val SplashWhite = Color(SitePalette.light.background.toInt())

internal fun Long.toComposeColor(): Color = Color(this.toInt())

internal fun ThemePalette.toColorScheme(): ColorScheme {
    val seed = if (dark) darkColorScheme() else lightColorScheme()
    return seed.copy(
        primary = primary.toComposeColor(),
        onPrimary = primaryForeground.toComposeColor(),
        primaryContainer = accent.toComposeColor(),
        onPrimaryContainer = accentForeground.toComposeColor(),
        secondary = secondary.toComposeColor(),
        onSecondary = secondaryForeground.toComposeColor(),
        background = canvas.toComposeColor(),
        onBackground = foreground.toComposeColor(),
        surface = card.toComposeColor(),
        onSurface = foreground.toComposeColor(),
        surfaceVariant = muted.toComposeColor(),
        onSurfaceVariant = mutedForeground.toComposeColor(),
        outline = border.toComposeColor(),
        outlineVariant = border.toComposeColor(),
        error = destructive.toComposeColor(),
        onError = primaryForeground.toComposeColor(),
        errorContainer = accent.toComposeColor(),
        onErrorContainer = destructive.toComposeColor(),
    )
}
