package com.functiongram.dypollabs.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
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
fun NotificationsScreen(
    sessionManager: SessionManager,
    screenInfo: ScreenSizeInfo
) {
    var notifications by remember { mutableStateOf<List<JSONObject>>(emptyList()) }
    var isLoading by remember { mutableStateOf(true) }
    
    val scope = rememberCoroutineScope()
    val socialRepository = remember { SocialRepository(sessionManager) }

    fun loadNotifications() {
        isLoading = true
        scope.launch {
            val result = socialRepository.getActivity()
            result.onSuccess { json ->
                try {
                    val obj = JSONObject(json)
                    val arr = obj.optJSONArray("notifications") ?: obj.optJSONArray("results") ?: JSONArray()
                    val list = mutableListOf<JSONObject>()
                    for (i in 0 until arr.length()) {
                        list.add(arr.getJSONObject(i))
                    }
                    notifications = list
                } catch (e: Exception) {
                    try {
                        val arr = JSONArray(json)
                        val list = mutableListOf<JSONObject>()
                        for (i in 0 until arr.length()) {
                            list.add(arr.getJSONObject(i))
                        }
                        notifications = list
                    } catch (e2: Exception) {
                        notifications = emptyList()
                    }
                }
                isLoading = false
            }.onFailure {
                isLoading = false
            }
        }
    }

    LaunchedEffect(Unit) {
        loadNotifications()
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Notifications", fontWeight = FontWeight.Bold) }
            )
        }
    ) { padding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
        ) {
            when {
                isLoading -> {
                    CircularProgressIndicator(modifier = Modifier.align(Alignment.Center))
                }
                notifications.isEmpty() -> {
                    Column(
                        modifier = Modifier.align(Alignment.Center),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Text("No notifications", fontWeight = FontWeight.Bold, fontSize = 18.sp)
                        Text("You're all caught up!", color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Spacer(modifier = Modifier.height(16.dp))
                        Text("by DYPOL LABS", fontSize = 10.sp, color = Color(0xFF888888), fontWeight = FontWeight.Bold)
                    }
                }
                else -> {
                    LazyColumn(
                        modifier = Modifier.fillMaxSize(),
                        contentPadding = PaddingValues(bottom = 80.dp)
                    ) {
                        items(notifications) { notification ->
                            NotificationItem(notificationJson = notification, screenInfo = screenInfo)
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun NotificationItem(
    notificationJson: JSONObject,
    screenInfo: ScreenSizeInfo
) {
    val kind = notificationJson.optString("kind", "like")
    val username = notificationJson.optString("username", "user")
    val avatar = notificationJson.optString("avatar", "")
    val media = notificationJson.optString("media", "")

    val message = when (kind) {
        "like" -> "liked your post"
        "comment" -> "commented on your post"
        "follow" -> "started following you"
        "tag" -> "tagged you in a post"
        else -> "interacted with your post"
    }

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(
            modifier = Modifier
                .size(44.dp)
                .clip(CircleShape)
                .background(MaterialTheme.colorScheme.surfaceVariant),
            contentAlignment = Alignment.Center
        ) {
            if (avatar.isNotBlank()) {
                AsyncImage(
                    model = avatar,
                    contentDescription = null,
                    modifier = Modifier.fillMaxSize(),
                    contentScale = ContentScale.Crop
                )
            } else {
                Text(username.take(1).uppercase(), fontWeight = FontWeight.Bold, fontSize = 14.sp)
            }
        }

        Spacer(modifier = Modifier.width(12.dp))

        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = "$username $message",
                fontSize = 14.sp,
                maxLines = 2
            )
            Text(
                text = "2h ago",
                fontSize = 12.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }

        if (media.isNotBlank()) {
            AsyncImage(
                model = media,
                contentDescription = null,
                modifier = Modifier
                    .size(44.dp)
                    .clip(androidx.compose.foundation.shape.RoundedCornerShape(4.dp)),
                contentScale = ContentScale.Crop
            )
        }
    }
}
