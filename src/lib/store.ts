/**
 * Simple file-backed flow store.
 * Reads/writes flows.json at the project root.
 * Flows persist across server restarts and page refreshes.
 */

import fs from "fs";
import path from "path";
import type { Flow } from "@/data/dashboard";

const STORE_PATH = path.join(process.cwd(), "flows.json");

function readAll(): Flow[] {
  try {
    if (!fs.existsSync(STORE_PATH)) return [];
    return JSON.parse(fs.readFileSync(STORE_PATH, "utf8")) as Flow[];
  } catch {
    return [];
  }
}

function writeAll(flows: Flow[]): void {
  fs.writeFileSync(STORE_PATH, JSON.stringify(flows, null, 2), "utf8");
}

/** Return all flows, newest first. */
export function getAllFlows(): Flow[] {
  return readAll();
}

/** Save a new flow (upsert — replaces if same id exists). */
export function saveFlow(flow: Flow): void {
  const flows = readAll().filter((f) => f.id !== flow.id);
  writeAll([flow, ...flows]);
}
