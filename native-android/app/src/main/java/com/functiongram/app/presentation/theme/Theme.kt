package com.functiongram.app.presentation.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable

private val LightColors = lightColorScheme(
    primary = BrandPink,
    onPrimary = SplashWhite,
    primaryContainer = BrandAccent,
    onPrimaryContainer = BrandAccentForeground,
    secondary = BrandAccentForeground,
    onSecondary = SplashWhite,
    background = SplashWhite,
    onBackground = BrandInk,
    surface = SplashWhite,
    onSurface = BrandInk,
    surfaceVariant = BrandAccent,
    onSurfaceVariant = BrandMuted,
    outline = BrandPinkRing,
)

@Composable
fun FunctionGramTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = LightColors,
        typography = FunctionGramTypography,
        content = content,
    )
}
