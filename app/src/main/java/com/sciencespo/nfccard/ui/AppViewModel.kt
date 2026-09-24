package com.sciencespo.nfccard.ui

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.sciencespo.nfccard.NfcCardApp
import com.sciencespo.nfccard.data.Profile
import com.sciencespo.nfccard.data.ReceivedContact
import com.sciencespo.nfccard.nfc.ActiveShareState
import com.sciencespo.nfccard.nfc.ParsedVCard
import com.sciencespo.nfccard.nfc.VCardUtil
import com.sciencespo.nfccard.util.ContactSaver
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

/** Inactivity timeout after which HCE sharing turns itself off automatically. */
private const val SHARE_TIMEOUT_MILLIS = 2 * 60 * 1000L

class AppViewModel(application: Application) : AndroidViewModel(application) {

    private val repository = (application as NfcCardApp).repository

    val profile: StateFlow<Profile?> = repository.profile
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), null)

    val receivedContacts: StateFlow<List<ReceivedContact>> = repository.receivedContacts
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    val sharingEnabled: StateFlow<Boolean> = ActiveShareState.sharingEnabled
    val tapCount: StateFlow<Int> = ActiveShareState.tapCount

    private val _remainingShareSeconds = MutableStateFlow<Int?>(null)
    val remainingShareSeconds: StateFlow<Int?> = _remainingShareSeconds.asStateFlow()

    private val _pendingContact = MutableStateFlow<ParsedVCard?>(null)
    val pendingContact: StateFlow<ParsedVCard?> = _pendingContact.asStateFlow()

    private val _readError = MutableStateFlow<String?>(null)
    val readError: StateFlow<String?> = _readError.asStateFlow()

    init {
        viewModelScope.launch {
            profile.combine(sharingEnabled) { p, enabled -> p to enabled }.collect { (p, enabled) ->
                if (enabled) {
                    ActiveShareState.setVCard(VCardUtil.build(p ?: Profile()))
                }
            }
        }
    }

    fun saveProfile(profile: Profile) {
        viewModelScope.launch { repository.saveProfile(profile) }
    }

    fun setSharingEnabled(enabled: Boolean) {
        ActiveShareState.setSharingEnabled(enabled)
        if (enabled) {
            profile.value?.let { ActiveShareState.setVCard(VCardUtil.build(it)) }
            startShareTimeoutWatch()
        } else {
            _remainingShareSeconds.value = null
        }
    }

    private var timeoutWatchJob: kotlinx.coroutines.Job? = null

    private fun startShareTimeoutWatch() {
        timeoutWatchJob?.cancel()
        timeoutWatchJob = viewModelScope.launch {
            var deadline = System.currentTimeMillis() + SHARE_TIMEOUT_MILLIS
            while (ActiveShareState.sharingEnabled.value) {
                val lastTap = ActiveShareState.lastTapAtMillis.value
                if (lastTap > 0 && lastTap + SHARE_TIMEOUT_MILLIS > deadline) {
                    deadline = lastTap + SHARE_TIMEOUT_MILLIS
                }
                val remainingMillis = deadline - System.currentTimeMillis()
                if (remainingMillis <= 0) {
                    ActiveShareState.setSharingEnabled(false)
                    _remainingShareSeconds.value = null
                    break
                }
                _remainingShareSeconds.value = (remainingMillis / 1000).toInt()
                delay(1000)
            }
        }
    }

    fun onContactRead(parsed: ParsedVCard) {
        _readError.value = null
        _pendingContact.value = parsed
    }

    fun onReadError(message: String) {
        _readError.value = message
    }

    fun clearReadError() {
        _readError.value = null
    }

    fun rejectPendingContact() {
        _pendingContact.value = null
    }

    /** Called once WRITE_CONTACTS is confirmed granted by the caller. */
    fun acceptPendingContact() {
        val parsed = _pendingContact.value ?: return
        viewModelScope.launch {
            val entity = ReceivedContact(
                fullName = parsed.fullName,
                phone = parsed.phone,
                email = parsed.email,
                company = parsed.company,
                jobTitle = parsed.jobTitle,
                links = parsed.links,
                receivedAtEpochMillis = System.currentTimeMillis(),
                savedToContacts = true
            )
            val id = repository.addReceivedContact(entity)
            ContactSaver.save(getApplication(), entity)
            repository.markSaved(entity.copy(id = id))
            _pendingContact.value = null
        }
    }

    fun saveExistingToContacts(contact: ReceivedContact) {
        viewModelScope.launch {
            ContactSaver.save(getApplication(), contact)
            repository.markSaved(contact)
        }
    }

    fun deleteReceivedContact(id: Long) {
        viewModelScope.launch { repository.deleteReceivedContact(id) }
    }

    class Factory(private val application: Application) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : androidx.lifecycle.ViewModel> create(modelClass: Class<T>): T =
            AppViewModel(application) as T
    }
}
