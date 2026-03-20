import { FastifyInstance } from "fastify";
import * as trackingService from "../services/tracking.service.js";

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
}
