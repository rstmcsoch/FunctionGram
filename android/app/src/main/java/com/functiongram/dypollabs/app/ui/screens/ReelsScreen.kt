package com.functiongram.dypollabs.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.pager.VerticalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.ChatBubble
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.functiongram.dypollabs.app.data.SessionManager
import com.functiongram.dypollabs.app.data.SocialRepository
import com.functiongram.dypollabs.app.ui.theme.ScreenSizeInfo
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ReelsScreen(
    sessionManager: SessionManager,
    screenInfo: ScreenSizeInfo
) {
    var reels by remember { mutableStateOf<List<JSONObject>>(emptyList()) }
    var isLoading by remember { mutableStateOf(true) }
    val scope = rememberCoroutineScope()
    val socialRepository = remember { SocialRepository(sessionManager) }

    fun loadReels() {
        scope.launch {
            val result = socialRepository.getReels()
            result.onSuccess { json ->
                try {
                    val obj = JSONObject(json)
                    val arr = obj.optJSONArray("posts") ?: obj.optJSONArray("results") ?: JSONArray()
                    val list = mutableListOf<JSONObject>()
                    for (i in 0 until arr.length()) {
                        list.add(arr.getJSONObject(i))
                    }
                    reels = list
                    isLoading = false
                } catch (e: Exception) {
                    isLoading = false
                }
            }.onFailure {
                isLoading = false
            }
        }
    }

    LaunchedEffect(Unit) {
        loadReels()
    }

    Box(modifier = Modifier.fillMaxSize().background(Color.Black)) {
        if (isLoading) {
            CircularProgressIndicator(
                modifier = Modifier.align(Alignment.Center),
                color = Color.White
            )
        } else if (reels.isEmpty()) {
            Column(
                modifier = Modifier.align(Alignment.Center),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Text("No reels yet", color = Color.White, fontSize = 18.sp, fontWeight = FontWeight.Bold)
                Text("Create your first reel!", color = Color.Gray, fontSize = 14.sp)
            }
        } else {
            val pagerState = rememberPagerState(pageCount = { reels.size })
            
            VerticalPager(
                state = pagerState,
                modifier = Modifier.fillMaxSize()
            ) { page ->
                val reel = reels[page]
                ReelItem(
                    reelJson = reel,
                    screenInfo = screenInfo,
                    socialRepository = socialRepository
                )
            }
        }

        // Top bar
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .statusBarsPadding()
                .padding(16.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                "Reels",
                color = Color.White,
                fontSize = 20.sp,
                fontWeight = FontWeight.Bold
            )
            Text(
                "${screenInfo.sizeCategory}",
                color = Color.Gray,
                fontSize = 12.sp
            )
        }
    }
}

@Composable
fun ReelItem(
    reelJson: JSONObject,
    screenInfo: ScreenSizeInfo,
    socialRepository: SocialRepository
) {
    val mediaArray = reelJson.optJSONArray("media")
    val mediaUrl = if (mediaArray != null && mediaArray.length() > 0) mediaArray.getString(0) else ""
    val caption = reelJson.optString("caption", "")
    val authorObj = reelJson.optJSONObject("author")
    val username = authorObj?.optString("username", "user") ?: "user"
    val likes = reelJson.optInt("likes", 0)

    Box(modifier = Modifier.fillMaxSize()) {
        // Video/Image background
        if (mediaUrl.isNotBlank()) {
            AsyncImage(
                model = mediaUrl,
                contentDescription = null,
                modifier = Modifier.fillMaxSize(),
                contentScale = ContentScale.Crop
            )
        } else {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(Color.DarkGray)
            )
        }

        // Gradient overlay
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(
                    brush = androidx.compose.ui.graphics.Brush.verticalGradient(
                        colors = listOf(
                            Color.Transparent,
                            Color.Black.copy(alpha = 0.7f)
                        )
                    )
                )
        )

        // Content overlay
        Row(
            modifier = Modifier
                .fillMaxSize()
                .padding(16.dp),
            verticalAlignment = Alignment.Bottom
        ) {
            // Left - user info and caption
            Column(
                modifier = Modifier
                    .weight(1f)
                    .padding(end = 16.dp, bottom = 16.dp)
            ) {
                Text(
                    text = "@$username",
                    color = Color.White,
                    fontWeight = FontWeight.Bold,
                    fontSize = 16.sp
                )
                Spacer(modifier = Modifier.height(8.dp))
                if (caption.isNotBlank()) {
                    Text(
                        text = caption,
                        color = Color.White,
                        fontSize = 14.sp,
                        maxLines = 2
                    )
                }
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = "by DYPOL LABS",
                    color = Color(0xFF888888),
                    fontSize = 10.sp
                )
            }

            // Right - actions
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(20.dp),
                modifier = Modifier.padding(bottom = 16.dp)
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    IconButton(
                        onClick = { },
                        modifier = Modifier
                            .size(48.dp)
                            .clip(CircleShape)
                            .background(Color.White.copy(alpha = 0.2f))
                    ) {
                        Icon(Icons.Filled.Favorite, contentDescription = "Like", tint = Color.White)
                    }
                    Text("$likes", color = Color.White, fontSize = 12.sp)
                }
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    IconButton(
                        onClick = { },
                        modifier = Modifier
                            .size(48.dp)
                            .clip(CircleShape)
                            .background(Color.White.copy(alpha = 0.2f))
                    ) {
                        Icon(Icons.Filled.ChatBubble, contentDescription = "Comment", tint = Color.White)
                    }
                    Text("Comment", color = Color.White, fontSize = 10.sp)
                }
                IconButton(
                    onClick = { },
                    modifier = Modifier
                        .size(48.dp)
                        .clip(CircleShape)
                        .background(Color.White.copy(alpha = 0.2f))
                ) {
                    Icon(Icons.Filled.Share, contentDescription = "Share", tint = Color.White)
                }
            }
        }
    }
}
