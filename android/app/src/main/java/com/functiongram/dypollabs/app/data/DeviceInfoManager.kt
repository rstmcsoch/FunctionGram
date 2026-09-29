package com.functiongram.dypollabs.app.data

import android.app.ActivityManager
import android.content.Context
import android.os.Environment
import android.os.StatFs
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext
import java.io.File

data class DeviceRequirements(
    val minRamMb: Int = 3072, // 3GB
    val minStorageMb: Int = 32768, // 32GB
    val minSdk: Int = 28 // Android 9
)

data class DeviceInfo(
    val totalRamMb: Long,
    val availableRamMb: Long,
    val totalStorageMb: Long,
    val availableStorageMb: Long,
    val meetsRamRequirement: Boolean,
    val meetsStorageRequirement: Boolean,
    val androidVersion: Int,
    val deviceModel: String,
    val screenSizeCategory: String
)

class DeviceInfoManager(private val context: Context) {

    fun getDeviceInfo(): DeviceInfo {
        val activityManager = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
        val memInfo = ActivityManager.MemoryInfo()
        activityManager.getMemoryInfo(memInfo)

        val totalRamMb = memInfo.totalMem / (1024 * 1024)
        val availableRamMb = memInfo.availMem / (1024 * 1024)

        // Storage info
        val stat = StatFs(Environment.getDataDirectory().path)
        val totalStorageMb = (stat.blockCountLong * stat.blockSizeLong) / (1024 * 1024)
        val availableStorageMb = (stat.availableBlocksLong * stat.blockSizeLong) / (1024 * 1024)

        return DeviceInfo(
            totalRamMb = totalRamMb,
            availableRamMb = availableRamMb,
            totalStorageMb = totalStorageMb,
            availableStorageMb = availableStorageMb,
            meetsRamRequirement = totalRamMb >= 3072,
            meetsStorageRequirement = totalStorageMb >= 32768,
            androidVersion = android.os.Build.VERSION.SDK_INT,
            deviceModel = "${android.os.Build.MANUFACTURER} ${android.os.Build.MODEL}",
            screenSizeCategory = getScreenSizeCategory()
        )
    }

    private fun getScreenSizeCategory(): String {
        val metrics = context.resources.displayMetrics
        val widthInches = metrics.widthPixels / metrics.xdpi
        val heightInches = metrics.heightPixels / metrics.ydpi
        val diagonal = Math.sqrt((widthInches * widthInches + heightInches * heightInches).toDouble())

        return when {
            diagonal < 5.0 -> "Small (4.5\"-5.0\")"
            diagonal < 6.0 -> "Medium (5.0\"-6.0\")"
            diagonal < 6.5 -> "Large (6.1\"-6.5\")"
            diagonal < 7.0 -> "XLarge (6.5\"-6.9\")"
            else -> "Tablet (7.0\"+)"
        }
    }

    fun isDeviceCompatible(): Boolean {
        val info = getDeviceInfo()
        return info.meetsRamRequirement && info.meetsStorageRequirement && info.androidVersion >= 28
    }
}

@Composable
fun rememberDeviceInfo(): DeviceInfo {
    val context = LocalContext.current
    return remember {
        DeviceInfoManager(context).getDeviceInfo()
    }
}
