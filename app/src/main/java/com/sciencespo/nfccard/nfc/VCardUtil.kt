package com.sciencespo.nfccard.nfc

import com.sciencespo.nfccard.data.Profile

data class ParsedVCard(
    val fullName: String,
    val phone: String,
    val email: String,
    val company: String,
    val jobTitle: String,
    val links: String
)

/**
 * Minimal vCard 3.0 (text/vcard) codec covering only the fields this
 * prototype exchanges. It is intentionally not a general-purpose vCard
 * parser/writer.
 */
object VCardUtil {

    fun build(profile: Profile): String {
        val sb = StringBuilder()
        sb.append("BEGIN:VCARD\r\n")
        sb.append("VERSION:3.0\r\n")
        sb.append("FN:").append(escape(profile.fullName)).append("\r\n")
        sb.append("N:").append(escape(profile.fullName)).append(";;;;\r\n")
        if (profile.company.isNotBlank()) {
            sb.append("ORG:").append(escape(profile.company)).append("\r\n")
        }
        if (profile.jobTitle.isNotBlank()) {
            sb.append("TITLE:").append(escape(profile.jobTitle)).append("\r\n")
        }
        if (profile.phone.isNotBlank()) {
            sb.append("TEL;TYPE=CELL:").append(escape(profile.phone)).append("\r\n")
        }
        if (profile.email.isNotBlank()) {
            sb.append("EMAIL:").append(escape(profile.email)).append("\r\n")
        }
        profile.links.lineSequence()
            .map { it.trim() }
            .filter { it.isNotEmpty() }
            .forEach { link -> sb.append("URL:").append(escape(link)).append("\r\n") }
        sb.append("END:VCARD\r\n")
        return sb.toString()
    }

    fun parse(text: String): ParsedVCard? {
        val lines = unfold(text)
        if (lines.none { it.trim().equals("BEGIN:VCARD", ignoreCase = true) }) return null

        var fullName = ""
        var phone = ""
        var email = ""
        var company = ""
        var jobTitle = ""
        val links = mutableListOf<String>()

        for (rawLine in lines) {
            val line = rawLine.trim()
            val colonIndex = line.indexOf(':')
            if (colonIndex <= 0) continue
            val rawKey = line.substring(0, colonIndex)
            val value = unescape(line.substring(colonIndex + 1))
            val key = rawKey.substringBefore(';').uppercase()

            when (key) {
                "FN" -> if (fullName.isBlank()) fullName = value
                "N" -> if (fullName.isBlank()) {
                    fullName = value.split(';').filter { it.isNotBlank() }.joinToString(" ")
                }
                "ORG" -> company = value
                "TITLE" -> jobTitle = value
                "TEL" -> if (phone.isBlank()) phone = value
                "EMAIL" -> if (email.isBlank()) email = value
                "URL" -> links.add(value)
            }
        }

        if (fullName.isBlank() && phone.isBlank() && email.isBlank()) return null

        return ParsedVCard(
            fullName = fullName,
            phone = phone,
            email = email,
            company = company,
            jobTitle = jobTitle,
            links = links.joinToString("\n")
        )
    }

    /** Joins vCard folded continuation lines (lines starting with a space/tab). */
    private fun unfold(text: String): List<String> {
        val normalized = text.replace("\r\n", "\n").replace('\r', '\n')
        val rawLines = normalized.split("\n")
        val result = mutableListOf<String>()
        for (line in rawLines) {
            if (line.isNotEmpty() && (line[0] == ' ' || line[0] == '\t') && result.isNotEmpty()) {
                result[result.lastIndex] = result.last() + line.substring(1)
            } else {
                result.add(line)
            }
        }
        return result
    }

    private fun escape(value: String): String =
        value.replace("\\", "\\\\").replace(",", "\\,").replace(";", "\\;").replace("\n", "\\n")

    private fun unescape(value: String): String =
        value.replace("\\n", "\n").replace("\\N", "\n").replace("\\;", ";").replace("\\,", ",").replace("\\\\", "\\")
}
