import { isSeeded } from "./store";
import { seedOpenQueue } from "./pipeline";

let seeding: Promise<void> | null = null;
/** Seeds the Bell queue with the data-pack open cases on first use. */
export async function ensureSeeded() {
  if (isSeeded()) return;
  seeding ??= seedOpenQueue().finally(() => { seeding = null; });
  await seeding;
}

export const json = (data: unknown, status = 200) => Response.json(data, { status });
