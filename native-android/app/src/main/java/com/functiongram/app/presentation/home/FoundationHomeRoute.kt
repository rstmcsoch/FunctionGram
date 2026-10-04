package com.functiongram.app.presentation.home

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.functiongram.app.configuration.ApiEnvironment
import com.functiongram.app.configuration.VariantMarker
import com.functiongram.app.presentation.theme.BrandAccent
import com.functiongram.app.presentation.theme.BrandInk
import com.functiongram.app.presentation.theme.BrandMuted

@Composable
fun FoundationHomeRoute() {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .padding(horizontal = 28.dp, vertical = 48.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.Start,
    ) {
        Text(
            text = "FunctionGram",
            style = MaterialTheme.typography.headlineLarge,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.primary,
        )
        Text(
            text = "Native foundation",
            modifier = Modifier
                .padding(top = 8.dp)
                .background(BrandAccent)
                .padding(horizontal = 10.dp, vertical = 4.dp),
            style = MaterialTheme.typography.labelLarge,
            color = BrandInk,
        )
        Text(
            text = "This build talks only to the existing public API. Sign-in, feed, messages, and media are not in this phase.",
            modifier = Modifier.padding(top = 20.dp),
            style = MaterialTheme.typography.bodyLarge,
            color = BrandInk,
        )
        Text(
            text = ApiEnvironment.resolvedOrigin(),
            modifier = Modifier.padding(top = 16.dp),
            style = MaterialTheme.typography.bodyMedium,
            color = BrandMuted,
        )
        Text(
            text = "Build ${VariantMarker.NAME}",
            modifier = Modifier.padding(top = 8.dp),
            style = MaterialTheme.typography.bodySmall,
            color = BrandMuted,
        )
    }
}
