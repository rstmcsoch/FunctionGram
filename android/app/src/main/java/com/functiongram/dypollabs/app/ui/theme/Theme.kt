package com.functiongram.dypollabs.app.ui.theme

import android.app.Activity
import android.os.Build
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat

private val DarkColorScheme = darkColorScheme(
    primary = Color(0xFFEB456E),
    onPrimary = Color.White,
    primaryContainer = Color(0xFF9C2A45),
    onPrimaryContainer = Color.White,
    secondary = Color(0xFF9B9BA7),
    onSecondary = Color.Black,
    secondaryContainer = Color(0xFF232329),
    onSecondaryContainer = Color(0xFFF3F3F5),
    tertiary = Color(0xFFEB456E),
    onTertiary = Color.White,
    error = Color(0xFFFF5449),
    background = Color(0xFF0B0B0E),
    onBackground = Color(0xFFF3F3F5),
    surface = Color(0xFF141419),
    onSurface = Color(0xFFF3F3F5),
    surfaceVariant = Color(0xFF232329),
    onSurfaceVariant = Color(0xFF9B9BA7),
    outline = Color(0xFF232329),
    outlineVariant = Color(0xFF1A1A1F),
    scrim = Color(0xFF000000),
    surfaceDim = Color(0xFF0B0B0E),
    surfaceBright = Color(0xFF1E1E24),
    surfaceContainerLowest = Color(0xFF08080A),
    surfaceContainerLow = Color(0xFF141419),
    surfaceContainer = Color(0xFF1C1C22),
    surfaceContainerHigh = Color(0xFF272730),
    surfaceContainerHighest = Color(0xFF32323A)
)

private val LightColorScheme = lightColorScheme(
    primary = Color(0xFFEB456E),
    onPrimary = Color.White,
    primaryContainer = Color(0xFFFFD9DE),
    onPrimaryContainer = Color(0xFF400011),
    secondary = Color(0xFF76565C),
    onSecondary = Color.White,
    secondaryContainer = Color(0xFFFFD9DE),
    onSecondaryContainer = Color(0xFF2C1518),
    tertiary = Color(0xFF7D5636),
    onTertiary = Color.White,
    error = Color(0xFFBA1A1A),
    background = Color(0xFFFFFBFF),
    onBackground = Color(0xFF201A1A),
    surface = Color(0xFFFFFBFF),
    onSurface = Color(0xFF201A1A),
    surfaceVariant = Color(0xFFF4DDDD),
    onSurfaceVariant = Color(0xFF524345),
    outline = Color(0xFF857374),
    outlineVariant = Color(0xFFD6C2C3),
    scrim = Color(0xFF000000),
    surfaceDim = Color(0xFFE4D7D7),
    surfaceBright = Color(0xFFFFFBFF),
    surfaceContainerLowest = Color.White,
    surfaceContainerLow = Color(0xFFFFF0F0),
    surfaceContainer = Color(0xFFFFEAEA),
    surfaceContainerHigh = Color(0xFFFBE4E4),
    surfaceContainerHighest = Color(0xFFF5DEDE)
)

@Composable
fun FunctionGramTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    // Dynamic color is available on Android 12+
    dynamicColor: Boolean = false,
    content: @Composable () -> Unit
) {
    val colorScheme = when {
        dynamicColor && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S -> {
            val context = LocalContext.current
            if (darkTheme) dynamicDarkColorScheme(context) else dynamicLightColorScheme(context)
        }
        darkTheme -> DarkColorScheme
        else -> LightColorScheme
    }
    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as Activity).window
            window.statusBarColor = Color.Transparent.toArgb()
            window.navigationBarColor = Color.Transparent.toArgb()
            WindowCompat.getInsetsController(window, view).isAppearanceLightStatusBars = !darkTheme
            WindowCompat.getInsetsController(window, view).isAppearanceLightNavigationBars = !darkTheme
        }
    }

    MaterialTheme(
        colorScheme = colorScheme,
        typography = Typography,
        content = content
    )
}

// Responsive utilities for different screen sizes (6.1", 6.5", 6.9" etc)
@Composable
fun isTablet(): Boolean {
    val context = LocalContext.current
    val metrics = context.resources.displayMetrics
    val widthDp = metrics.widthPixels / metrics.density
    return widthDp >= 600
}

@Composable
fun isLargeScreen(): Boolean {
    val context = LocalContext.current
    val metrics = context.resources.displayMetrics
    val widthDp = metrics.widthPixels / metrics.density
    val heightDp = metrics.heightPixels / metrics.density
    val diagonalDp = kotlin.math.sqrt((widthDp * widthDp + heightDp * heightDp).toDouble())
    return diagonalDp >= 700 // ~6.5" and above
}

@Composable
fun getScreenSizeInfo(): ScreenSizeInfo {
    val context = LocalContext.current
    val metrics = context.resources.displayMetrics
    val widthPx = metrics.widthPixels
    val heightPx = metrics.heightPixels
    val density = metrics.density
    val widthDp = widthPx / density
    val heightDp = heightPx / density
    val widthInches = widthPx / metrics.xdpi
    val heightInches = heightPx / metrics.ydpi
    val diagonalInches = kotlin.math.sqrt((widthInches * widthInches + heightInches * heightInches).toDouble())

    val sizeCategory = when {
        diagonalInches < 5.0 -> "Small"
        diagonalInches < 6.0 -> "Compact"
        diagonalInches < 6.5 -> "Medium (6.1\")"
        diagonalInches < 7.0 -> "Large (6.5\"-6.9\")"
        else -> "XLarge Tablet"
    }

    return ScreenSizeInfo(
        widthPx = widthPx,
        heightPx = heightPx,
        widthDp = widthDp,
        heightDp = heightDp,
        diagonalInches = diagonalInches,
        sizeCategory = sizeCategory,
        isTablet = widthDp >= 600
    )
}

data class ScreenSizeInfo(
    val widthPx: Int,
    val heightPx: Int,
    val widthDp: Float,
    val heightDp: Float,
    val diagonalInches: Double,
    val sizeCategory: String,
    val isTablet: Boolean
)
