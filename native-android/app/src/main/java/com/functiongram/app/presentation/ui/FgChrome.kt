package com.functiongram.app.presentation.ui

import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.BookmarkBorder
import androidx.compose.material.icons.outlined.Explore
import androidx.compose.material.icons.outlined.FavoriteBorder
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.Movie
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material.icons.automirrored.outlined.Send
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.ripple
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.functiongram.app.presentation.shell.ShellCatalog
import com.functiongram.app.presentation.shell.ShellDestination
import com.functiongram.app.presentation.theme.ChromeMetrics
import com.functiongram.app.presentation.theme.LocalFgTokens
import com.functiongram.app.presentation.theme.ShellForm
import com.functiongram.app.presentation.theme.SiteMetrics
import com.functiongram.app.presentation.theme.chromeMetrics
import com.functiongram.app.presentation.theme.contentBottomPaddingDp
import com.functiongram.app.presentation.theme.dockGlyphDp
import com.functiongram.app.presentation.theme.headerInsetDp

@Composable
fun FgWordmark(
    compact: Boolean,
    modifier: Modifier = Modifier,
) {
    Text(
        text = "FunctionGram",
        modifier = modifier,
        color = MaterialTheme.colorScheme.onBackground,
        fontSize = if (compact) 25.sp else 31.sp,
        fontWeight = FontWeight.Black,
        letterSpacing = if (compact) (-1.3).sp else (-1.7).sp,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
    )
}

@Composable
fun FunctionGramShell(
    selected: ShellDestination,
    onSelect: (ShellDestination) -> Unit,
    onCreate: () -> Unit,
    content: @Composable (PaddingValues) -> Unit,
) {
    val status = WindowInsets.statusBars.asPaddingValues().calculateTopPadding()
    val navigation = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
    BoxWithConstraints(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background),
    ) {
        val shellWidth = maxWidth
        val shellHeight = maxHeight
        val metrics = chromeMetrics(shellWidth.value, shellHeight.value)
        if (metrics.form == ShellForm.SIDEBAR) {
            Row(Modifier.fillMaxSize()) {
                Sidebar(
                    metrics = metrics,
                    selected = selected,
                    onSelect = onSelect,
                    onCreate = onCreate,
                )
                Box(Modifier.weight(1f).fillMaxHeight()) {
                    content(PaddingValues(top = status, bottom = navigation))
                }
            }
        } else {
            val top = headerInsetDp(metrics, status.value).dp
            val bottom = contentBottomPaddingDp(metrics, navigation.value).dp
            Box(Modifier.fillMaxSize()) {
                content(PaddingValues(top = top, bottom = bottom))
                FloatingHeader(
                    metrics = metrics,
                    statusBar = status,
                    selected = selected,
                    onSelect = onSelect,
                )
                FloatingDock(
                    metrics = metrics,
                    widthDp = shellWidth.value,
                    heightDp = shellHeight.value,
                    navigationBar = navigation,
                    selected = selected,
                    onSelect = onSelect,
                    onCreate = onCreate,
                )
            }
        }
    }
}

@Composable
fun ShellPage(
    padding: PaddingValues,
    content: @Composable () -> Unit,
) {
    BoxWithConstraints(
        modifier = Modifier
            .fillMaxSize()
            .padding(padding),
    ) {
        val width = (maxWidth - 32.dp).coerceAtLeast(0.dp).coerceAtMost(640.dp)
        Column(
            modifier = Modifier
                .width(width)
                .align(Alignment.TopCenter)
                .verticalScroll(rememberScrollState())
                .padding(vertical = 16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            content()
        }
    }
}

@Composable
private fun Sidebar(
    metrics: ChromeMetrics,
    selected: ShellDestination,
    onSelect: (ShellDestination) -> Unit,
    onCreate: () -> Unit,
) {
    val tokens = LocalFgTokens.current
    Column(
        modifier = Modifier
            .width(metrics.sidebarWidthDp.dp)
            .fillMaxHeight()
            .fgGlass(
                shape = RoundedCornerShape(0.dp),
                fill = tokens.glassNav,
                border = tokens.glassBorder,
                highlight = tokens.glassHighlight,
                elevation = 0.dp,
            )
            .padding(WindowInsets.statusBars.asPaddingValues())
            .padding(start = 16.dp, end = 16.dp, top = 24.dp, bottom = 18.dp),
    ) {
        FgWordmark(
            compact = false,
            modifier = Modifier
                .padding(start = 2.dp, bottom = 22.dp)
                .clickable(role = Role.Button, onClick = { onSelect(ShellDestination.HOME) }),
        )
        Column(
            modifier = Modifier
                .weight(1f)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(5.dp),
        ) {
            ShellCatalog.sidebarIds.forEach { id ->
                if (id == ShellCatalog.CREATE_ID) {
                    SidebarRow(
                        label = "Create",
                        icon = Icons.Outlined.Add,
                        active = false,
                        onClick = onCreate,
                    )
                } else {
                    val destination = ShellCatalog.destination(id) ?: return@forEach
                    SidebarRow(
                        label = destination.label,
                        icon = iconFor(destination),
                        active = destination == selected,
                        onClick = { onSelect(destination) },
                    )
                }
            }
        }
    }
}

@Composable
private fun SidebarRow(
    label: String,
    icon: ImageVector,
    active: Boolean,
    onClick: () -> Unit,
) {
    val tokens = LocalFgTokens.current
    val shape = RoundedCornerShape(SiteMetrics.RADIUS_NAV_DP.dp)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(50.dp)
            .clip(shape)
            .background(if (active) tokens.accent else androidx.compose.ui.graphics.Color.Transparent)
            .clickable(role = Role.Tab, onClick = onClick)
            .semantics { selected = active }
            .padding(horizontal = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .padding(end = 8.dp)
                .width(3.5.dp)
                .height(if (active) 26.dp else 0.dp)
                .background(
                    MaterialTheme.colorScheme.primary,
                    RoundedCornerShape(topEnd = 4.dp, bottomEnd = 4.dp),
                ),
        )
        Icon(
            imageVector = icon,
            contentDescription = null,
            modifier = Modifier.size(25.dp),
            tint = if (active) tokens.accentForeground else MaterialTheme.colorScheme.onBackground,
        )
        Text(
            text = label,
            modifier = Modifier.padding(start = 14.dp),
            color = if (active) tokens.accentForeground else MaterialTheme.colorScheme.onBackground,
            fontSize = 15.5.sp,
            fontWeight = if (active) FontWeight(650) else FontWeight(450),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

@Composable
private fun FloatingHeader(
    metrics: ChromeMetrics,
    statusBar: Dp,
    selected: ShellDestination,
    onSelect: (ShellDestination) -> Unit,
) {
    val tokens = LocalFgTokens.current
    val top = maxOf(metrics.headerTopMinDp.dp, statusBar + metrics.headerTopSafeExtraDp.dp)
    val shape = RoundedCornerShape(percent = 50)
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = top)
            .padding(horizontal = metrics.headerGapDp.dp),
        contentAlignment = Alignment.TopCenter,
    ) {
        Row(
            modifier = Modifier
                .widthIn(max = metrics.dockMaxWidthDp.dp)
                .fillMaxWidth()
                .heightIn(min = metrics.headerHeightDp.dp)
                .fgGlass(
                    shape = shape,
                    fill = tokens.dock,
                    border = tokens.dockBorder,
                    highlight = tokens.glassHighlight,
                    elevation = 12.dp,
                )
                .padding(start = 18.dp, end = 8.dp, top = 6.dp, bottom = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            FgWordmark(
                compact = true,
                modifier = Modifier
                    .weight(1f)
                    .clickable(role = Role.Button, onClick = { onSelect(ShellDestination.HOME) }),
            )
            ShellCatalog.headerIds.forEach { id ->
                val destination = ShellCatalog.destination(id) ?: return@forEach
                HeaderAction(
                    destination = destination,
                    active = destination == selected,
                    onClick = { onSelect(destination) },
                )
            }
        }
    }
}

@Composable
private fun HeaderAction(
    destination: ShellDestination,
    active: Boolean,
    onClick: () -> Unit,
) {
    val tokens = LocalFgTokens.current
    Box(
        modifier = Modifier
            .padding(start = 2.dp)
            .size(44.dp)
            .clip(CircleShape)
            .background(if (active) tokens.dockPill else androidx.compose.ui.graphics.Color.Transparent)
            .border(
                width = if (active) 1.dp else 0.dp,
                color = if (active) tokens.dockPillBorder else androidx.compose.ui.graphics.Color.Transparent,
                shape = CircleShape,
            )
            .clickable(role = Role.Button, onClick = onClick)
            .semantics { selected = active },
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            imageVector = iconFor(destination),
            contentDescription = destination.label,
            modifier = Modifier.size(23.dp),
            tint = MaterialTheme.colorScheme.onBackground,
        )
    }
}

@Composable
private fun FloatingDock(
    metrics: ChromeMetrics,
    widthDp: Float,
    heightDp: Float,
    navigationBar: Dp,
    selected: ShellDestination,
    onSelect: (ShellDestination) -> Unit,
    onCreate: () -> Unit,
) {
    val tokens = LocalFgTokens.current
    val bottom = maxOf(SiteMetrics.DOCK_BOTTOM_MIN_DP.dp, navigationBar + SiteMetrics.DOCK_BOTTOM_SAFE_EXTRA_DP.dp)
    val shape = RoundedCornerShape(percent = 50)
    val glyph = dockGlyphDp(widthDp, heightDp).dp
    Box(
        modifier = Modifier
            .fillMaxSize()
            .padding(bottom = bottom)
            .padding(horizontal = 12.dp),
        contentAlignment = Alignment.BottomCenter,
    ) {
        Box(
            modifier = Modifier
                .widthIn(max = metrics.dockMaxWidthDp.dp)
                .fillMaxWidth()
                .height(metrics.dockHeightDp.dp)
                .fgGlass(
                    shape = shape,
                    fill = tokens.dock,
                    border = tokens.dockBorder,
                    highlight = tokens.glassHighlight,
                    elevation = 16.dp,
                )
                .padding(6.dp),
        ) {
            DockRow(
                glyph = glyph,
                selected = selected,
                onSelect = onSelect,
                onCreate = onCreate,
            )
        }
    }
}

@Composable
private fun DockRow(
    glyph: Dp,
    selected: ShellDestination,
    onSelect: (ShellDestination) -> Unit,
    onCreate: () -> Unit,
) {
    val tokens = LocalFgTokens.current
    val slots = ShellCatalog.dockIds
    BoxWithConstraints(Modifier.fillMaxSize()) {
        val itemWidth = if (slots.isEmpty()) maxWidth else maxWidth / slots.size
        val indicator = minOf(48.dp, maxHeight)
        val activeIndex = slots.indexOf(selected.id)
        if (activeIndex >= 0) {
            val target = itemWidth * activeIndex + (itemWidth - indicator) / 2
            val x by animateDpAsState(
                targetValue = target,
                animationSpec = tween(durationMillis = 230),
                label = "dock-indicator",
            )
            Box(
                modifier = Modifier
                    .offset(x = x)
                    .size(indicator)
                    .align(Alignment.CenterStart)
                    .background(tokens.dockPill, CircleShape)
                    .border(1.dp, tokens.dockPillBorder, CircleShape),
            )
        }
        Row(Modifier.fillMaxSize(), verticalAlignment = Alignment.CenterVertically) {
            slots.forEach { id ->
                Box(
                    modifier = Modifier.weight(1f).fillMaxHeight(),
                    contentAlignment = Alignment.Center,
                ) {
                    if (id == ShellCatalog.CREATE_ID) {
                        CreateGlyph(size = glyph, onClick = onCreate)
                    } else {
                        val destination = ShellCatalog.destination(id) ?: return@Box
                        val active = destination == selected
                        val tint = when {
                            active && destination == ShellDestination.HOME -> MaterialTheme.colorScheme.primary
                            active -> MaterialTheme.colorScheme.onBackground
                            else -> MaterialTheme.colorScheme.onSurfaceVariant
                        }
                        Box(
                            modifier = Modifier
                                .size(glyph)
                                .clip(CircleShape)
                                .clickable(
                                    interactionSource = null,
                                    indication = ripple(bounded = false, radius = glyph / 2),
                                    role = Role.Tab,
                                    onClick = { onSelect(destination) },
                                )
                                .semantics { this.selected = active },
                            contentAlignment = Alignment.Center,
                        ) {
                            Icon(
                                imageVector = iconFor(destination),
                                contentDescription = destination.label,
                                modifier = Modifier.size(24.dp),
                                tint = tint,
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun CreateGlyph(size: Dp, onClick: () -> Unit) {
    val tokens = LocalFgTokens.current
    Box(
        modifier = Modifier
            .size(size)
            .clip(CircleShape)
            .background(
                Brush.verticalGradient(
                    0f to tokens.primaryBright,
                    0.55f to MaterialTheme.colorScheme.primary,
                    1f to tokens.primaryDeep,
                ),
            )
            .clickable(role = Role.Button, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            imageVector = Icons.Outlined.Add,
            contentDescription = "Create",
            modifier = Modifier.size(22.dp),
            tint = MaterialTheme.colorScheme.onPrimary,
        )
    }
}

private fun iconFor(destination: ShellDestination): ImageVector = when (destination) {
    ShellDestination.HOME -> Icons.Outlined.Home
    ShellDestination.SEARCH -> Icons.Outlined.Search
    ShellDestination.EXPLORE -> Icons.Outlined.Explore
    ShellDestination.REELS -> Icons.Outlined.Movie
    ShellDestination.MESSAGES -> Icons.AutoMirrored.Outlined.Send
    ShellDestination.NOTIFICATIONS -> Icons.Outlined.FavoriteBorder
    ShellDestination.PROFILE -> Icons.Outlined.Person
    ShellDestination.SAVED -> Icons.Outlined.BookmarkBorder
}
