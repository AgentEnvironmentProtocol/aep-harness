import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export function loadEnvFile(filePath: string = path.resolve(process.cwd(), ".env")): boolean {
  if (!existsSync(filePath)) {
    return false;
  }
  const raw = readFileSync(filePath, "utf8");
  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const stripped = line.startsWith("export ") ? line.slice("export ".length).trim() : line;
    const eqIdx = stripped.indexOf("=");
    if (eqIdx <= 0) {
      continue;
    }
    const key = stripped.slice(0, eqIdx).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      continue;
    }
    if (process.env[key] !== undefined) {
      continue;
    }
    let val = stripped.slice(eqIdx + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"') && val.length >= 2) ||
      (val.startsWith("'") && val.endsWith("'") && val.length >= 2)
    ) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  }
  return true;
}
