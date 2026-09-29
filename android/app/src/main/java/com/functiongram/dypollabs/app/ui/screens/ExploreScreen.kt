package com.functiongram.dypollabs.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Search
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
import com.functiongram.dypollabs.app.ui.components.LoadingIndicator
import com.functiongram.dypollabs.app.ui.theme.ScreenSizeInfo
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ExploreScreen(
    sessionManager: SessionManager,
    screenInfo: ScreenSizeInfo,
    initialIsSearch: Boolean = false
) {
    var searchQuery by remember { mutableStateOf("") }
    var isSearchMode by remember { mutableStateOf(initialIsSearch) }
    var posts by remember { mutableStateOf<List<JSONObject>>(emptyList()) }
    var isLoading by remember { mutableStateOf(true) }
    
    val scope = rememberCoroutineScope()
    val socialRepository = remember { SocialRepository(sessionManager) }

    val columns = when {
        screenInfo.isTablet -> 3
        screenInfo.diagonalInches >= 6.9 -> 3
        else -> 3
    }

    fun loadExplore() {
        isLoading = true
        scope.launch {
            val result = socialRepository.getExplore()
            result.onSuccess { json ->
                try {
                    val obj = JSONObject(json)
                    val arr = obj.optJSONArray("posts") ?: obj.optJSONArray("results") ?: JSONArray(json)
                    val list = mutableListOf<JSONObject>()
                    for (i in 0 until arr.length()) {
                        try {
                            list.add(arr.getJSONObject(i))
                        } catch (e: Exception) {
                            // Skip invalid
                        }
                    }
                    posts = list
                } catch (e: Exception) {
                    try {
                        val arr = JSONArray(json)
                        val list = mutableListOf<JSONObject>()
                        for (i in 0 until arr.length()) {
                            list.add(arr.getJSONObject(i))
                        }
                        posts = list
                    } catch (e2: Exception) {
                        posts = emptyList()
                    }
                }
                isLoading = false
            }.onFailure {
                isLoading = false
            }
        }
    }

    fun performSearch(query: String) {
        if (query.length < 2) return
        isLoading = true
        scope.launch {
            val result = socialRepository.search(query)
            result.onSuccess { json ->
                try {
                    val obj = JSONObject(json)
                    val postsArray = obj.optJSONArray("posts") ?: JSONArray()
                    val list = mutableListOf<JSONObject>()
                    for (i in 0 until postsArray.length()) {
                        list.add(postsArray.getJSONObject(i))
                    }
                    posts = list
                } catch (e: Exception) {
                    posts = emptyList()
                }
                isLoading = false
            }.onFailure {
                isLoading = false
            }
        }
    }

    LaunchedEffect(Unit) {
        loadExplore()
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    if (isSearchMode) {
                        OutlinedTextField(
                            value = searchQuery,
                            onValueChange = { 
                                searchQuery = it
                                if (it.length >= 2) performSearch(it)
                            },
                            placeholder = { Text("Search") },
                            leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null) },
                            modifier = Modifier.fillMaxWidth(),
                            singleLine = true,
                            shape = RoundedCornerShape(12.dp)
                        )
                    } else {
                        Text(
                            "Explore",
                            fontWeight = FontWeight.Bold,
                            fontSize = if (screenInfo.diagonalInches >= 6.9) 22.sp else 18.sp
                        )
                    }
                },
                actions = {
                    if (!isSearchMode) {
                        IconButton(onClick = { isSearchMode = true }) {
                            Icon(Icons.Filled.Search, contentDescription = "Search")
                        }
                    }
                }
            )
        }
    ) { padding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
        ) {
            when {
                isLoading -> LoadingIndicator(modifier = Modifier.align(Alignment.Center))
                posts.isEmpty() -> {
                    Column(
                        modifier = Modifier.align(Alignment.Center),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Text("No posts found", style = MaterialTheme.typography.titleMedium)
                        Text(
                            "Try different categories or search terms",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
                else -> {
                    LazyVerticalGrid(
                        columns = GridCells.Fixed(columns),
                        contentPadding = PaddingValues(2.dp),
                        verticalArrangement = Arrangement.spacedBy(2.dp),
                        horizontalArrangement = Arrangement.spacedBy(2.dp),
                        modifier = Modifier.fillMaxSize()
                    ) {
                        items(posts) { post ->
                            val mediaArray = post.optJSONArray("media")
                            val mediaUrl = if (mediaArray != null && mediaArray.length() > 0) 
                                mediaArray.getString(0) else ""
                            
                            Box(
                                modifier = Modifier
                                    .aspectRatio(1f)
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
                    }
                }
            }
        }
    }
}
