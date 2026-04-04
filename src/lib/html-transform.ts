import crypto from "node:crypto";
import { getConfig, getTrackingSecret } from "../config/index.js";

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/**
 * Injects an open-tracking pixel into HTML email body.
 */
export function injectTrackingPixel(html: string, emailId: string): string {
  const config = getConfig();
  const pixelUrl = `${config.TRACKING_URL}/t/${emailId}`;
  const pixel = `<img src="${pixelUrl}" width="1" height="1" style="display:none" alt="" />`;

  // Insert before the last </body> if it exists, otherwise append
  if (html.includes("</body>")) {
    const lastIndex = html.lastIndexOf("</body>");
    return html.slice(0, lastIndex) + pixel + html.slice(lastIndex);
  }
  return html + pixel;
}

/**
 * Rewrites links in HTML for click tracking.
 * Each <a href="..."> becomes <a href="/c/{encodedTrackingData}">
 */
export function rewriteLinks(html: string, emailId: string): string {
  const config = getConfig();

  return html.replace(
    /<a\s([^>]*?)href=["']([^"']+)["']([^>]*?)>/gi,
    (_match, before, url, after) => {
      // Decode HTML entities (e.g. &amp; → &) that email HTML requires in href attributes
      const cleanUrl = decodeHtmlEntities(url);

      // Don't track mailto:, tel:, anchor links, or unsubscribe links
      if (cleanUrl.startsWith("mailto:") || cleanUrl.startsWith("tel:") || cleanUrl.startsWith("#") || cleanUrl.includes("/unsubscribe/")) {
        return `<a ${before}href="${cleanUrl}"${after}>`;
      }

      // Don't rewrite links with data-no-track attribute
      if (before.includes("data-no-track") || after.includes("data-no-track")) {
        return `<a ${before}href="${cleanUrl}"${after}>`;
      }

      const payload = Buffer.from(JSON.stringify({ emailId, url: cleanUrl })).toString("base64url");
      const sig = crypto.createHmac("sha256", getTrackingSecret()).update(payload).digest("base64url");
      const encoded = `${payload}.${sig}`;
      const trackingUrl = `${config.TRACKING_URL}/c/${encoded}`;
      return `<a ${before}href="${trackingUrl}"${after}>`;
    },
  );
}

/**
 * Apply all tracking transforms to HTML.
 */
export function transformHtml(html: string, emailId: string): string {
  let result = rewriteLinks(html, emailId);
  result = injectTrackingPixel(result, emailId);
  return result;
}
