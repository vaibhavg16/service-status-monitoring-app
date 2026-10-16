import "dotenv/config";
import { defineConfig } from "drizzle-kit";

// Unlike the old drizzle.config.json (a static file with a hardcoded URL),
// this reads DATABASE_URL from your .env automatically, AND still lets you
// override it on the command line when you need to target a different
// database, e.g.:
//   DATABASE_URL="postgresql://postgres:postgres@localhost:5433/app_db" npx drizzle-kit push
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      "postgresql://postgres:postgres@127.0.0.1:5432/app_db",
  },
});
