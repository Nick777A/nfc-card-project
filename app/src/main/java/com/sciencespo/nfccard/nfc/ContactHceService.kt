package com.sciencespo.nfccard.nfc

import android.nfc.cardemulation.HostApduService
import android.os.Bundle
import android.util.Log

/**
 * Emulates a read-only NFC Forum Type 4 Tag whose NDEF file holds the active
 * profile as a vCard. Selecting a file and reading it only succeeds while
 * [ActiveShareState.sharingEnabled] is true, which is how the Share screen's
 * on/off toggle (and its inactivity timeout) actually gates the exchange.
 */
class ContactHceService : HostApduService() {

    private enum class SelectedFile { NONE, CC, NDEF }

    private var selectedFile = SelectedFile.NONE

    override fun processCommandApdu(commandApdu: ByteArray?, extras: Bundle?): ByteArray {
        val apdu = commandApdu ?: return Type4Tag.SW_WRONG_PARAMS

        if (!ActiveShareState.sharingEnabled.value) {
            return Type4Tag.SW_FILE_NOT_FOUND
        }

        return when {
            Type4Tag.isSelectAid(apdu) -> {
                selectedFile = SelectedFile.NONE
                ActiveShareState.notifyTapped()
                Type4Tag.SW_OK
            }

            Type4Tag.isSelectFile(apdu, Type4Tag.CC_FILE_ID) -> {
                selectedFile = SelectedFile.CC
                Type4Tag.SW_OK
            }

            Type4Tag.isSelectFile(apdu, Type4Tag.NDEF_FILE_ID) -> {
                selectedFile = SelectedFile.NDEF
                Type4Tag.SW_OK
            }

            Type4Tag.isReadBinary(apdu) -> handleReadBinary(apdu)

            else -> Type4Tag.SW_INS_NOT_SUPPORTED
        }
    }

    private fun handleReadBinary(apdu: ByteArray): ByteArray {
        val file = when (selectedFile) {
            SelectedFile.CC -> ActiveShareState.currentCapabilityContainer()
            SelectedFile.NDEF -> ActiveShareState.currentNdefFile()
            SelectedFile.NONE -> return Type4Tag.SW_FILE_NOT_FOUND
        }

        val offset = Type4Tag.readBinaryOffset(apdu)
        val length = Type4Tag.readBinaryLength(apdu)
        val slice = Type4Tag.readSlice(file, offset, length) ?: return Type4Tag.SW_WRONG_PARAMS

        return slice + Type4Tag.SW_OK
    }

    override fun onDeactivated(reason: Int) {
        selectedFile = SelectedFile.NONE
        Log.d(TAG, "Deactivated, reason=$reason")
    }

    companion object {
        private const val TAG = "ContactHceService"
    }
}
