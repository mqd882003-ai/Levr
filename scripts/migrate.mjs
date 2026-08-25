// Applies SQL migrations in supabase/migrations/ in filename order.
// Tracks applied files in a _migrations table so re-runs are safe.
//
//   npm run db:migrate            # apply all pending
//   npm run db:migrate -- --dry   # list what would run, touch nothing
//
// Transport (first available wins):
//   1. SUPABASE_ACCESS_TOKEN in .env.local — Supabase Management API over HTTPS
//      (personal access token from supabase.com/dashboard/account/tokens).
//      Preferred: no database password involved.
//   2. DATABASE_URL in .env.local — direct Postgres via the session pooler.
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import pg from "pg";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
dotenv.config({ path: path.join(root, ".env.local"), quiet: true });

const dry = process.argv.includes("--dry");
const dir = path.join(root, "supabase", "migrations");
const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();

// ---------- transports ----------

function managementTransport() {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const ref = /https:\/\/([a-z0-9]+)\.supabase\.co/.exec(url)?.[1];
  if (!token || !ref) return null;
  return {
    name: `Management API (project ${ref})`,
    async query(sql) {
      const res = await fetch(
        `https://api.supabase.com/v1/projects/${ref}/database/query`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ query: sql }),
        },
      );
      const body = await res.text();
      if (!res.ok) throw new Error(`Management API ${res.status}: ${body.slice(0, 400)}`);
      try {
        return JSON.parse(body);
      } catch {
        return [];
      }
    },
    async close() {},
  };
}

async function pgTransport() {
  const url = process.env.DATABASE_URL;
  if (!url || url.includes("YOUR-DB-PASSWORD")) return null;
  const client = new pg.Client({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 12000,
  });
  await client.connect();
  return {
    name: "Postgres (session pooler)",
    async query(sql, params) {
      const r = await client.query(
        params ? { text: sql, values: params } : sql,
      );
      return r.rows ?? [];
    },
    async close() {
      await client.end();
    },
  };
}

let t = managementTransport();
if (!t) {
  try {
    t = await pgTransport();
  } catch (err) {
    console.error("DATABASE_URL connection failed: " + err.message);
  }
}
if (!t) {
  console.error(
    "No working transport. Set SUPABASE_ACCESS_TOKEN (preferred — personal access\n" +
      "token from supabase.com/dashboard/account/tokens) or a valid DATABASE_URL in .env.local.",
  );
  process.exit(1);
}
console.log("Using: " + t.name);

// ---------- run ----------

// Literals are embedded via dollar-quoting for the Management API path (it has
// no parameter binding); migration filenames are our own trusted constants.
const q = (s) => {
  if (s.includes("$mig$")) throw new Error("filename collides with quote tag");
  return "$mig$" + s + "$mig$";
};

try {
  await t.query(
    "create table if not exists _migrations (name text primary key, applied_at timestamptz not null default now())",
  );
  const rows = await t.query("select name from _migrations");
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
    await t.query(sql);
    await t.query("insert into _migrations (name) values (" + q(file) + ")");
    console.log("  ok");
  }
} finally {
  await t.close();
}
