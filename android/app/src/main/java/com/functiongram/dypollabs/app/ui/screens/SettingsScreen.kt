package com.functiongram.dypollabs.app.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Storage
import androidx.compose.material.icons.filled.Memory
import androidx.compose.material.icons.filled.PhoneAndroid
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.functiongram.dypollabs.app.BuildConfig
import com.functiongram.dypollabs.app.data.AuthRepository
import com.functiongram.dypollabs.app.data.DeviceInfoManager
import com.functiongram.dypollabs.app.data.SessionManager
import com.functiongram.dypollabs.app.ui.theme.ScreenSizeInfo
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    sessionManager: SessionManager,
    screenInfo: ScreenSizeInfo,
    onBack: () -> Unit,
    onLogout: () -> Unit
) {
    val context = LocalContext.current
    val deviceInfoManager = remember { DeviceInfoManager(context) }
    val deviceInfo = remember { deviceInfoManager.getDeviceInfo() }
    val authRepository = remember { AuthRepository(sessionManager) }
    val scope = rememberCoroutineScope()
    
    var showLogoutDialog by remember { mutableStateOf(false) }
    var baseUrl by remember { mutableStateOf(sessionManager.getBaseUrlSync()) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Settings", fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Filled.ArrowBack, contentDescription = "Back")
                    }
                }
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(16.dp)
        ) {
            // App info
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer)
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text(
                        "FunctionGram",
                        fontSize = 20.sp,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onPrimaryContainer
                    )
                    Text(
                        "Version ${BuildConfig.VERSION_NAME} (${BuildConfig.VERSION_CODE})",
                        fontSize = 12.sp,
                        color = MaterialTheme.colorScheme.onPrimaryContainer
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        "Package: ${BuildConfig.APPLICATION_ID}",
                        fontSize = 10.sp,
                        color = MaterialTheme.colorScheme.onPrimaryContainer.copy(alpha = 0.7f)
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        "by DYPOL LABS",
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color(0xFF888888)
                    )
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            // Device requirements
            Text("Device Requirements", fontWeight = FontWeight.Bold, fontSize = 16.sp)
            Spacer(modifier = Modifier.height(8.dp))

            Card(modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(16.dp)) {
                    RequirementRow(
                        icon = Icons.Filled.Memory,
                        label = "RAM",
                        required = "3GB (3072 MB)",
                        actual = "${deviceInfo.totalRamMb} MB",
                        meets = deviceInfo.meetsRamRequirement
                    )
                    Divider(modifier = Modifier.padding(vertical = 8.dp))
                    RequirementRow(
                        icon = Icons.Filled.Storage,
                        label = "Storage",
                        required = "32GB",
                        actual = "${deviceInfo.totalStorageMb} MB total, ${deviceInfo.availableStorageMb} MB free",
                        meets = deviceInfo.meetsStorageRequirement
                    )
                    Divider(modifier = Modifier.padding(vertical = 8.dp))
                    RequirementRow(
                        icon = Icons.Filled.PhoneAndroid,
                        label = "Android Version",
                        required = "Android 9 (API 28)",
                        actual = "API ${deviceInfo.androidVersion} (${android.os.Build.VERSION.RELEASE})",
                        meets = deviceInfo.androidVersion >= 28
                    )
                    Divider(modifier = Modifier.padding(vertical = 8.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Filled.Info, contentDescription = null, modifier = Modifier.size(20.dp))
                        Spacer(modifier = Modifier.width(8.dp))
                        Column {
                            Text("Screen Size", fontWeight = FontWeight.Medium, fontSize = 14.sp)
                            Text(
                                "${screenInfo.sizeCategory} - ${"%.1f".format(screenInfo.diagonalInches)}\" - ${screenInfo.widthPx}x${screenInfo.heightPx}",
                                fontSize = 12.sp,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                            Text(
                                "Responsive: ${if (screenInfo.isTablet) "Tablet" else "Phone"} layout",
                                fontSize = 11.sp,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            // Backend configuration
            Text("Backend Configuration", fontWeight = FontWeight.Bold, fontSize = 16.sp)
            Spacer(modifier = Modifier.height(8.dp))

            Card(modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(16.dp)) {
                    OutlinedTextField(
                        value = baseUrl,
                        onValueChange = { baseUrl = it },
                        label = { Text("Backend URL") },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    Button(
                        onClick = {
                            sessionManager.setBaseUrlSync(baseUrl)
                        },
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Text("Save Backend URL")
                    }
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        "Backend handles: sign up, login, content, email and all features. Same as web app.",
                        fontSize = 11.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            // Supported architectures
            Text("Supported Architectures", fontWeight = FontWeight.Bold, fontSize = 16.sp)
            Spacer(modifier = Modifier.height(8.dp))

            Card(modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text("armeabi-v7a (32-bit ARM)", fontSize = 13.sp)
                    Text("arm64-v8a (64-bit ARM)", fontSize = 13.sp)
                    Text("x86 (32-bit Intel)", fontSize = 13.sp)
                    Text("x86_64 (64-bit Intel)", fontSize = 13.sp)
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        "All ABIs included in universal APK. Supports all DPI: ldpi, mdpi, hdpi, xhdpi, xxhdpi, xxxhdpi",
                        fontSize = 11.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            // Supported screen sizes
            Text("Responsive Design", fontWeight = FontWeight.Bold, fontSize = 16.sp)
            Spacer(modifier = Modifier.height(8.dp))

            Card(modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text("Supports all screen sizes:", fontSize = 13.sp, fontWeight = FontWeight.Medium)
                    Spacer(modifier = Modifier.height(4.dp))
                    Text("• Small (4.5\"-5.0\")", fontSize = 12.sp)
                    Text("• Medium (5.0\"-6.0\")", fontSize = 12.sp)
                    Text("• Large (6.1\"-6.5\")", fontSize = 12.sp)
                    Text("• XLarge (6.5\"-6.9\")", fontSize = 12.sp)
                    Text("• Tablet (7.0\"+)", fontSize = 12.sp)
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        "Icons, bars, functions adjust automatically according to device. Current: ${screenInfo.sizeCategory}",
                        fontSize = 11.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }

            Spacer(modifier = Modifier.height(24.dp))

            Button(
                onClick = { showLogoutDialog = true },
                modifier = Modifier.fillMaxWidth(),
                colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error)
            ) {
                Text("Logout")
            }

            Spacer(modifier = Modifier.height(24.dp))

            // Footer
            Column(
                modifier = Modifier.fillMaxWidth(),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Text("by", fontSize = 10.sp, color = Color(0xFF888888))
                Text("DYPOL LABS", fontSize = 12.sp, fontWeight = FontWeight.Bold, color = Color(0xFF888888))
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    "FunctionGram • RSTMC • Android 9+ • 3GB RAM • 32GB Storage",
                    fontSize = 10.sp,
                    color = Color.Gray
                )
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
fun RequirementRow(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    label: String,
    required: String,
    actual: String,
    meets: Boolean
) {
    Row(verticalAlignment = Alignment.Top) {
        Icon(icon, contentDescription = null, modifier = Modifier.size(20.dp))
        Spacer(modifier = Modifier.width(8.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(label, fontWeight = FontWeight.Medium, fontSize = 14.sp)
            Text("Required: $required", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(
                "Actual: $actual",
                fontSize = 12.sp,
                color = if (meets) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error
            )
        }
        Text(
            if (meets) "✓" else "✗",
            fontWeight = FontWeight.Bold,
            color = if (meets) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error,
            fontSize = 16.sp
        )
    }
}
