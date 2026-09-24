package com.sciencespo.nfccard.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import android.widget.Toast
import com.sciencespo.nfccard.data.Profile
import com.sciencespo.nfccard.ui.AppViewModel

@Composable
fun ProfileScreen(viewModel: AppViewModel) {
    val storedProfile by viewModel.profile.collectAsState()
    val context = LocalContext.current

    var fullName by remember { mutableStateOf("") }
    var phone by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var company by remember { mutableStateOf("") }
    var jobTitle by remember { mutableStateOf("") }
    var links by remember { mutableStateOf("") }
    var initialized by remember { mutableStateOf(false) }

    LaunchedEffect(storedProfile) {
        if (!initialized && storedProfile != null) {
            val p = storedProfile!!
            fullName = p.fullName
            phone = p.phone
            email = p.email
            company = p.company
            jobTitle = p.jobTitle
            links = p.links
            initialized = true
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Text("Мой профиль", style = androidx.compose.material3.MaterialTheme.typography.headlineSmall)

        OutlinedTextField(
            value = fullName,
            onValueChange = { fullName = it },
            label = { Text("Имя и фамилия") },
            isError = fullName.isBlank(),
            supportingText = { if (fullName.isBlank()) Text("Обязательное поле — без имени нельзя включить «Поделиться»") },
            modifier = Modifier.fillMaxWidth()
        )
        OutlinedTextField(
            value = phone,
            onValueChange = { phone = it },
            label = { Text("Телефон") },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
            modifier = Modifier.fillMaxWidth()
        )
        OutlinedTextField(
            value = email,
            onValueChange = { email = it },
            label = { Text("Email") },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
            modifier = Modifier.fillMaxWidth()
        )
        OutlinedTextField(
            value = company,
            onValueChange = { company = it },
            label = { Text("Компания") },
            modifier = Modifier.fillMaxWidth()
        )
        OutlinedTextField(
            value = jobTitle,
            onValueChange = { jobTitle = it },
            label = { Text("Должность") },
            modifier = Modifier.fillMaxWidth()
        )
        OutlinedTextField(
            value = links,
            onValueChange = { links = it },
            label = { Text("Ссылки (по одной на строку)") },
            minLines = 2,
            modifier = Modifier.fillMaxWidth()
        )

        Button(
            onClick = {
                viewModel.saveProfile(
                    Profile(
                        fullName = fullName.trim(),
                        phone = phone.trim(),
                        email = email.trim(),
                        company = company.trim(),
                        jobTitle = jobTitle.trim(),
                        links = links.trim()
                    )
                )
                Toast.makeText(context, "Профиль сохранён", Toast.LENGTH_SHORT).show()
            },
            enabled = fullName.isNotBlank(),
            modifier = Modifier.fillMaxWidth()
        ) {
            Text("Сохранить")
        }
    }
}
