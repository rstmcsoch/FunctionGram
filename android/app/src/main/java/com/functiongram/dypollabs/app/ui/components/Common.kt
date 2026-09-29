package com.functiongram.dypollabs.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.functiongram.dypollabs.app.data.Person
import com.functiongram.dypollabs.app.ui.theme.ScreenSizeInfo

@Composable
fun ResponsiveAvatar(
    person: Person?,
    size: Dp = 42.dp,
    screenInfo: ScreenSizeInfo? = null
) {
    val responsiveSize = screenInfo?.let {
        when {
            it.diagonalInches < 5.5 -> size * 0.9f
            it.diagonalInches >= 6.9 -> size * 1.2f
            else -> size
        }
    } ?: size

    Box(
        modifier = Modifier
            .size(responsiveSize)
            .clip(CircleShape)
            .background(MaterialTheme.colorScheme.surfaceVariant),
        contentAlignment = Alignment.Center
    ) {
        if (!person?.avatar.isNullOrBlank()) {
            AsyncImage(
                model = person?.avatar,
                contentDescription = person?.username,
                modifier = Modifier.fillMaxSize(),
                contentScale = ContentScale.Crop
            )
        } else {
            Text(
                text = (person?.name ?: "U").take(1).uppercase(),
                fontWeight = FontWeight.Bold,
                fontSize = (responsiveSize.value * 0.4).sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

@Composable
fun ResponsivePostCard(
    modifier: Modifier = Modifier,
    screenInfo: ScreenSizeInfo,
    content: @Composable () -> Unit
) {
    val horizontalPadding = when {
        screenInfo.isTablet -> 32.dp
        screenInfo.diagonalInches >= 6.9 -> 20.dp
        screenInfo.diagonalInches >= 6.5 -> 16.dp
        else -> 12.dp
    }
    
    val verticalPadding = when {
        screenInfo.diagonalInches >= 6.9 -> 16.dp
        else -> 12.dp
    }

    Card(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = horizontalPadding, vertical = verticalPadding),
        shape = RoundedCornerShape(
            when {
                screenInfo.diagonalInches >= 6.9 -> 16.dp
                else -> 12.dp
            }
        ),
        elevation = CardDefaults.cardElevation(
            defaultElevation = if (screenInfo.isTablet) 4.dp else 2.dp
        )
    ) {
        content()
    }
}

@Composable
fun LoadingIndicator(
    modifier: Modifier = Modifier,
    message: String = "Loading..."
) {
    Column(
        modifier = modifier.fillMaxWidth(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        CircularProgressIndicator(
            color = MaterialTheme.colorScheme.primary
        )
        Spacer(modifier = Modifier.height(16.dp))
        Text(
            text = message,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}

@Composable
fun ErrorMessage(
    message: String,
    modifier: Modifier = Modifier,
    onRetry: (() -> Unit)? = null
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(
            text = message,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.error,
            maxLines = 3,
            overflow = TextOverflow.Ellipsis
        )
        if (onRetry != null) {
            Spacer(modifier = Modifier.height(8.dp))
            Button(onClick = onRetry) {
                Text("Retry")
            }
        }
    }
}

@Composable
fun ResponsiveTopBar(
    title: String,
    screenInfo: ScreenSizeInfo,
    actions: @Composable RowScope.() -> Unit = {}
) {
    val height = when {
        screenInfo.diagonalInches >= 6.9 -> 64.dp
        screenInfo.isTablet -> 72.dp
        else -> 56.dp
    }

    TopAppBar(
        title = {
            Text(
                text = title,
                fontSize = when {
                    screenInfo.diagonalInches >= 6.9 -> 22.sp
                    else -> 20.sp
                },
                fontWeight = FontWeight.Bold
            )
        },
        actions = actions,
        modifier = Modifier.height(height)
    )
}

@Composable
fun WatermarkFooter(
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(
            text = "by",
            fontSize = 10.sp,
            color = Color(0xFF888888),
            fontWeight = FontWeight.Normal
        )
        Text(
            text = "DYPOL LABS",
            fontSize = 12.sp,
            color = Color(0xFF888888),
            fontWeight = FontWeight.Bold,
            letterSpacing = 1.sp
        )
    }
}
