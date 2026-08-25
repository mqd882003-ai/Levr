// Applies SQL migrations in supabase/migrations/ in filename order.
// Tracks applied files in a _migrations table so re-runs are safe.
//
//   npm run db:migrate            # apply all pending
//   npm run db:migrate -- --dry   # list what would run, touch nothing
//
// Needs DATABASE_URL in .env.local (Supabase Dashboard > Connect > Session pooler URI).
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import pg from "pg";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
dotenv.config({ path: path.join(root, ".env.local"), quiet: true });

const url = process.env.DATABASE_URL;
if (!url || url.includes("YOUR-DB-PASSWORD")) {
  console.error(
    "DATABASE_URL is not set in .env.local.\n" +
      "Get it from Supabase Dashboard > Connect > Session pooler, and add it as:\n" +
      "DATABASE_URL=postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres",
  );
  process.exit(1);
}

const dry = process.argv.includes("--dry");
const dir = path.join(root, "supabase", "migrations");
const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  await client.query(
    "create table if not exists _migrations (name text primary key, applied_at timestamptz not null default now())",
  );
  const { rows } = await client.query("select name from _migrations");
  const done = new Set(rows.map((r) => r.name));
  const pending = files.filter((f) => !done.has(f));

  if (!pending.length) {
    console.log("Nothing to apply — all " + files.length + " migration(s) already applied.");
  }
  for (const file of pending) {
    if (dry) {
      console.log("[dry] would apply " + file);
      continue;
    }
    const sql = await readFile(path.join(dir, file), "utf8");
    console.log("Applying " + file + " ...");
    // Migration files manage their own begin/commit; record separately after success.
    await client.query(sql);
    await client.query("insert into _migrations (name) values ($1)", [file]);
    console.log("  ok");
  }
} finally {
  await client.end();
}
