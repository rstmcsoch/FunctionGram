package com.functiongram.app

import com.functiongram.app.presentation.shell.ShellCatalog
import com.functiongram.app.presentation.shell.ShellDestination
import com.functiongram.app.presentation.splash.splashRevealRadius
import com.functiongram.app.presentation.theme.ShellForm
import com.functiongram.app.presentation.theme.SiteMetrics
import com.functiongram.app.presentation.theme.SitePalette
import com.functiongram.app.presentation.theme.chromeMetrics
import com.functiongram.app.presentation.theme.contentBottomPaddingDp
import com.functiongram.app.presentation.theme.dockGlyphDp
import com.functiongram.app.presentation.theme.headerInsetDp
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertThrows
import org.junit.Test
import kotlin.math.hypot

class ThemeSystemTest {
    @Test
    fun primaryMatchesTheWebsiteTokenInBothThemes() {
        assertEquals(0xFFEB456EL, SitePalette.parseHex("#eb456e"))
        assertEquals(0xFFEB456EL, SitePalette.parseHex("#EB456E"))
        assertEquals(SitePalette.parseHex("#eb456e"), SitePalette.light.primary)
        assertEquals(SitePalette.light.primary, SitePalette.dark.primary)
        assertEquals(SitePalette.parseHex("#f0507a"), SitePalette.light.primaryBright)
        assertEquals(SitePalette.parseHex("#e23b66"), SitePalette.light.primaryDeep)
        assertEquals(SitePalette.parseHex("#ef708e"), SitePalette.light.ring)
    }

    @Test
    fun darkSurfacesAreNotTheLightSurfaces() {
        assertEquals(SitePalette.parseHex("#ffffff"), SitePalette.light.background)
        assertEquals(SitePalette.parseHex("#0b0b0e"), SitePalette.dark.background)
        assertEquals(SitePalette.parseHex("#fbfbfc"), SitePalette.light.canvas)
        assertEquals(SitePalette.parseHex("#08080a"), SitePalette.dark.canvas)
        assertEquals(SitePalette.parseHex("#141419"), SitePalette.dark.card)
        assertNotEquals(SitePalette.light.background, SitePalette.dark.background)
        assertNotEquals(SitePalette.light.mutedForeground, SitePalette.dark.mutedForeground)
        assertEquals(SitePalette.dark, SitePalette.forDark(true))
        assertEquals(SitePalette.light, SitePalette.forDark(false))
    }

    @Test
    fun glassAlphasMatchTheCssRgbaValues() {
        assertEquals(0xA3FFFFFFL, SitePalette.argb(0.64f, "#ffffff"))
        assertEquals(SitePalette.argb(0.64f, "#ffffff"), SitePalette.light.glassNav)
        assertEquals(SitePalette.argb(0.80f, "#ffffff"), SitePalette.light.glassStrong)
        assertEquals(SitePalette.argb(0.50f, "#ffffff"), SitePalette.light.glassSoft)
        assertEquals(SitePalette.argb(0.68f, "#ffffff"), SitePalette.light.dock)
        assertEquals(SitePalette.argb(0.075f, "#100a14"), SitePalette.light.glassBorder)
        assertEquals(SitePalette.argb(0.09f, "#100a14"), SitePalette.light.dockBorder)
        assertEquals(SitePalette.argb(0.60f, "#0f0f14"), SitePalette.dark.glassNav)
        assertEquals(SitePalette.argb(0.64f, "#131318"), SitePalette.dark.dock)
        assertEquals(SitePalette.argb(0.14f, "#ffffff"), SitePalette.dark.dockPill)
        assertEquals(SitePalette.parseHex("#15151a"), SitePalette.dark.dockFallback)
        assertNotEquals(SitePalette.light.dock, SitePalette.dark.dock)
    }

    @Test
    fun hexParserRejectsValuesThatAreNotCssColors() {
        assertThrows(IllegalArgumentException::class.java) { SitePalette.parseHex("eb456e") }
        assertThrows(IllegalArgumentException::class.java) { SitePalette.parseHex("#abc") }
        assertThrows(IllegalArgumentException::class.java) { SitePalette.parseHex("#gggggg") }
        assertThrows(IllegalArgumentException::class.java) { SitePalette.argb(1.1f, "#ffffff") }
        assertThrows(IllegalArgumentException::class.java) { SitePalette.argb(-0.01f, "#ffffff") }
    }

    @Test
    fun shellChromeFollowsTheSiteBreakpoints() {
        val phone = chromeMetrics(360f, 800f)
        assertEquals(ShellForm.DOCK, phone.form)
        assertEquals(60, phone.dockHeightDp)
        assertEquals(420, phone.dockMaxWidthDp)
        assertEquals(10, phone.headerGapDp)
        assertEquals(58, phone.headerHeightDp)
        assertEquals(42, dockGlyphDp(360f, 800f))

        val between = chromeMetrics(410f, 800f)
        assertEquals(62, between.dockHeightDp)
        assertEquals(420, between.dockMaxWidthDp)
        assertEquals(12, between.headerGapDp)
        assertEquals(44, dockGlyphDp(410f, 800f))

        val tablet = chromeMetrics(800f, 1200f)
        assertEquals(ShellForm.DOCK, tablet.form)
        assertEquals(64, tablet.dockHeightDp)
        assertEquals(480, tablet.dockMaxWidthDp)

        val landscape = chromeMetrics(700f, 480f)
        assertEquals(ShellForm.DOCK, landscape.form)
        assertEquals(54, landscape.dockHeightDp)
        assertEquals(400, landscape.dockMaxWidthDp)
        assertEquals(52, landscape.headerHeightDp)
        assertEquals(6, landscape.headerTopMinDp)
        assertEquals(4, landscape.headerTopSafeExtraDp)
        assertEquals(38, dockGlyphDp(700f, 480f))

        assertEquals(ShellForm.DOCK, chromeMetrics(1080f, 800f).form)
        val desktop = chromeMetrics(1081f, 800f)
        assertEquals(ShellForm.SIDEBAR, desktop.form)
        assertEquals(SiteMetrics.SIDEBAR_WIDTH_DP, desktop.sidebarWidthDp)
        assertEquals(252, desktop.sidebarWidthDp)
    }

    @Test
    fun contentInsetsClearTheFloatingChrome() {
        val phone = chromeMetrics(360f, 800f)
        assertEquals(58f + 8f + 12f, headerInsetDp(phone, 0f), 0.01f)
        assertEquals(58f + (24f + 6f) + 12f, headerInsetDp(phone, 24f), 0.01f)
        assertEquals(60f + 16f + 24f + 8f, contentBottomPaddingDp(phone, 0f), 0.01f)
        assertEquals(60f + (20f + 12f) + 24f + 8f, contentBottomPaddingDp(phone, 20f), 0.01f)

        val landscape = chromeMetrics(700f, 480f)
        assertEquals(52f + 6f + 12f, headerInsetDp(landscape, 0f), 0.01f)
        assertEquals(52f + (10f + 4f) + 12f, headerInsetDp(landscape, 10f), 0.01f)
    }

    @Test
    fun motionTokensMatchTheStylesheet() {
        assertEquals(150, SiteMetrics.MOTION_FAST_MS)
        assertEquals(200, SiteMetrics.MOTION_MS)
        assertEquals(320, SiteMetrics.MOTION_SLOW_MS)
        assertEquals(900, SiteMetrics.SPLASH_REVEAL_MS)
        assertEquals(180L, SiteMetrics.SPLASH_HOLD_MS)
        assertEquals(0.2f, SiteMetrics.EASE_CONTROL_POINTS[0], 0.0001f)
        assertEquals(0.7f, SiteMetrics.EASE_CONTROL_POINTS[1], 0.0001f)
        assertEquals(0.3f, SiteMetrics.EASE_CONTROL_POINTS[2], 0.0001f)
        assertEquals(1f, SiteMetrics.EASE_CONTROL_POINTS[3], 0.0001f)
    }

    @Test
    fun revealRadiusGrowsFromTheCenterToTheCorner() {
        assertEquals(0f, splashRevealRadius(200f, 100f, 0f), 0.01f)
        val corner = hypot(200.0, 100.0).toFloat() / 2f
        assertEquals(corner, splashRevealRadius(200f, 100f, 1f), 0.01f)
        assertEquals(corner / 2f, splashRevealRadius(200f, 100f, 0.5f), 0.01f)
        assertEquals(corner, splashRevealRadius(200f, 100f, 2f), 0.01f)
        assertEquals(0f, splashRevealRadius(200f, 100f, Float.NaN), 0.01f)
    }

    @Test
    fun navigationOrderMatchesTheWebsiteDefaults() {
        assertEquals(
            listOf("home", "search", "explore", "create", "reels", "profile"),
            ShellCatalog.dockIds,
        )
        assertEquals(listOf("messages", "notifications"), ShellCatalog.headerIds)
        assertEquals(
            listOf(
                "home",
                "search",
                "explore",
                "reels",
                "messages",
                "notifications",
                "create",
                "profile",
                "saved",
            ),
            ShellCatalog.sidebarIds,
        )
        assertEquals(ShellDestination.HOME, ShellCatalog.destination("home"))
        assertEquals(null, ShellCatalog.destination("create"))
    }
}
