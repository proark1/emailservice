import type { accounts, apiKeys } from "../db/schema/index.js";
import type { InferSelectModel } from "drizzle-orm";

declare module "fastify" {
  interface FastifyRequest {
    account: InferSelectModel<typeof accounts>;
    apiKey: InferSelectModel<typeof apiKeys>;
  }
}
