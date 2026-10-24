/**
 * Whether a request comes from a link-preview fetcher rather than a person: Messages and Mail
 * (Apple's LinkPresentation sends "facebookexternalhit/1.1 Facebot Twitterbot/1.0"), Slack,
 * Facebook, WhatsApp, Teams and Outlook ("…Preview"), Google's link fetchers, and crawlers. Apps'
 * own in-app browsers (Snapchat, LINE, Pinterest, Outlook's) are people and still count.
 *
 * A customer page counts a view and tells the shop when its report is first opened. Without this,
 * the tech's own phone fetching the preview as they text the link would read as "opened" before
 * the customer ever saw it.
 */
const NAMED =
  /facebookexternalhit|facebookcatalog|facebot|meta-externalagent|twitterbot|slackbot|slack-imgproxy|linkedinbot|whatsapp|telegrambot|discordbot|skypeuripreview|microsoftpreview|microsoft office|googlebot|google-|googleimageproxy|adsbot|mediapartners|applebot|bingbot|bingpreview|redditbot|embedly|iframely|vkshare|mastodon|bluesky|cardyb|kakaotalk-scrap|slurp|duckduckbot|baiduspider|yandex|qwantify|tumblr|ia_archiver|preview|okhttp|python-requests|go-http-client|curl\/|wget/i;

/** "somethingbot", "crawler", "spider", lower case: real phones' names (CUBOT) are capitals. */
const GENERIC = /[a-z]bot\b|crawler|spider/;

export function isLinkPreviewFetch(userAgent: string | null | undefined): boolean {
  if (!userAgent) return true;
  return NAMED.test(userAgent) || GENERIC.test(userAgent);
}
