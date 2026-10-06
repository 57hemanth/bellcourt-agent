/**
 * Case store — a JSON file under data/runtime (demo persistence; production would be
 * Azure SQL/Postgres inside the BAA tenant). Writes are serialized through a promise chain.
 */
import fs from "node:fs";
import path from "node:path";
import type { CaseRecord } from "./types";

const DIR = path.join(process.cwd(), "data", "runtime");
const FILE = path.join(DIR, "cases.json");
export const UPLOAD_DIR = path.join(DIR, "uploads");

let cache: CaseRecord[] | null = null;
let chain: Promise<unknown> = Promise.resolve();

function load(): CaseRecord[] {
  if (cache) return cache;
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  cache = fs.existsSync(FILE) ? (JSON.parse(fs.readFileSync(FILE, "utf8")) as CaseRecord[]) : [];
  return cache;
}

function persist() {
  const data = JSON.stringify(cache, null, 2);
  chain = chain.then(() => fs.promises.writeFile(FILE, data));
  return chain;
}

export const isSeeded = () => load().length > 0;
export const listCases = () => [...load()].sort((a, b) => a.dueAt.localeCompare(b.dueAt));
export const getCase = (id: string) => load().find((c) => c.id === id) ?? null;

export async function saveCase(c: CaseRecord) {
  const all = load();
  const i = all.findIndex((x) => x.id === c.id);
  if (i >= 0) all[i] = c;
  else all.push(c);
  await persist();
  return c;
}

export async function clearStore() {
  cache = [];
  await persist();
  for (const f of fs.existsSync(UPLOAD_DIR) ? fs.readdirSync(UPLOAD_DIR) : []) fs.unlinkSync(path.join(UPLOAD_DIR, f));
}

export function nextCaseId(): string {
  const now = new Date();
  const prefix = `BC-${String(now.getUTCFullYear()).slice(2)}${String(now.getUTCMonth() + 1).padStart(2, "0")}-`;
  const n = load().filter((c) => c.id.startsWith(prefix)).length + 1;
  return `${prefix}${String(n).padStart(4, "0")}`;
}
