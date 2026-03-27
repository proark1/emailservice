import { defineConfig } from "tsup";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/worker.ts",
    "src/smtp-relay.ts",
    "src/smtp-inbound.ts",
    "src/mcp-server.ts",
  ],
  format: ["esm"],
  target: "node20",
  outDir: "dist",
  clean: true,
  splitting: true,
  sourcemap: true,
});
