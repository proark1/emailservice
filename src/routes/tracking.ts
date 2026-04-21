import { FastifyInstance } from "fastify";
import * as trackingService from "../services/tracking.service.js";
import { addSuppression } from "../services/suppression.service.js";

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/**
 * Decrypt an unsubscribe token and record the unsubscribe. Shared by the GET
 * (user-facing, HTML response) and POST (RFC 8058 one-click, 204 response)
 * endpoints so they stay in lock-step.
 */
async function applyUnsubscribeToken(encodedData: string): Promise<{ email: string } | null> {
  const { decryptPrivateKey } = await import("../lib/crypto.js");
  const { getConfig } = await import("../config/index.js");
  try {
    const decrypted = JSON.parse(decryptPrivateKey(decodeURIComponent(encodedData), getConfig().ENCRYPTION_KEY));
    const accountId: string = decrypted.a;
    const email: string = decrypted.e;
    if (!accountId || !email) return null;
    try {
      await addSuppression(accountId, email, "unsubscribe");
    } catch {
      // Already suppressed — idempotent.
    }
    return { email };
  } catch {
    return null;
  }
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

    // Parse the URL and enforce http/https only. Using URL() also rejects
    // malformed URLs, protocol-smuggling tricks ("javascript:&#10;..."), and
    // credentials-in-URL forms used for phishing.
    let parsedTarget: URL;
    try {
      parsedTarget = new URL(data.url);
    } catch {
      return reply.status(400).send({ error: { type: "bad_request", message: "Invalid redirect URL" } });
    }
    if (parsedTarget.protocol !== "http:" && parsedTarget.protocol !== "https:") {
      return reply.status(400).send({ error: { type: "bad_request", message: "Invalid redirect URL" } });
    }
    if (parsedTarget.username || parsedTarget.password) {
      return reply.status(400).send({ error: { type: "bad_request", message: "Invalid redirect URL" } });
    }

    // Record the click (fire and forget)
    trackingService.recordClick(data.emailId, parsedTarget.toString()).catch(() => {});

    return reply.redirect(parsedTarget.toString());
  });

  // GET /unsubscribe/:encodedData — user-facing one-click unsubscribe (no auth)
  app.get<{ Params: { encodedData: string } }>("/unsubscribe/:encodedData", async (request, reply) => {
    const result = await applyUnsubscribeToken(request.params.encodedData);
    if (!result) {
      return reply.status(400).header("Content-Type", "text/html").send(
        "<html><body><h1>Invalid unsubscribe link</h1></body></html>"
      );
    }
    return reply.header("Content-Type", "text/html").send(
      `<html>
<head><meta charset="utf-8"><title>Unsubscribed</title></head>
<body style="font-family: sans-serif; max-width: 500px; margin: 80px auto; text-align: center;">
  <h1>You have been unsubscribed</h1>
  <p>${escapeHtml(result.email)} has been removed from future emails.</p>
</body>
</html>`
    );
  });

  // POST /unsubscribe/:encodedData — RFC 8058 one-click unsubscribe (no auth).
  // Called by mail clients (Gmail, Yahoo, Apple Mail) when the user hits the
  // unsubscribe button. Must be POST-capable or bulk senders are deprioritized.
  app.post<{ Params: { encodedData: string } }>("/unsubscribe/:encodedData", async (request, reply) => {
    const result = await applyUnsubscribeToken(request.params.encodedData);
    if (!result) {
      return reply.status(400).send({ error: { type: "bad_request", message: "Invalid unsubscribe link" } });
    }
    return reply.status(204).send();
  });
}
