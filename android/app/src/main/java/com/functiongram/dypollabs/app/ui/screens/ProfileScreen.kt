package com.functiongram.dypollabs.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Settings
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
import com.functiongram.dypollabs.app.data.AuthRepository
import com.functiongram.dypollabs.app.data.SessionManager
import com.functiongram.dypollabs.app.data.SocialRepository
import com.functiongram.dypollabs.app.ui.theme.ScreenSizeInfo
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProfileScreen(
    sessionManager: SessionManager,
    screenInfo: ScreenSizeInfo,
    onLogout: () -> Unit
) {
    var userJson by remember { mutableStateOf<JSONObject?>(null) }
    var posts by remember { mutableStateOf<List<JSONObject>>(emptyList()) }
    var isLoading by remember { mutableStateOf(true) }
    var showLogoutDialog by remember { mutableStateOf(false) }
    
    val scope = rememberCoroutineScope()
    val socialRepository = remember { SocialRepository(sessionManager) }
    val authRepository = remember { AuthRepository(sessionManager) }

    fun loadProfile() {
        isLoading = true
        scope.launch {
            val result = socialRepository.getBootstrap()
            result.onSuccess { json ->
                try {
                    val obj = JSONObject(json)
                    userJson = obj.optJSONObject("me")
                    val postsArray = obj.optJSONArray("posts") ?: JSONArray()
                    val list = mutableListOf<JSONObject>()
                    for (i in 0 until postsArray.length()) {
                        val post = postsArray.getJSONObject(i)
                        // Only my posts
                        if (userJson != null) {
                            val myId = userJson!!.optString("id", "")
                            if (post.optString("author_id", "") == myId) {
                                list.add(post)
                            }
                        }
                    }
                    // If no my posts, show all for demo
                    if (list.isEmpty() && postsArray.length() > 0) {
                        for (i in 0 until minOf(postsArray.length(), 9)) {
                            list.add(postsArray.getJSONObject(i))
                        }
                    }
                    posts = list
                } catch (e: Exception) {
                    // ignore
                }
                isLoading = false
            }.onFailure {
                isLoading = false
            }
        }
    }

    LaunchedEffect(Unit) {
        loadProfile()
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = userJson?.optString("username", "Profile") ?: "Profile",
                        fontWeight = FontWeight.Bold
                    )
                },
                actions = {
                    IconButton(onClick = { showLogoutDialog = true }) {
                        Icon(Icons.Filled.Settings, contentDescription = "Settings")
                    }
                }
            )
        }
    ) { padding ->
        if (isLoading) {
            Box(modifier = Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
        } else {
            LazyVerticalGrid(
                columns = GridCells.Fixed(if (screenInfo.isTablet) 3 else 3),
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding),
                contentPadding = PaddingValues(bottom = 80.dp)
            ) {
                item(span = { androidx.compose.foundation.lazy.grid.GridItemSpan(maxLineSpan) }) {
                    ProfileHeader(
                        userJson = userJson,
                        screenInfo = screenInfo,
                        postCount = posts.size
                    )
                }

                items(posts) { post ->
                    val mediaArray = post.optJSONArray("media")
                    val mediaUrl = if (mediaArray != null && mediaArray.length() > 0) mediaArray.getString(0) else ""
                    
                    Box(
                        modifier = Modifier
                            .aspectRatio(1f)
                            .padding(1.dp)
                            .clip(RoundedCornerShape(4.dp))
                            .background(MaterialTheme.colorScheme.surfaceVariant)
                    ) {
                        if (mediaUrl.isNotBlank()) {
                            AsyncImage(
                                model = mediaUrl,
                                contentDescription = null,
                                modifier = Modifier.fillMaxSize(),
                                contentScale = ContentScale.Crop
                            )
                        }
                    }
                }

                item(span = { androidx.compose.foundation.lazy.grid.GridItemSpan(maxLineSpan) }) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(24.dp),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Text("by", fontSize = 10.sp, color = Color(0xFF888888))
                        Text("DYPOL LABS", fontSize = 12.sp, fontWeight = FontWeight.Bold, color = Color(0xFF888888))
                        Spacer(modifier = Modifier.height(8.dp))
                        Text(
                            "${screenInfo.sizeCategory} • Android 9+ • 3GB RAM • 32GB Storage",
                            fontSize = 10.sp,
                            color = Color.Gray
                        )
                    }
                }
            }
        }
    }

    if (showLogoutDialog) {
        AlertDialog(
            onDismissRequest = { showLogoutDialog = false },
            title = { Text("Logout") },
            text = { Text("Are you sure you want to logout?") },
            confirmButton = {
                TextButton(
                    onClick = {
                        showLogoutDialog = false
                        scope.launch {
                            authRepository.signOut()
                            onLogout()
                        }
                    }
                ) {
                    Text("Logout")
                }
            },
            dismissButton = {
                TextButton(onClick = { showLogoutDialog = false }) {
                    Text("Cancel")
                }
            }
        )
    }
}

@Composable
fun ProfileHeader(
    userJson: JSONObject?,
    screenInfo: ScreenSizeInfo,
    postCount: Int
) {
    val username = userJson?.optString("username", "user") ?: "user"
    val name = userJson?.optString("name", "User") ?: "User"
    val bio = userJson?.optString("bio", "") ?: ""
    val avatar = userJson?.optString("avatar", "") ?: ""
    val followers = userJson?.optInt("followers", 0) ?: 0
    val following = userJson?.optInt("following", 0) ?: 0

    val avatarSize = when {
        screenInfo.diagonalInches >= 6.9 -> 100.dp
        screenInfo.isTablet -> 110.dp
        else -> 86.dp
    }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(16.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                modifier = Modifier
                    .size(avatarSize)
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
                        fontSize = (avatarSize.value * 0.4).sp,
                        fontWeight = FontWeight.Bold
                    )
                }
            }

            Spacer(modifier = Modifier.width(24.dp))

            Row(
                modifier = Modifier.weight(1f),
                horizontalArrangement = Arrangement.SpaceEvenly
            ) {
                ProfileStat(count = postCount, label = "Posts")
                ProfileStat(count = followers, label = "Followers")
                ProfileStat(count = following, label = "Following")
            }
        }

        Spacer(modifier = Modifier.height(12.dp))

        Text(text = name, fontWeight = FontWeight.Bold, fontSize = 14.sp)
        if (bio.isNotBlank()) {
            Spacer(modifier = Modifier.height(4.dp))
            Text(text = bio, fontSize = 14.sp)
        }

        Spacer(modifier = Modifier.height(12.dp))

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            OutlinedButton(
                onClick = { },
                modifier = Modifier.weight(1f),
                shape = RoundedCornerShape(8.dp)
            ) {
                Text("Edit Profile")
            }
            OutlinedButton(
                onClick = { },
                modifier = Modifier.weight(1f),
                shape = RoundedCornerShape(8.dp)
            ) {
                Text("Share Profile")
            }
        }

        Spacer(modifier = Modifier.height(16.dp))
        Divider()
    }
}

@Composable
fun ProfileStat(count: Int, label: String) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(text = "$count", fontWeight = FontWeight.Bold, fontSize = 16.sp)
        Text(text = label, fontSize = 14.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}
