import { splitShareMessage } from "@leakbook/core";

/**
 * What the share sheet gets for a customer text (owner, 2026-10-24: link previews for quotes,
 * invoices and reports). Android: the whole text with its link at the end, so Messages builds the
 * preview card from the link, and the preview's title as EXTRA_TITLE (and the email subject).
 * iPhone (this app's iOS build): the link as a link beside the words, as the Swift app does.
 */
export function linkShareContent(
  message: string,
  title: string | null,
  os: "android" | "ios" | string,
): { text: string; title: string | null } | { url: string; message?: string } {
  const { text, url } = splitShareMessage(message);
  if (os === "ios" && url) return text ? { url, message: text } : { url };
  return { text: message.trim(), title: url ? title : null };
}
