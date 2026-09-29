package com.functiongram.dypollabs.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.Bookmark
import androidx.compose.material.icons.filled.BookmarkBorder
import androidx.compose.material.icons.filled.ChatBubbleOutline
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.functiongram.dypollabs.app.data.SessionManager
import com.functiongram.dypollabs.app.data.SocialRepository
import com.functiongram.dypollabs.app.ui.components.ErrorMessage
import com.functiongram.dypollabs.app.ui.components.LoadingIndicator
import com.functiongram.dypollabs.app.ui.components.ResponsiveAvatar
import com.functiongram.dypollabs.app.ui.theme.ScreenSizeInfo
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FeedScreen(
    sessionManager: SessionManager,
    screenInfo: ScreenSizeInfo,
    onNavigateToProfile: (String) -> Unit = {},
    onNavigateToCreate: () -> Unit = {}
) {
    var postsJson by remember { mutableStateOf<String?>(null) }
    var isLoading by remember { mutableStateOf(true) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var feedData by remember { mutableStateOf<List<JSONObject>>(emptyList()) }
    
    val scope = rememberCoroutineScope()
    val socialRepository = remember { SocialRepository(sessionManager) }

    fun loadFeed() {
        isLoading = true
        errorMessage = null
        scope.launch {
            val result = socialRepository.getBootstrap()
            result.onSuccess { json ->
                postsJson = json
                try {
                    val obj = JSONObject(json)
                    val postsArray = obj.optJSONArray("posts") ?: JSONArray()
                    val list = mutableListOf<JSONObject>()
                    for (i in 0 until postsArray.length()) {
                        list.add(postsArray.getJSONObject(i))
                    }
                    feedData = list
                } catch (e: Exception) {
                    // Fallback: try to parse as array directly
                    try {
                        val arr = JSONArray(json)
                        val list = mutableListOf<JSONObject>()
                        for (i in 0 until arr.length()) {
                            list.add(arr.getJSONObject(i))
                        }
                        feedData = list
                    } catch (e2: Exception) {
                        errorMessage = "Failed to parse feed: ${e.message}"
                    }
                }
                isLoading = false
            }.onFailure { error ->
                errorMessage = error.message ?: "Failed to load feed"
                isLoading = false
            }
        }
    }

    LaunchedEffect(Unit) {
        loadFeed()
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(
                            modifier = Modifier
                                .size(36.dp)
                                .clip(RoundedCornerShape(8.dp))
                                .background(Color(0xFFEF476F)),
                            contentAlignment = Alignment.Center
                        ) {
                            Text("R", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 18.sp)
                        }
                        Spacer(modifier = Modifier.width(8.dp))
                        Column {
                            Text(
                                "FunctionGram",
                                fontWeight = FontWeight.Bold,
                                fontSize = if (screenInfo.diagonalInches >= 6.9) 20.sp else 18.sp
                            )
                            Text(
                                "${screenInfo.sizeCategory} • ${screenInfo.widthPx}x${screenInfo.heightPx}",
                                fontSize = 10.sp,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                },
                actions = {
                    // Responsive action icons
                    val iconSize = if (screenInfo.diagonalInches >= 6.9) 28.dp else 24.dp
                    IconButton(onClick = { loadFeed() }) {
                        Icon(Icons.Filled.Favorite, contentDescription = "Notifications", modifier = Modifier.size(iconSize))
                    }
                }
            )
        },
        floatingActionButton = {
            FloatingActionButton(
                onClick = onNavigateToCreate,
                containerColor = Color(0xFFEF476F)
            ) {
                Text("+", fontSize = 24.sp, color = Color.White, fontWeight = FontWeight.Bold)
            }
        }
    ) { padding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
        ) {
            when {
                isLoading -> {
                    LoadingIndicator(modifier = Modifier.align(Alignment.Center))
                }
                errorMessage != null -> {
                    ErrorMessage(
                        message = errorMessage!!,
                        modifier = Modifier.align(Alignment.Center),
                        onRetry = { loadFeed() }
                    )
                }
                feedData.isEmpty() -> {
                    Column(
                        modifier = Modifier
                            .align(Alignment.Center)
                            .padding(24.dp),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Text(
                            "No posts yet",
                            style = MaterialTheme.typography.headlineSmall,
                            fontWeight = FontWeight.Bold
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        Text(
                            "Follow people or create your first post!",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        Spacer(modifier = Modifier.height(16.dp))
                        Button(onClick = onNavigateToCreate) {
                            Text("Create Post")
                        }
                    }
                }
                else -> {
                    LazyColumn(
                        modifier = Modifier.fillMaxSize(),
                        contentPadding = PaddingValues(
                            bottom = 80.dp,
                            top = if (screenInfo.isTablet) 16.dp else 8.dp
                        )
                    ) {
                        // Stories row - horizontal
                        item {
                            StoriesRow(screenInfo = screenInfo)
                        }

                        items(feedData) { postJson ->
                            PostCard(
                                postJson = postJson,
                                screenInfo = screenInfo,
                                socialRepository = socialRepository,
                                onProfileClick = onNavigateToProfile
                            )
                        }

                        item {
                            // Watermark footer
                            Column(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(24.dp),
                                horizontalAlignment = Alignment.CenterHorizontally
                            ) {
                                Text(
                                    "by",
                                    fontSize = 10.sp,
                                    color = Color(0xFF888888)
                                )
                                Text(
                                    "DYPOL LABS",
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = Color(0xFF888888),
                                    letterSpacing = 1.sp
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun StoriesRow(screenInfo: ScreenSizeInfo) {
    val storySize = when {
        screenInfo.diagonalInches >= 6.9 -> 72.dp
        screenInfo.isTablet -> 80.dp
        else -> 64.dp
    }

    Column(modifier = Modifier.padding(vertical = 8.dp)) {
        androidx.compose.foundation.lazy.LazyRow(
            contentPadding = PaddingValues(horizontal = 16.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            items(8) { index ->
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Box(
                        modifier = Modifier
                            .size(storySize)
                            .clip(CircleShape)
                            .background(
                                brush = androidx.compose.ui.graphics.Brush.linearGradient(
                                    colors = listOf(Color(0xFFEF476F), Color(0xFFFF8A65))
                                )
                            )
                            .padding(3.dp)
                            .clip(CircleShape)
                            .background(MaterialTheme.colorScheme.surface)
                            .padding(2.dp)
                            .clip(CircleShape)
                            .background(MaterialTheme.colorScheme.surfaceVariant),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = "U$index",
                            fontWeight = FontWeight.Bold,
                            fontSize = 12.sp
                        )
                    }
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = "user$index",
                        fontSize = 11.sp,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
            }
        }
        Divider(modifier = Modifier.padding(top = 12.dp))
    }
}

@Composable
fun PostCard(
    postJson: JSONObject,
    screenInfo: ScreenSizeInfo,
    socialRepository: SocialRepository,
    onProfileClick: (String) -> Unit
) {
    val authorId = postJson.optString("author_id", "")
    val caption = postJson.optString("caption", "")
    val mediaArray = postJson.optJSONArray("media")
    val mediaUrl = if (mediaArray != null && mediaArray.length() > 0) mediaArray.getString(0) else ""
    val likes = postJson.optInt("likes", 0)
    val liked = postJson.optInt("liked", 0) == 1
    val saved = postJson.optInt("saved", 0) == 1
    val commentCount = postJson.optInt("comment_count", 0)
    val location = postJson.optString("location", "")
    
    // Author info
    val authorObj = postJson.optJSONObject("author")
    val username = authorObj?.optString("username", "user") ?: postJson.optString("username", "user")
    val avatar = authorObj?.optString("avatar", "") ?: ""
    val name = authorObj?.optString("name", username) ?: username

    var isLiked by remember { mutableStateOf(liked) }
    var likeCount by remember { mutableStateOf(likes) }
    var isSaved by remember { mutableStateOf(saved) }
    val scope = rememberCoroutineScope()

    val cardPadding = when {
        screenInfo.isTablet -> 20.dp
        screenInfo.diagonalInches >= 6.9 -> 16.dp
        else -> 0.dp
    }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = cardPadding, vertical = 6.dp),
        shape = RoundedCornerShape(if (screenInfo.isTablet) 16.dp else 0.dp),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surface
        ),
        elevation = CardDefaults.cardElevation(
            defaultElevation = if (screenInfo.isTablet) 2.dp else 0.dp
        )
    ) {
        Column {
            // Header
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(12.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Box(
                    modifier = Modifier
                        .size(40.dp)
                        .clip(CircleShape)
                        .background(MaterialTheme.colorScheme.surfaceVariant),
                    contentAlignment = Alignment.Center
                ) {
                    if (avatar.isNotBlank()) {
                        AsyncImage(
                            model = avatar,
                            contentDescription = username,
                            modifier = Modifier.fillMaxSize(),
                            contentScale = ContentScale.Crop
                        )
                    } else {
                        Text(
                            text = name.take(1).uppercase(),
                            fontWeight = FontWeight.Bold
                        )
                    }
                }
                Spacer(modifier = Modifier.width(10.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = username,
                        fontWeight = FontWeight.Bold,
                        fontSize = 14.sp,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                    if (location.isNotBlank()) {
                        Text(
                            text = location,
                            fontSize = 12.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    }
                }
                IconButton(onClick = { }) {
                    Icon(Icons.Filled.MoreVert, contentDescription = "More")
                }
            }

            // Media - responsive height based on screen size
            if (mediaUrl.isNotBlank()) {
                val mediaHeight = when {
                    screenInfo.isTablet -> 500.dp
                    screenInfo.diagonalInches >= 6.9 -> 450.dp
                    screenInfo.diagonalInches >= 6.5 -> 400.dp
                    else -> 350.dp
                }
                
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(mediaHeight)
                        .background(MaterialTheme.colorScheme.surfaceVariant)
                ) {
                    AsyncImage(
                        model = mediaUrl,
                        contentDescription = caption,
                        modifier = Modifier.fillMaxSize(),
                        contentScale = ContentScale.Crop
                    )
                }
            }

            // Actions
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 8.dp, vertical = 4.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                IconButton(
                    onClick = {
                        val newLiked = !isLiked
                        isLiked = newLiked
                        likeCount = if (newLiked) likeCount + 1 else likeCount - 1
                        scope.launch {
                            socialRepository.likePost(postJson.optString("id", ""), newLiked)
                        }
                    }
                ) {
                    Icon(
                        imageVector = if (isLiked) Icons.Filled.Favorite else Icons.Filled.FavoriteBorder,
                        contentDescription = "Like",
                        tint = if (isLiked) Color(0xFFEF476F) else MaterialTheme.colorScheme.onSurface,
                        modifier = Modifier.size(if (screenInfo.diagonalInches >= 6.9) 28.dp else 24.dp)
                    )
                }
                IconButton(onClick = { }) {
                    Icon(
                        Icons.Filled.ChatBubbleOutline,
                        contentDescription = "Comment",
                        modifier = Modifier.size(if (screenInfo.diagonalInches >= 6.9) 28.dp else 24.dp)
                    )
                }
                Spacer(modifier = Modifier.weight(1f))
                IconButton(
                    onClick = {
                        isSaved = !isSaved
                        scope.launch {
                            socialRepository.savePost(postJson.optString("id", ""), isSaved)
                        }
                    }
                ) {
                    Icon(
                        imageVector = if (isSaved) Icons.Filled.Bookmark else Icons.Filled.BookmarkBorder,
                        contentDescription = "Save",
                        modifier = Modifier.size(if (screenInfo.diagonalInches >= 6.9) 28.dp else 24.dp)
                    )
                }
            }

            // Likes and caption
            Column(
                modifier = Modifier.padding(horizontal = 12.dp, vertical = 4.dp)
            ) {
                if (likeCount > 0) {
                    Text(
                        text = "$likeCount likes",
                        fontWeight = FontWeight.Bold,
                        fontSize = 14.sp
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                }
                if (caption.isNotBlank()) {
                    Text(
                        text = "$username $caption",
                        fontSize = 14.sp,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis
                    )
                }
                if (commentCount > 0) {
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = "View all $commentCount comments",
                        fontSize = 14.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
                Spacer(modifier = Modifier.height(8.dp))
            }
        }
    }
}
