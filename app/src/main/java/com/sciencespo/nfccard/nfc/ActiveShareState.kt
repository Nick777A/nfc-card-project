package com.sciencespo.nfccard.nfc

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Process-wide bridge between the Share screen (which turns HCE broadcasting
 * on/off and edits the active profile) and [ContactHceService] (which the
 * Android system instantiates on its own whenever an NFC reader selects the
 * NDEF AID, so it cannot be handed a ViewModel/Repository directly).
 */
object ActiveShareState {
    private val _sharingEnabled = MutableStateFlow(false)
    val sharingEnabled = _sharingEnabled.asStateFlow()

    private val _tapCount = MutableStateFlow(0)
    val tapCount = _tapCount.asStateFlow()

    private val _lastTapAtMillis = MutableStateFlow(0L)
    val lastTapAtMillis = _lastTapAtMillis.asStateFlow()

    @Volatile
    private var capabilityContainer: ByteArray = Type4Tag.buildCapabilityContainer()

    @Volatile
    private var ndefFile: ByteArray = Type4Tag.buildNdefFile(NdefUtil.buildVCardMessage(""))

    fun setVCard(vcard: String) {
        ndefFile = Type4Tag.buildNdefFile(NdefUtil.buildVCardMessage(vcard))
    }

    fun setSharingEnabled(enabled: Boolean) {
        _sharingEnabled.value = enabled
    }

    fun currentCapabilityContainer(): ByteArray = capabilityContainer
    fun currentNdefFile(): ByteArray = ndefFile

    /** Called by the HCE service whenever a reader successfully selects our AID. */
    fun notifyTapped() {
        _tapCount.value += 1
        _lastTapAtMillis.value = System.currentTimeMillis()
    }
}
