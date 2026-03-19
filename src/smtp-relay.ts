import { loadConfig } from "./config/index.js";
import { createRelayServer } from "./smtp/relay-server.js";

async function main() {
  const config = loadConfig();
  const server = createRelayServer();

  server.listen(config.SMTP_RELAY_PORT, "0.0.0.0", () => {
    console.log(`SMTP Relay server listening on port ${config.SMTP_RELAY_PORT}`);
  });

  const shutdown = () => {
    console.log("Shutting down SMTP relay...");
    server.close(() => process.exit(0));
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((err) => {
  console.error("Failed to start SMTP relay:", err);
  process.exit(1);
});
