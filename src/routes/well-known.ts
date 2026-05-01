import { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { domains } from "../db/schema/index.js";
import { generateMtaStsPolicyFile } from "../services/dns.service.js";
import { getMailHost } from "../config/index.js";

/**
 * Public, unauthenticated host-matched routes:
 *   - GET /.well-known/mta-sts.txt — MTA-STS policy file. RFC 8461 says it
 *     must be served from `https://mta-sts.<domain>/.well-known/mta-sts.txt`,
 *     so we look up the domain by stripping the `mta-sts.` prefix from the
 *     Host header.
 *
 * Receivers cache the policy for `max_age` seconds, so this endpoint is
 * served ~once per receiver per day. We don't bother with a CDN tier.
 */
export default async function wellKnownRoutes(app: FastifyInstance) {
  app.get("/mta-sts.txt", async (request, reply) => {
    const host = (request.headers.host ?? "").toLowerCase().split(":")[0];
    if (!host.startsWith("mta-sts.")) {
      return reply.status(404).type("text/plain").send("not found");
    }
    const domainName = host.slice("mta-sts.".length);
    const db = getDb();
    const [domain] = await db
      .select({
        mtaStsMode: domains.mtaStsMode,
      })
      .from(domains)
      .where(eq(domains.name, domainName));
    if (!domain) {
      return reply.status(404).type("text/plain").send("not found");
    }
    const mode = (domain.mtaStsMode as "none" | "testing" | "enforce") || "none";
    if (mode === "none") {
      return reply.status(404).type("text/plain").send("not found");
    }
    const body = generateMtaStsPolicyFile(mode, getMailHost(), 86400);
    return reply
      .header("Content-Type", "text/plain")
      .header("Cache-Control", "public, max-age=86400")
      .send(body);
  });
}
