import { defineConfig } from "drizzle-kit";

// drizzle-kit runs on the host machine, not inside Docker. When DATABASE_URL
// uses a Docker service name as the host (e.g. "postgres"), it won't resolve
// from the host. Substitute with "localhost" so migrations work without having
// to manually override DATABASE_URL every time.
const rawUrl = process.env.DATABASE_URL || "postgresql://emailservice:emailservice_dev@localhost:5432/emailservice";
const dbUrl = rawUrl.replace(/@([^/:@]+):(\d+)\//, (_match, host, port) => {
  const dockerServiceNames = ["postgres", "db", "database", "postgresql"];
  const resolvedHost = dockerServiceNames.includes(host) ? "localhost" : host;
  return `@${resolvedHost}:${port}/`;
});

export default defineConfig({
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: dbUrl },
});
