package com.functiongram.app.presentation.splash

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import com.functiongram.app.presentation.theme.BrandPink
import com.functiongram.app.presentation.theme.SplashWhite
import kotlin.math.hypot
import kotlinx.coroutines.delay

private const val REVEAL_MS = 900
private const val HOLD_MS = 180L

/**
 * White frame, then a pink circle that expands from the center until it covers
 * the screen. This is a Compose stub, not a WebView splash.
 */
@Composable
fun SplashRoute(onFinished: () -> Unit) {
    val progress = remember { Animatable(0f) }
    LaunchedEffect(Unit) {
        progress.animateTo(
            targetValue = 1f,
            animationSpec = tween(durationMillis = REVEAL_MS, easing = FastOutSlowInEasing),
        )
        delay(HOLD_MS)
        onFinished()
    }
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(SplashWhite),
    ) {
        Canvas(modifier = Modifier.fillMaxSize()) {
            val radius = hypot(size.width, size.height) / 2f * progress.value
            drawCircle(
                color = BrandPink,
                radius = radius,
                center = center,
            )
        }
    }
}
