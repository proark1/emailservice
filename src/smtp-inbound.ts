import { loadConfig } from "./config/index.js";
import { createInboundServer } from "./smtp/inbound-server.js";

async function main() {
  const config = loadConfig();
  const server = createInboundServer();

  server.listen(config.SMTP_INBOUND_PORT, "0.0.0.0", () => {
    console.log(`SMTP Inbound server listening on port ${config.SMTP_INBOUND_PORT}`);
  });

  const shutdown = () => {
    console.log("Shutting down SMTP inbound...");
    server.close(() => process.exit(0));
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((err) => {
  console.error("Failed to start SMTP inbound:", err);
  process.exit(1);
});
