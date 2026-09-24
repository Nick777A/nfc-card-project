package com.sciencespo.nfccard

import android.nfc.NfcAdapter
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.viewModels
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.ui.Modifier
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import com.sciencespo.nfccard.nfc.NfcReaderManager
import com.sciencespo.nfccard.nfc.ReadResult
import com.sciencespo.nfccard.ui.AppNavHost
import com.sciencespo.nfccard.ui.AppViewModel
import com.sciencespo.nfccard.ui.theme.NfcCardTheme
import kotlinx.coroutines.launch

/**
 * Reader mode (for receiving a contact from another device) and HCE sharing
 * both use the phone's single NFC radio, so they cannot run at once: this
 * activity keeps reader mode on whenever the app is in the foreground and
 * the user hasn't turned on "Поделиться" sharing.
 */
class MainActivity : ComponentActivity() {

    private val viewModel: AppViewModel by viewModels { AppViewModel.Factory(application) }

    private var nfcAdapter: NfcAdapter? = null

    private val readerCallback = NfcReaderManager { result ->
        runOnUiThread {
            when (result) {
                is ReadResult.Success -> viewModel.onContactRead(result.vcard)
                is ReadResult.Failure -> viewModel.onReadError(result.reason)
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        nfcAdapter = NfcAdapter.getDefaultAdapter(this)

        setContent {
            NfcCardTheme {
                Surface(modifier = Modifier.fillMaxSize()) {
                    AppNavHost(viewModel = viewModel)
                }
            }
        }

        lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.RESUMED) {
                viewModel.sharingEnabled.collect { sharing ->
                    if (sharing) disableReaderMode() else enableReaderMode()
                }
            }
        }
    }

    override fun onPause() {
        super.onPause()
        disableReaderMode()
    }

    private fun enableReaderMode() {
        val adapter = nfcAdapter ?: return
        val flags = NfcAdapter.FLAG_READER_NFC_A or
            NfcAdapter.FLAG_READER_NFC_B or
            NfcAdapter.FLAG_READER_SKIP_NDEF_CHECK
        adapter.enableReaderMode(this, readerCallback, flags, null)
    }

    private fun disableReaderMode() {
        nfcAdapter?.disableReaderMode(this)
    }
}
