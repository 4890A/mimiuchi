import type { Config } from "drizzle-kit";
import path from "node:path";

const dataDir = process.env.KIKOERU_DATA_DIR
  ? path.resolve(process.env.KIKOERU_DATA_DIR)
  : path.resolve(process.cwd(), "..", "data");

export default {
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: path.join(dataDir, "kikoeru.db"),
  },
} satisfies Config;
