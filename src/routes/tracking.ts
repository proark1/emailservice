import { FastifyInstance } from "fastify";
import * as trackingService from "../services/tracking.service.js";
import { addSuppression } from "../services/suppression.service.js";

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export default async function trackingRoutes(app: FastifyInstance) {
  // GET /t/:trackingId — open tracking pixel (no auth)
  app.get<{ Params: { trackingId: string } }>("/t/:trackingId", async (request, reply) => {
    const { trackingId } = request.params;

    // Record the open (fire and forget)
    trackingService.recordOpen(trackingId).catch(() => {});

    const pixel = trackingService.getTrackingPixel();
    return reply
      .header("Content-Type", "image/gif")
      .header("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate")
      .send(pixel);
  });

  // GET /c/:trackingId — click tracking redirect (no auth)
  app.get<{ Params: { trackingId: string } }>("/c/:trackingId", async (request, reply) => {
    const { trackingId } = request.params;
    const data = trackingService.decodeClickTrackingData(trackingId);

    if (!data) {
      return reply.status(400).send({ error: { type: "bad_request", message: "Invalid tracking link" } });
    }

    if (!data.url.startsWith("http://") && !data.url.startsWith("https://")) {
      return reply.status(400).send({ error: { type: "bad_request", message: "Invalid redirect URL" } });
    }

    // Record the click (fire and forget)
    trackingService.recordClick(data.emailId, data.url).catch(() => {});

    return reply.redirect(data.url);
  });

  // GET /unsubscribe/:encodedData — one-click unsubscribe (no auth)
  app.get<{ Params: { encodedData: string } }>("/unsubscribe/:encodedData", async (request, reply) => {
    const { encodedData } = request.params;

    try {
      const decoded = JSON.parse(Buffer.from(encodedData, "base64url").toString("utf-8"));
      const { accountId, email } = decoded;

      if (!accountId || !email) {
        return reply.status(400).header("Content-Type", "text/html").send(
          "<html><body><h1>Invalid unsubscribe link</h1></body></html>"
        );
      }

      // Add to suppression list (fire and forget, ignore duplicates)
      try {
        await addSuppression(accountId, email, "unsubscribe");
      } catch {
        // Already suppressed — that's fine
      }

      return reply.header("Content-Type", "text/html").send(
        `<html>
<head><meta charset="utf-8"><title>Unsubscribed</title></head>
<body style="font-family: sans-serif; max-width: 500px; margin: 80px auto; text-align: center;">
  <h1>You have been unsubscribed</h1>
  <p>${escapeHtml(email)} has been removed from future emails.</p>
</body>
</html>`
      );
    } catch {
      return reply.status(400).header("Content-Type", "text/html").send(
        "<html><body><h1>Invalid unsubscribe link</h1></body></html>"
      );
    }
  });
}
