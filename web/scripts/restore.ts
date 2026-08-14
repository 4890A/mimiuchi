import fs from "node:fs";
import path from "node:path";
import {
  BackupValidationError,
  restoreBackup,
  validateBackup,
} from "../src/lib/backup";

function usage(): never {
  console.error(
    `Usage: tsx --tsconfig scripts/tsconfig.json scripts/restore.ts <backup.json> [--dry-run]`,
  );
  process.exit(1);
}

function parseArgs(argv: string[]) {
  let input: string | undefined;
  let dryRun = false;
  for (const arg of argv) {
    if (arg === "--dry-run") dryRun = true;
    else if (arg.startsWith("-")) {
      console.error(`Unknown argument: ${arg}`);
      usage();
    } else if (input === undefined) input = arg;
    else usage();
  }
  if (!input) usage();
  return { input, dryRun };
}

async function main() {
  const { input, dryRun } = parseArgs(process.argv.slice(2));
  const file = path.resolve(input);
  if (!fs.existsSync(file)) {
    console.error(`No such file: ${file}`);
    process.exit(1);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    console.error("Invalid backup file: not valid JSON");
    process.exit(1);
  }

  try {
    validateBackup(parsed);
  } catch (err) {
    if (err instanceof BackupValidationError) {
      console.error(err.message);
      process.exit(1);
    }
    throw err;
  }

  console.log(`[restore] ${dryRun ? "Validating" : "Restoring"} ${file}...`);
  const summary = await restoreBackup(parsed, { dryRun });

  for (const [table, count] of Object.entries(summary.imported)) {
    if (count > 0) console.log(`[restore]   ${table}: ${count}`);
  }
  if (summary.remapped > 0) {
    console.log(`[restore]   paths remapped: ${summary.remapped}`);
  }
  if (summary.notFound.length > 0) {
    console.log(`[restore]   works not found on disk: ${summary.notFound.length}`);
  }
  for (const warning of summary.warnings) {
    console.warn(`[restore]   ! ${warning}`);
  }
  for (const error of summary.errors) {
    console.error(`[restore]   ✗ ${error}`);
  }

  console.log(
    dryRun ? "\n=== Dry run complete (nothing written) ===" : "\n=== Restore complete ===",
  );
  process.exit(summary.errors.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
