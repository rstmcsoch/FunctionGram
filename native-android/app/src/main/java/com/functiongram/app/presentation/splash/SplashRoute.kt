package com.functiongram.app.presentation.splash

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathOperation
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.dp
import com.functiongram.app.R
import com.functiongram.app.presentation.theme.BrandPink
import com.functiongram.app.presentation.theme.SiteMetrics
import com.functiongram.app.presentation.theme.SplashWhite
import kotlinx.coroutines.delay

/**
 * White cover, then a pink ring (site primary) grows from the center until it
 * passes the corners. The hole inside the ring is the interface underneath.
 * This is Compose, not a WebView splash.
 */
@Composable
fun SplashReveal(onFinished: () -> Unit) {
    val progress = remember { Animatable(0f) }
    val easing = CubicBezierEasing(
        SiteMetrics.EASE_CONTROL_POINTS[0],
        SiteMetrics.EASE_CONTROL_POINTS[1],
        SiteMetrics.EASE_CONTROL_POINTS[2],
        SiteMetrics.EASE_CONTROL_POINTS[3],
    )
    LaunchedEffect(Unit) {
        delay(SiteMetrics.SPLASH_HOLD_MS)
        progress.animateTo(
            targetValue = 1f,
            animationSpec = tween(
                durationMillis = SiteMetrics.SPLASH_REVEAL_MS,
                easing = easing,
            ),
        )
        delay(40)
        onFinished()
    }
    val revealed = progress.value
    Box(
        modifier = Modifier
            .fillMaxSize()
            .pointerInput(Unit) {
                awaitPointerEventScope {
                    while (true) {
                        val event = awaitPointerEvent()
                        event.changes.forEach { it.consume() }
                    }
                }
            },
    ) {
        Canvas(modifier = Modifier.fillMaxSize()) {
            val radius = splashRevealRadius(size.width, size.height, revealed)
            val cover = Path()
            val bounds = Path().apply {
                addRect(Rect(0f, 0f, size.width, size.height))
            }
            if (radius <= 0f) {
                cover.addPath(bounds)
            } else {
                val hole = Path().apply {
                    addOval(Rect(center = center, radius = radius))
                }
                cover.op(bounds, hole, PathOperation.Difference)
            }
            drawPath(cover, SplashWhite)
            if (radius > 0f) {
                drawCircle(
                    color = BrandPink,
                    radius = radius,
                    style = Stroke(width = 8.dp.toPx(), cap = StrokeCap.Butt),
                )
            }
        }
        val logoAlpha = (1f - revealed / 0.45f).coerceIn(0f, 1f)
        if (logoAlpha > 0.01f) {
            Image(
                painter = painterResource(R.drawable.fg_mark),
                contentDescription = "FunctionGram",
                contentScale = ContentScale.Fit,
                modifier = Modifier
                    .align(Alignment.Center)
                    .size(88.dp)
                    .graphicsLayer { alpha = logoAlpha },
            )
        }
    }
}
