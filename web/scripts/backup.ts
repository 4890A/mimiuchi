import fs from "node:fs";
import path from "node:path";
import { createBackup } from "../src/lib/backup";

function usage(): never {
  console.error(
    `Usage: tsx --tsconfig scripts/tsconfig.json scripts/backup.ts --output <file>`,
  );
  process.exit(1);
}

function parseArgs(argv: string[]) {
  let output: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--output" || arg === "-o") {
      output = argv[++i];
    } else if (arg.startsWith("--output=")) {
      output = arg.slice("--output=".length);
    } else {
      console.error(`Unknown argument: ${arg}`);
      usage();
    }
  }
  if (!output) usage();
  return { output };
}

async function main() {
  const { output } = parseArgs(process.argv.slice(2));

  console.log(`[backup] Exporting...`);
  const backup = await createBackup();

  const dir = path.dirname(path.resolve(output));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.resolve(output), JSON.stringify(backup));

  for (const [table, rows] of Object.entries(backup.data)) {
    if (rows.length > 0) console.log(`[backup]   ${table}: ${rows.length}`);
  }
  const coverCount = Object.keys(backup.covers).length;
  console.log(`[backup]   covers: ${coverCount}`);

  const size = fs.statSync(path.resolve(output)).size;
  console.log(
    `[backup] Wrote ${path.resolve(output)} (${(size / 1024 / 1024).toFixed(1)} MB)`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
