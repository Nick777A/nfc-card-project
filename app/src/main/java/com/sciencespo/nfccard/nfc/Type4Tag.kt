package com.sciencespo.nfccard.nfc

import android.nfc.NdefMessage

/**
 * Byte-level building blocks for emulating a read-only NFC Forum Type 4 Tag
 * (the standard way to expose an NDEF message from an HCE service so any NFC
 * reader, including [android.nfc.NfcAdapter.ReaderCallback] + IsoDep on
 * another phone, can read it without a custom protocol).
 */
object Type4Tag {

    val NDEF_AID: ByteArray = hex("D2760000850101")
    val CC_FILE_ID: ByteArray = hex("E103")
    val NDEF_FILE_ID: ByteArray = hex("E104")

    val SW_OK: ByteArray = hex("9000")
    val SW_FILE_NOT_FOUND: ByteArray = hex("6A82")
    val SW_WRONG_PARAMS: ByteArray = hex("6A86")
    val SW_INS_NOT_SUPPORTED: ByteArray = hex("6D00")

    private const val INS_SELECT: Byte = 0xA4.toByte()
    private const val INS_READ_BINARY: Byte = 0xB0.toByte()

    private const val MAX_NDEF_SIZE = 8 * 1024

    fun isSelectAid(apdu: ByteArray): Boolean =
        apdu.size >= 5 &&
            apdu[1] == INS_SELECT &&
            apdu[2] == 0x04.toByte() &&
            apdu[3] == 0x00.toByte() &&
            containsFileId(apdu, NDEF_AID)

    fun isSelectFile(apdu: ByteArray, fileId: ByteArray): Boolean =
        apdu.size >= 5 &&
            apdu[1] == INS_SELECT &&
            apdu[2] == 0x00.toByte() &&
            apdu[3] == 0x0C.toByte() &&
            containsFileId(apdu, fileId)

    fun isReadBinary(apdu: ByteArray): Boolean =
        apdu.size >= 4 && apdu[1] == INS_READ_BINARY

    /** Offset encoded in P1P2 of a READ BINARY command. */
    fun readBinaryOffset(apdu: ByteArray): Int =
        ((apdu[2].toInt() and 0xFF) shl 8) or (apdu[3].toInt() and 0xFF)

    /** Requested length (Le), the last byte of a well-formed READ BINARY APDU. */
    fun readBinaryLength(apdu: ByteArray): Int =
        if (apdu.size >= 5) apdu[4].toInt() and 0xFF else 0

    private fun containsFileId(apdu: ByteArray, fileId: ByteArray): Boolean {
        // apdu = CLA INS P1 P2 Lc <data...>
        if (apdu.size < 5 + fileId.size) return false
        val lc = apdu[4].toInt() and 0xFF
        if (lc != fileId.size) return false
        for (i in fileId.indices) {
            if (apdu[5 + i] != fileId[i]) return false
        }
        return true
    }

    /** Capability Container file content for a read-only NDEF Type 4 Tag. */
    fun buildCapabilityContainer(): ByteArray {
        val mle = 0x00F6
        val mlc = 0x00F6
        return byteArrayOf(
            0x00, 0x0F,                              // CCLEN
            0x20,                                    // Mapping version 2.0
            (mle shr 8).toByte(), (mle and 0xFF).toByte(),
            (mlc shr 8).toByte(), (mlc and 0xFF).toByte(),
            0x04, 0x06,                              // NDEF File Control TLV: tag, length
            NDEF_FILE_ID[0], NDEF_FILE_ID[1],
            ((MAX_NDEF_SIZE shr 8) and 0xFF).toByte(), (MAX_NDEF_SIZE and 0xFF).toByte(),
            0x00,                                    // read access: always allowed
            0xFF.toByte()                             // write access: never allowed (read-only tag)
        )
    }

    /** NLEN-prefixed NDEF file content, as required by the Type 4 Tag spec. */
    fun buildNdefFile(message: NdefMessage): ByteArray {
        val payload = message.toByteArray()
        require(payload.size <= 0xFFFF) { "NDEF message too large" }
        val nlen = payload.size
        val out = ByteArray(2 + payload.size)
        out[0] = ((nlen shr 8) and 0xFF).toByte()
        out[1] = (nlen and 0xFF).toByte()
        System.arraycopy(payload, 0, out, 2, payload.size)
        return out
    }

    /** Slices [file] for a READ BINARY response, clamped to the file bounds. */
    fun readSlice(file: ByteArray, offset: Int, length: Int): ByteArray? {
        if (offset < 0 || offset > file.size) return null
        val end = (offset + length).coerceAtMost(file.size)
        if (end < offset) return null
        return file.copyOfRange(offset, end)
    }

    private fun hex(s: String): ByteArray =
        ByteArray(s.length / 2) { i -> ((Character.digit(s[i * 2], 16) shl 4) + Character.digit(s[i * 2 + 1], 16)).toByte() }
}
