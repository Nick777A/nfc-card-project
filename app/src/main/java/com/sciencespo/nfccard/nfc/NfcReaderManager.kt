package com.sciencespo.nfccard.nfc

import android.nfc.NdefMessage
import android.nfc.NfcAdapter
import android.nfc.Tag
import android.nfc.tech.IsoDep
import android.util.Log

sealed class ReadResult {
    data class Success(val vcard: ParsedVCard) : ReadResult()
    data class Failure(val reason: String) : ReadResult()
}

/**
 * Reads the emulated Type 4 Tag exposed by [ContactHceService] on another
 * device: SELECT AID -> SELECT CC -> READ CC (to find the NDEF file id/size)
 * -> SELECT NDEF -> READ NLEN -> READ the NDEF message itself.
 */
class NfcReaderManager(private val onResult: (ReadResult) -> Unit) : NfcAdapter.ReaderCallback {

    override fun onTagDiscovered(tag: Tag) {
        val isoDep = IsoDep.get(tag)
        if (isoDep == null) {
            onResult(ReadResult.Failure("Обнаруженный тег не поддерживает ISO-DEP (не Type 4 Tag)"))
            return
        }

        try {
            isoDep.connect()
            isoDep.timeout = 3000

            val selectAidResponse = isoDep.transceive(buildSelectAid())
            if (!isSuccess(selectAidResponse)) {
                onResult(ReadResult.Failure("Устройство-отправитель сейчас не раздаёт профиль (Поделиться выключено)"))
                return
            }

            val selectCcResponse = isoDep.transceive(buildSelectFile(Type4Tag.CC_FILE_ID))
            if (!isSuccess(selectCcResponse)) {
                onResult(ReadResult.Failure("Не удалось выбрать файл CC"))
                return
            }

            val cc = readBinary(isoDep, offset = 0, length = 15) ?: run {
                onResult(ReadResult.Failure("Не удалось прочитать Capability Container"))
                return
            }
            val ndefFileId = byteArrayOf(cc[9], cc[10])

            val selectNdefResponse = isoDep.transceive(buildSelectFile(ndefFileId))
            if (!isSuccess(selectNdefResponse)) {
                onResult(ReadResult.Failure("Не удалось выбрать NDEF-файл"))
                return
            }

            val nlenBytes = readBinary(isoDep, offset = 0, length = 2) ?: run {
                onResult(ReadResult.Failure("Не удалось прочитать длину NDEF-сообщения"))
                return
            }
            val nlen = ((nlenBytes[0].toInt() and 0xFF) shl 8) or (nlenBytes[1].toInt() and 0xFF)
            if (nlen <= 0) {
                onResult(ReadResult.Failure("Профиль пуст"))
                return
            }

            val payload = readAll(isoDep, offset = 2, length = nlen) ?: run {
                onResult(ReadResult.Failure("Не удалось прочитать данные профиля"))
                return
            }

            val ndefMessage = NdefMessage(payload)
            val vcardText = NdefUtil.extractVCardText(ndefMessage)
                ?: run {
                    onResult(ReadResult.Failure("NDEF-сообщение не содержит vCard"))
                    return
                }
            val parsed = VCardUtil.parse(vcardText)
                ?: run {
                    onResult(ReadResult.Failure("Не удалось разобрать vCard"))
                    return
                }

            onResult(ReadResult.Success(parsed))
        } catch (e: Exception) {
            Log.e(TAG, "Read failed", e)
            onResult(ReadResult.Failure("Ошибка обмена по NFC: ${e.message}"))
        } finally {
            try {
                isoDep.close()
            } catch (_: Exception) {
            }
        }
    }

    /** Reads up to 250 bytes per READ BINARY command, respecting MLe from the CC. */
    private fun readAll(isoDep: IsoDep, offset: Int, length: Int): ByteArray? {
        val out = ByteArray(length)
        var read = 0
        while (read < length) {
            val chunk = (length - read).coerceAtMost(MAX_READ_CHUNK)
            val slice = readBinary(isoDep, offset + read, chunk) ?: return null
            System.arraycopy(slice, 0, out, read, slice.size)
            read += slice.size
            if (slice.isEmpty()) break
        }
        return if (read == length) out else null
    }

    private fun readBinary(isoDep: IsoDep, offset: Int, length: Int): ByteArray? {
        val command = buildReadBinary(offset, length)
        val response = isoDep.transceive(command)
        if (!isSuccess(response)) return null
        return response.copyOfRange(0, response.size - 2)
    }

    private fun buildSelectAid(): ByteArray =
        byteArrayOf(0x00, 0xA4.toByte(), 0x04, 0x00, Type4Tag.NDEF_AID.size.toByte()) +
            Type4Tag.NDEF_AID + byteArrayOf(0x00)

    private fun buildSelectFile(fileId: ByteArray): ByteArray =
        byteArrayOf(0x00, 0xA4.toByte(), 0x00, 0x0C, fileId.size.toByte()) + fileId

    private fun buildReadBinary(offset: Int, length: Int): ByteArray =
        byteArrayOf(
            0x00, 0xB0.toByte(),
            ((offset shr 8) and 0xFF).toByte(), (offset and 0xFF).toByte(),
            length.toByte()
        )

    private fun isSuccess(response: ByteArray?): Boolean =
        response != null && response.size >= 2 &&
            response[response.size - 2] == 0x90.toByte() &&
            response[response.size - 1] == 0x00.toByte()

    companion object {
        private const val TAG = "NfcReaderManager"
        private const val MAX_READ_CHUNK = 200
    }
}
