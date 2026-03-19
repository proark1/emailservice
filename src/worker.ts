import { loadConfig } from "./config/index.js";
import { startAllWorkers } from "./workers/index.js";
import { closeQueues } from "./queues/index.js";
import { closeDb } from "./db/index.js";

async function main() {
  loadConfig();
  const workers = startAllWorkers();

  console.log("Worker process started. Waiting for jobs...");

  const shutdown = async () => {
    console.log("Shutting down workers...");
    await Promise.all(workers.map((w) => w.close()));
    await closeQueues();
    await closeDb();
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((err) => {
  console.error("Failed to start workers:", err);
  process.exit(1);
});
