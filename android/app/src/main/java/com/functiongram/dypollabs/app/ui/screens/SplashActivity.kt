package com.functiongram.dypollabs.app.ui.screens

import android.content.Intent
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.animation.core.*
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import com.functiongram.dypollabs.app.BuildConfig
import com.functiongram.dypollabs.app.MainActivity
import com.functiongram.dypollabs.app.data.DeviceInfoManager
import com.functiongram.dypollabs.app.ui.theme.FunctionGramTheme
import kotlinx.coroutines.delay

class SplashActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        val splashScreen = installSplashScreen()
        super.onCreate(savedInstanceState)

        // Keep splash screen for a minimum duration
        var keepSplash = true
        splashScreen.setKeepOnScreenCondition { keepSplash }

        setContent {
            FunctionGramTheme {
                SplashScreen(
                    onSplashFinished = {
                        keepSplash = false
                        startActivity(Intent(this, MainActivity::class.java))
                        finish()
                    }
                )
            }
        }
    }
}

@Composable
fun SplashScreen(
    onSplashFinished: () -> Unit = {}
) {
    val context = LocalContext.current
    var startAnimation by remember { mutableStateOf(false) }
    val alphaAnim = animateFloatAsState(
        targetValue = if (startAnimation) 1f else 0f,
        animationSpec = tween(durationMillis = 1000),
        label = "alpha"
    )
    val scaleAnim = animateFloatAsState(
        targetValue = if (startAnimation) 1f else 0.8f,
        animationSpec = tween(durationMillis = 1000, easing = FastOutSlowInEasing),
        label = "scale"
    )

    // Device info for responsive adjustments
    val deviceInfo = remember {
        DeviceInfoManager(context).getDeviceInfo()
    }

    // Responsive sizing based on screen size (6.1", 6.5", 6.9" etc)
    val screenInfo = com.functiongram.dypollabs.app.ui.theme.getScreenSizeInfo()
    val logoSize = when {
        screenInfo.diagonalInches < 5.5 -> 100.dp
        screenInfo.diagonalInches < 6.5 -> 120.dp
        else -> 140.dp
    }
    val titleFontSize = when {
        screenInfo.diagonalInches < 5.5 -> 32.sp
        screenInfo.diagonalInches < 6.5 -> 36.sp
        else -> 42.sp
    }

    LaunchedEffect(key1 = true) {
        startAnimation = true
        delay(2000)
        onSplashFinished()
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                brush = Brush.verticalGradient(
                    colors = listOf(
                        Color(0xFF0B0B0E),
                        Color(0xFF1A1A1F),
                        Color(0xFF0B0B0E)
                    )
                )
            ),
        contentAlignment = Alignment.Center
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            Spacer(modifier = Modifier.weight(1f))

            // Logo container - responsive
            Box(
                modifier = Modifier
                    .size(logoSize)
                    .scale(scaleAnim.value)
                    .alpha(alphaAnim.value)
                    .clip(RoundedCornerShape(24.dp))
                    .background(Color(0xFFEF476F)),
                contentAlignment = Alignment.Center
            ) {
                // R logo - enhanced from favicon
                Text(
                    text = "R",
                    fontSize = (logoSize.value * 0.6).sp,
                    fontWeight = FontWeight.Bold,
                    color = Color.White,
                    textAlign = TextAlign.Center
                )
                // Dot
                Box(
                    modifier = Modifier
                        .align(Alignment.BottomEnd)
                        .padding(end = 12.dp, bottom = 12.dp)
                        .size(logoSize * 0.12f)
                        .clip(RoundedCornerShape(50))
                        .background(Color.White)
                )
            }

            Spacer(modifier = Modifier.height(24.dp))

            // RSTMC text
            Text(
                text = "RSTMC",
                fontSize = titleFontSize,
                fontWeight = FontWeight.Bold,
                color = Color.White,
                letterSpacing = 2.sp,
                modifier = Modifier
                    .alpha(alphaAnim.value)
            )

            Spacer(modifier = Modifier.height(8.dp))

            Text(
                text = "FunctionGram",
                fontSize = 18.sp,
                fontWeight = FontWeight.Medium,
                color = Color(0xFF9B9BA7),
                letterSpacing = 1.sp,
                modifier = Modifier.alpha(alphaAnim.value)
            )

            Spacer(modifier = Modifier.weight(1f))

            // Bottom watermark - by DYPOL LABS grey watermark
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(bottom = 32.dp)
                    .alpha(alphaAnim.value * 0.7f)
            ) {
                Text(
                    text = "by",
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Normal,
                    color = Color(0xFF666666),
                    textAlign = TextAlign.Center
                )
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = "DYPOL LABS",
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color(0xFF888888),
                    letterSpacing = 2.sp,
                    textAlign = TextAlign.Center
                )
                Spacer(modifier = Modifier.height(8.dp))
                // Device info for debugging - shows responsive handling
                if (BuildConfig.DEBUG) {
                    Text(
                        text = "${deviceInfo.deviceModel} • ${screenInfo.sizeCategory} • ${"%.1f".format(screenInfo.diagonalInches)}\"",
                        fontSize = 10.sp,
                        color = Color(0xFF444444),
                        textAlign = TextAlign.Center
                    )
                }
            }
        }

        // Loading indicator at bottom
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .align(Alignment.BottomCenter)
                .padding(bottom = 8.dp),
            contentAlignment = Alignment.Center
        ) {
            // Subtle loading animation
            val infiniteTransition = rememberInfiniteTransition(label = "loading")
            val loadingAlpha by infiniteTransition.animateFloat(
                initialValue = 0.3f,
                targetValue = 1f,
                animationSpec = infiniteRepeatable(
                    animation = tween(800),
                    repeatMode = RepeatMode.Reverse
                ),
                label = "loadingAlpha"
            )
            Box(
                modifier = Modifier
                    .width(40.dp)
                    .height(4.dp)
                    .clip(RoundedCornerShape(2.dp))
                    .background(Color(0xFFEF476F).copy(alpha = loadingAlpha))
            )
        }
    }
}
