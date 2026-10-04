package com.functiongram.app.presentation.messaging

import android.graphics.Bitmap
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * In-app photo surface. Pinch and pan stay in this composable.
 * It does not open a browser, a custom tab, or a web view.
 */
@Composable
fun PhotoViewer(
    bytes: ByteArray?,
    status: ScreenStatus,
    message: String?,
    onClose: () -> Unit,
    onRetry: () -> Unit,
) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black),
    ) {
        when {
            status == ScreenStatus.Error -> ViewerMessage(
                text = message ?: "Could not open this photo.",
                action = "Try again",
                onAction = onRetry,
            )
            bytes == null -> ViewerBusy("Loading photo")
            else -> ZoomablePhoto(bytes)
        }
        IconButton(
            onClick = onClose,
            modifier = Modifier
                .align(Alignment.TopEnd)
                .statusBarsPadding()
                .padding(8.dp),
        ) {
            Icon(Icons.Outlined.Close, contentDescription = "Close photo", tint = Color.White)
        }
    }
}

@Composable
private fun ZoomablePhoto(bytes: ByteArray) {
    var bitmap by remember(bytes) { mutableStateOf<Bitmap?>(null) }
    var failed by remember(bytes) { mutableStateOf(false) }
    LaunchedEffect(bytes) {
        val decoded = withContext(Dispatchers.Default) { PhotoDecode.decode(bytes) }
        if (decoded == null) failed = true else bitmap = decoded
    }
    val image = bitmap
    if (image == null) {
        if (failed) {
            ViewerMessage(text = "Could not open this photo.", action = null, onAction = {})
        } else {
            ViewerBusy("Loading photo")
        }
        return
    }
    var scale by remember(bytes) { mutableFloatStateOf(PhotoGestures.MIN_SCALE) }
    var panX by remember(bytes) { mutableFloatStateOf(0f) }
    var panY by remember(bytes) { mutableFloatStateOf(0f) }
    BoxWithConstraints(
        modifier = Modifier.fillMaxSize().clipToBounds(),
        contentAlignment = Alignment.Center,
    ) {
        val viewWidth = constraints.maxWidth.toFloat()
        val viewHeight = constraints.maxHeight.toFloat()
        Image(
            bitmap = image.asImageBitmap(),
            contentDescription = "Photo",
            contentScale = ContentScale.Fit,
            modifier = Modifier
                .fillMaxSize()
                .pointerInput(bytes, viewWidth, viewHeight) {
                    detectTransformGestures { _, pan, zoom, _ ->
                        val next = PhotoGestures.nextScale(scale, zoom)
                        val moved = PhotoGestures.clamp(
                            x = panX + pan.x,
                            y = panY + pan.y,
                            scale = next,
                            viewWidth = viewWidth,
                            viewHeight = viewHeight,
                        )
                        scale = next
                        panX = moved.x
                        panY = moved.y
                    }
                }
                .pointerInput(bytes) {
                    detectTapGestures(
                        onDoubleTap = {
                            if (scale > PhotoGestures.MIN_SCALE) {
                                scale = PhotoGestures.MIN_SCALE
                                panX = 0f
                                panY = 0f
                            } else {
                                scale = 2.5f
                            }
                        },
                    )
                }
                .graphicsLayer {
                    scaleX = scale
                    scaleY = scale
                    translationX = panX
                    translationY = panY
                },
        )
    }
}

@Composable
private fun ViewerBusy(text: String) {
    Column(
        modifier = Modifier.fillMaxSize(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = androidx.compose.foundation.layout.Arrangement.Center,
    ) {
        CircularProgressIndicator(color = Color.White)
        Text(text, color = Color.White, modifier = Modifier.padding(top = 12.dp))
    }
}

@Composable
private fun ViewerMessage(text: String, action: String?, onAction: () -> Unit) {
    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = androidx.compose.foundation.layout.Arrangement.Center,
    ) {
        Text(text, color = Color.White, textAlign = TextAlign.Center)
        if (action != null) {
            androidx.compose.material3.TextButton(onClick = onAction) {
                Text(action, color = Color.White)
            }
        }
    }
}
