import { getConfig } from "../config/index.js";

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
      // Don't track mailto: and tel: links
      if (url.startsWith("mailto:") || url.startsWith("tel:") || url.startsWith("#")) {
        return `<a ${before}href="${url}"${after}>`;
      }

      const encoded = Buffer.from(JSON.stringify({ emailId, url })).toString("base64url");
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
