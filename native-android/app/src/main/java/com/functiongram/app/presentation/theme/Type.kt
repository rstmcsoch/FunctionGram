package com.functiongram.app.presentation.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp

/**
 * The website uses system-ui. Android keeps the platform sans (Roboto) and
 * matches the site's sizes, weights, and tracking instead of bundling a web font.
 */
val FunctionGramTypography = Typography(
    headlineLarge = TextStyle(
        fontSize = 31.sp,
        fontWeight = FontWeight.Black,
        letterSpacing = (-1.7).sp,
        lineHeight = 1.15.em,
    ),
    headlineSmall = TextStyle(
        fontSize = 21.sp,
        fontWeight = FontWeight(650),
        letterSpacing = (-0.4).sp,
        lineHeight = 1.3.em,
    ),
    titleLarge = TextStyle(
        fontSize = 17.5.sp,
        fontWeight = FontWeight(650),
        letterSpacing = (-0.3).sp,
        lineHeight = 1.35.em,
    ),
    bodyLarge = TextStyle(
        fontSize = 16.sp,
        fontWeight = FontWeight.Normal,
        lineHeight = 1.5.em,
    ),
    bodyMedium = TextStyle(
        fontSize = 14.sp,
        fontWeight = FontWeight.Normal,
        lineHeight = 1.65.em,
    ),
    labelLarge = TextStyle(
        fontSize = 14.5.sp,
        fontWeight = FontWeight(620),
        lineHeight = 1.4.em,
    ),
)
