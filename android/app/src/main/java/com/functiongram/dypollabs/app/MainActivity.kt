package com.functiongram.dypollabs.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.viewmodel.compose.viewModel
import com.functiongram.dypollabs.app.data.DeviceInfoManager
import com.functiongram.dypollabs.app.data.SessionManager
import com.functiongram.dypollabs.app.navigation.AppNavGraph
import com.functiongram.dypollabs.app.ui.theme.FunctionGramTheme
import com.functiongram.dypollabs.app.ui.theme.getScreenSizeInfo

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val sessionManager = (application as FunctionGramApp).sessionManager
        val deviceInfoManager = DeviceInfoManager(this)

        setContent {
            val darkTheme = isSystemInDarkTheme()
            val screenInfo = getScreenSizeInfo()
            val deviceInfo = remember { deviceInfoManager.getDeviceInfo() }

            FunctionGramTheme(darkTheme = darkTheme) {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    // Check device requirements (3GB RAM, 32GB storage, Android 9+)
                    val isCompatible = deviceInfo.meetsRamRequirement && 
                                     deviceInfo.meetsStorageRequirement && 
                                     deviceInfo.androidVersion >= 28

                    if (!isCompatible) {
                        DeviceRequirementScreen(deviceInfo = deviceInfo)
                    } else {
                        AppNavGraph(
                            sessionManager = sessionManager,
                            screenInfo = screenInfo
                        )
                    }
                }
            }
        }
    }
}

@Composable
fun DeviceRequirementScreen(
    deviceInfo: com.functiongram.dypollabs.app.data.DeviceInfo
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
        verticalArrangement = Arrangement.Center
    ) {
        Text(
            text = "Device Compatibility Check",
            style = MaterialTheme.typography.headlineMedium,
            color = MaterialTheme.colorScheme.error
        )
        Spacer(modifier = Modifier.height(16.dp))
        Text(
            text = "Your device does not meet minimum requirements for smooth operation:",
            style = MaterialTheme.typography.bodyLarge
        )
        Spacer(modifier = Modifier.height(16.dp))
        
        RequirementItem(
            label = "RAM",
            required = "3GB (3072 MB)",
            actual = "${deviceInfo.totalRamMb} MB",
            meets = deviceInfo.meetsRamRequirement
        )
        RequirementItem(
            label = "Storage",
            required = "32GB (32768 MB)",
            actual = "${deviceInfo.totalStorageMb} MB",
            meets = deviceInfo.meetsStorageRequirement
        )
        RequirementItem(
            label = "Android Version",
            required = "Android 9 (API 28)",
            actual = "API ${deviceInfo.androidVersion}",
            meets = deviceInfo.androidVersion >= 28
        )
        
        Spacer(modifier = Modifier.height(24.dp))
        Text(
            text = "Device: ${deviceInfo.deviceModel}\nScreen: ${deviceInfo.screenSizeCategory}",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        
        Spacer(modifier = Modifier.height(24.dp))
        Text(
            text = "The app may still work but performance may be degraded. For best experience, use a device with at least 3GB RAM and 32GB storage.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}

@Composable
fun RequirementItem(
    label: String,
    required: String,
    actual: String,
    meets: Boolean
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Column {
            Text(
                text = label,
                style = MaterialTheme.typography.titleSmall,
                fontWeight = androidx.compose.ui.text.font.FontWeight.Bold
            )
            Text(
                text = "Required: $required",
                style = MaterialTheme.typography.bodySmall
            )
            Text(
                text = "Your device: $actual",
                style = MaterialTheme.typography.bodySmall,
                color = if (meets) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error
            )
        }
        Text(
            text = if (meets) "✓" else "✗",
            style = MaterialTheme.typography.headlineMedium,
            color = if (meets) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error
        )
    }
}
