import { FastifyInstance } from "fastify";
import { subscribe } from "../services/events-pubsub.service.js";
import { assertNotCompanyScoped } from "../plugins/auth.js";

const HEARTBEAT_MS = 25_000;

/**
 * Server-Sent Events (SSE) endpoint that streams email events for the
 * authenticated account in realtime. Clients receive every event the
 * webhook system would dispatch, with no signing required (the connection
 * is auth'd at the HTTP layer).
 *
 * Wire format: text/event-stream with `data: <json>\n\n` frames.
 * Periodic comment heartbeats (`: ping\n\n`) keep proxies from idling
 * the connection out.
 */
export default async function eventsRoutes(app: FastifyInstance) {
  app.addHook("onRequest", async (request) => {
    await app.authenticate(request);
    assertNotCompanyScoped(request);
  });

  app.get("/stream", async (request, reply) => {
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-store",
      Connection: "keep-alive",
      // Disables nginx buffering — without this, events sit in the proxy
      // buffer until enough bytes accumulate or the response finishes.
      "X-Accel-Buffering": "no",
    });

    // Initial comment so clients see the connection open immediately.
    reply.raw.write(": connected\n\n");

    const accountId = request.account.id;
    const send = (event: { type: string; created_at: string; data: Record<string, unknown> }) => {
      try {
        // Use the event's `type` as the SSE event name so EventSource
        // listeners can `addEventListener("email.opened", …)`.
        reply.raw.write(`event: ${event.type}\n`);
        reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
      } catch {
        // Connection probably closed — let the close handler clean up.
      }
    };

    const disposer = await subscribe(accountId, send);

    const heartbeat = setInterval(() => {
      try {
        reply.raw.write(": ping\n\n");
      } catch {
        // ignore — close handler runs.
      }
    }, HEARTBEAT_MS);

    const cleanup = () => {
      clearInterval(heartbeat);
      try {
        disposer();
      } catch {
        // ignore
      }
    };

    request.raw.on("close", cleanup);
    request.raw.on("error", cleanup);

    // Hold the request open. Returning the reply tells Fastify the response
    // is being managed manually.
    return reply;
  });
}
