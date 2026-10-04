package com.functiongram.app.presentation.theme

import kotlin.math.round

/**
 * Color tokens copied from app/globals.css (`:root` and `[data-theme=dark]`).
 * Glass values are the CSS rgba() pairs, not a second palette.
 * The launcher tile uses the favicon fill #ef476f; UI chrome uses --primary #eb456e.
 */
data class ThemePalette(
    val dark: Boolean,
    val background: Long,
    val foreground: Long,
    val card: Long,
    val canvas: Long,
    val primary: Long,
    val primaryForeground: Long,
    val primaryBright: Long,
    val primaryDeep: Long,
    val secondary: Long,
    val secondaryForeground: Long,
    val muted: Long,
    val mutedForeground: Long,
    val accent: Long,
    val accentForeground: Long,
    val destructive: Long,
    val border: Long,
    val input: Long,
    val ring: Long,
    val subtle: Long,
    val soft: Long,
    val popover: Long,
    val glassNav: Long,
    val glassStrong: Long,
    val glassSoft: Long,
    val glassBorder: Long,
    val dock: Long,
    val dockBorder: Long,
    val dockPill: Long,
    val dockPillBorder: Long,
    val dockFallback: Long,
    val glassHighlight: Long,
)

object SitePalette {
    val light: ThemePalette = ThemePalette(
        dark = false,
        background = parseHex("#ffffff"),
        foreground = parseHex("#141417"),
        card = parseHex("#ffffff"),
        canvas = parseHex("#fbfbfc"),
        primary = parseHex("#eb456e"),
        primaryForeground = parseHex("#ffffff"),
        primaryBright = parseHex("#f0507a"),
        primaryDeep = parseHex("#e23b66"),
        secondary = parseHex("#f2f2f5"),
        secondaryForeground = parseHex("#141417"),
        muted = parseHex("#f4f4f6"),
        mutedForeground = parseHex("#86868f"),
        accent = parseHex("#fff0f4"),
        accentForeground = parseHex("#d9325b"),
        destructive = parseHex("#dc2848"),
        border = parseHex("#e9e9ee"),
        input = parseHex("#e2e2e8"),
        ring = parseHex("#ef708e"),
        subtle = parseHex("#a6a6ae"),
        soft = parseHex("#fafafb"),
        popover = parseHex("#ffffff"),
        glassNav = argb(0.64f, "#ffffff"),
        glassStrong = argb(0.80f, "#ffffff"),
        glassSoft = argb(0.50f, "#ffffff"),
        glassBorder = argb(0.075f, "#100a14"),
        dock = argb(0.68f, "#ffffff"),
        dockBorder = argb(0.09f, "#100a14"),
        dockPill = argb(0.95f, "#ffffff"),
        dockPillBorder = argb(0.05f, "#100a14"),
        dockFallback = parseHex("#fbfbfc"),
        glassHighlight = argb(0.55f, "#ffffff"),
    )

    val dark: ThemePalette = ThemePalette(
        dark = true,
        background = parseHex("#0b0b0e"),
        foreground = parseHex("#f3f3f5"),
        card = parseHex("#141419"),
        canvas = parseHex("#08080a"),
        primary = parseHex("#eb456e"),
        primaryForeground = parseHex("#ffffff"),
        primaryBright = parseHex("#f0507a"),
        primaryDeep = parseHex("#e23b66"),
        secondary = parseHex("#232329"),
        secondaryForeground = parseHex("#ececee"),
        muted = parseHex("#1c1c22"),
        mutedForeground = parseHex("#9b9ba7"),
        accent = parseHex("#3a2029"),
        accentForeground = parseHex("#ff7497"),
        destructive = parseHex("#f04362"),
        border = parseHex("#232329"),
        input = parseHex("#37373f"),
        ring = parseHex("#ef708e"),
        subtle = parseHex("#7f7f8b"),
        soft = parseHex("#101014"),
        popover = parseHex("#1c1c22"),
        glassNav = argb(0.60f, "#0f0f14"),
        glassStrong = argb(0.82f, "#16161c"),
        glassSoft = argb(0.50f, "#14141a"),
        glassBorder = argb(0.09f, "#ffffff"),
        dock = argb(0.64f, "#131318"),
        dockBorder = argb(0.12f, "#ffffff"),
        dockPill = argb(0.14f, "#ffffff"),
        dockPillBorder = argb(0.10f, "#ffffff"),
        dockFallback = parseHex("#15151a"),
        glassHighlight = argb(0.09f, "#ffffff"),
    )

    fun forDark(dark: Boolean): ThemePalette = if (dark) this.dark else light

    fun parseHex(input: String): Long {
        val raw = input.trim()
        require(raw.startsWith("#")) { "Expected a #hex color." }
        val hex = raw.substring(1)
        require(hex.length == 6 || hex.length == 8) { "Expected 6 or 8 hex digits." }
        require(hex.all { it.isHexDigit() }) { "Expected hex digits." }
        val value = hex.toLong(16)
        return if (hex.length == 6) 0xFF000000L or value else value
    }

    /** CSS rgba() as AARRGGBB. Alpha is rounded the same way a browser stores 8-bit alpha. */
    fun argb(alpha: Float, rgbHex: String): Long {
        require(alpha in 0f..1f) { "Alpha must be between 0 and 1." }
        val rgb = parseHex(rgbHex) and 0xFFFFFFL
        val channel = round(alpha * 255f).toLong()
        return (channel shl 24) or rgb
    }

    private fun Char.isHexDigit(): Boolean =
        this in '0'..'9' || this in 'a'..'f' || this in 'A'..'F'
}
