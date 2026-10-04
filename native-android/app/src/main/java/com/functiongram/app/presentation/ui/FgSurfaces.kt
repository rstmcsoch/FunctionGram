package com.functiongram.app.presentation.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.functiongram.app.presentation.theme.LocalFgTokens
import com.functiongram.app.presentation.theme.SiteMetrics

/**
 * Translucent surface using the site's glass fills, border, and top highlight.
 * Compose does not sample the backdrop the way CSS backdrop-filter does, so this
 * is not a blurred WebView. Where blur is unavailable the site itself falls back
 * to an opaque fill; [opaqueFallback] is that color.
 */
fun Modifier.fgGlass(
    shape: Shape,
    fill: Color,
    border: Color,
    highlight: Color,
    elevation: Dp = 8.dp,
): Modifier = this
    .shadow(elevation = elevation, shape = shape, clip = false)
    .clip(shape)
    .background(fill)
    .border(width = 1.dp, color = border, shape = shape)
    .drawBehind {
        val inset = 16.dp.toPx()
        if (size.width <= inset * 2f) return@drawBehind
        drawLine(
            color = highlight,
            start = Offset(inset, 0.75.dp.toPx()),
            end = Offset(size.width - inset, 0.75.dp.toPx()),
            strokeWidth = 1.dp.toPx(),
        )
    }

@Composable
fun FgCard(
    modifier: Modifier = Modifier,
    contentPadding: Dp = 16.dp,
    content: @Composable ColumnScope.() -> Unit,
) {
    val shape = RoundedCornerShape(SiteMetrics.RADIUS_CARD_DP.dp)
    Column(
        modifier
            .shadow(elevation = 2.dp, shape = shape)
            .clip(shape)
            .background(MaterialTheme.colorScheme.surface)
            .border(1.dp, MaterialTheme.colorScheme.outline, shape)
            .padding(contentPadding),
        content = content,
    )
}

@Composable
fun FgGlassCard(
    modifier: Modifier = Modifier,
    strong: Boolean = false,
    contentPadding: Dp = 20.dp,
    content: @Composable ColumnScope.() -> Unit,
) {
    val tokens = LocalFgTokens.current
    val shape = RoundedCornerShape(
        if (strong) SiteMetrics.RADIUS_DIALOG_DP.dp else SiteMetrics.RADIUS_CARD_DP.dp,
    )
    Column(
        modifier.fgGlass(
            shape = shape,
            fill = if (strong) tokens.glassStrong else tokens.glassSoft,
            border = tokens.glassBorder,
            highlight = tokens.glassHighlight,
            elevation = if (strong) 16.dp else 6.dp,
        ).padding(contentPadding),
        content = content,
    )
}
