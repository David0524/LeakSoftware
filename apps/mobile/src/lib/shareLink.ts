import { Platform, Share } from "react-native";
import { customerLinkToken, splitShareMessage } from "@leakbook/core";
import { LinkShareNative } from "../../modules/link-share";
import { API_URL } from "./config";
import { linkShareContent } from "./linkShareContent";

/**
 * The customer link's preview title from the website ("Bluefin Pool Co.: Quote for Dana Ruiz"),
 * the same words Messages shows; null when it can't be read within 2.5 seconds.
 */
async function previewTitle(link: string): Promise<string | null> {
  const token = customerLinkToken(link);
  if (!token || !API_URL) return null;
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 2500);
  try {
    const res = await fetch(`${API_URL}/api/link-preview/${token}`, { signal: abort.signal });
    if (!res.ok) return null;
    const body = (await res.json()) as { title?: unknown };
    return typeof body.title === "string" ? body.title : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Opens the share sheet for a customer text that ends with its quote, invoice or report link, so
 * Messages shows the document's preview card. Android names the document at the top of the sheet
 * (EXTRA_TITLE); the iPhone build hands over the link as a link (the Swift app's LinkShare).
 */
export async function shareLink(message: string): Promise<void> {
  const { url } = splitShareMessage(message);
  const title = url ? await previewTitle(url) : null;
  const content = linkShareContent(message, title, Platform.OS);
  if ("url" in content) {
    await Share.share(content);
    return;
  }
  if (Platform.OS === "android" && LinkShareNative) {
    LinkShareNative.share(content.text, content.title);
    return;
  }
  await Share.share(
    content.title ? { message: content.text, title: content.title } : { message: content.text },
  );
}
