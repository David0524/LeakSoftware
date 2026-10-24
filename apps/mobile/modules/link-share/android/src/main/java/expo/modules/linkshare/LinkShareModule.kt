package expo.modules.linkshare

import android.content.Intent
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * The share sheet for a customer link with its title (owner, 2026-10-24: link previews for
 * quotes, invoices and reports). React Native's Share puts a title only in EXTRA_SUBJECT; the
 * Android share sheet shows EXTRA_TITLE above the text, so the sheet names the document the way
 * Messages' preview does ("Bluefin Pool Co.: Quote for Dana Ruiz"). Email apps take the same
 * title as the subject.
 */
class LinkShareModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("LinkShare")

    Function("share") { text: String, title: String? ->
      val send = Intent(Intent.ACTION_SEND).apply {
        type = "text/plain"
        putExtra(Intent.EXTRA_TEXT, text)
        if (!title.isNullOrBlank()) {
          putExtra(Intent.EXTRA_TITLE, title)
          putExtra(Intent.EXTRA_SUBJECT, title)
        }
      }
      appContext.throwingActivity.startActivity(Intent.createChooser(send, null))
    }
  }
}
