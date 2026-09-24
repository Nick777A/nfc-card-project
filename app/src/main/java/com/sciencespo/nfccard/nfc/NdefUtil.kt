package com.sciencespo.nfccard.nfc

import android.nfc.NdefMessage
import android.nfc.NdefRecord
import java.nio.charset.StandardCharsets

/** Wraps/unwraps a vCard payload as a single-record MIME NDEF message. */
object NdefUtil {

    const val VCARD_MIME_TYPE = "text/vcard"

    fun buildVCardMessage(vcard: String): NdefMessage {
        val record = NdefRecord.createMime(
            VCARD_MIME_TYPE,
            vcard.toByteArray(StandardCharsets.UTF_8)
        )
        return NdefMessage(arrayOf(record))
    }

    fun extractVCardText(message: NdefMessage): String? {
        for (record in message.records) {
            val type = String(record.type, StandardCharsets.US_ASCII)
            if (record.tnf == NdefRecord.TNF_MIME_MEDIA && type == VCARD_MIME_TYPE) {
                return String(record.payload, StandardCharsets.UTF_8)
            }
        }
        // Fall back to the first record's payload in case a peer tagged it differently.
        return message.records.firstOrNull()?.let { String(it.payload, StandardCharsets.UTF_8) }
    }
}
