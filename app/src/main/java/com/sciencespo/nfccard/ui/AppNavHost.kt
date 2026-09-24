package com.sciencespo.nfccard.ui

import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Nfc
import androidx.compose.material.icons.filled.Person
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.sciencespo.nfccard.ui.screens.HistoryScreen
import com.sciencespo.nfccard.ui.screens.ProfileScreen
import com.sciencespo.nfccard.ui.screens.ReceivedContactDialog
import com.sciencespo.nfccard.ui.screens.ShareScreen

private sealed class Destination(val route: String, val label: String) {
    data object Profile : Destination("profile", "Профиль")
    data object Share : Destination("share", "Поделиться")
    data object History : Destination("history", "История")
}

private val bottomDestinations = listOf(Destination.Profile, Destination.Share, Destination.History)

@Composable
fun AppNavHost(viewModel: AppViewModel) {
    val navController = rememberNavController()
    val pendingContact by viewModel.pendingContact.collectAsState()
    val readError by viewModel.readError.collectAsState()
    val requestContactsPermission = rememberWriteContactsGate()

    Scaffold(
        bottomBar = {
            val backStackEntry by navController.currentBackStackEntryAsState()
            val currentDestination = backStackEntry?.destination
            NavigationBar {
                bottomDestinations.forEach { destination ->
                    val selected = currentDestination?.hierarchy?.any { it.route == destination.route } == true
                    NavigationBarItem(
                        selected = selected,
                        onClick = {
                            navController.navigate(destination.route) {
                                popUpTo(navController.graph.findStartDestination().id) { saveState = true }
                                launchSingleTop = true
                                restoreState = true
                            }
                        },
                        icon = {
                            val icon = when (destination) {
                                Destination.Profile -> Icons.Filled.Person
                                Destination.Share -> Icons.Filled.Nfc
                                Destination.History -> Icons.Filled.History
                            }
                            Icon(icon, contentDescription = destination.label)
                        },
                        label = { Text(destination.label) }
                    )
                }
            }
        }
    ) { paddingValues ->
        NavHost(
            navController = navController,
            startDestination = Destination.Profile.route,
            modifier = Modifier.padding(paddingValues)
        ) {
            composable(Destination.Profile.route) {
                ProfileScreen(viewModel = viewModel)
            }
            composable(Destination.Share.route) {
                ShareScreen(viewModel = viewModel)
            }
            composable(Destination.History.route) {
                HistoryScreen(viewModel = viewModel)
            }
        }
    }

    if (pendingContact != null) {
        ReceivedContactDialog(
            contact = pendingContact!!,
            onAccept = { requestContactsPermission { viewModel.acceptPendingContact() } },
            onReject = { viewModel.rejectPendingContact() }
        )
    }

    readError?.let { message ->
        com.sciencespo.nfccard.ui.screens.ReadErrorSnackbar(message = message, onDismiss = { viewModel.clearReadError() })
    }
}
