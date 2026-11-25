import type { Path } from "aep-node";
import type { StreamFramingMode, WebSocketTransportMode } from "aep-node/transport";

export interface AepDiscoveryManifest {
  protocolVersion?: string;
  name?: string;
  aepEndpoint?: string;
  transport?: string;
  mode?: WebSocketTransportMode;
  rootPath?: Path;
  [key: string]: unknown;
}

export type ResolvedEndpointTarget =
  | {
      transportKind: "websocket";
      originalInput: string;
      wsUrl: string;
      mode: WebSocketTransportMode;
      sourcePath?: Path;
      discoveredName?: string;
      discoveryUrl?: string;
      manifest?: AepDiscoveryManifest;
    }
  | {
      transportKind: "tcp";
      originalInput: string;
      host: string;
      port: number;
      framing?: StreamFramingMode;
      sourcePath?: Path;
    };

export interface ResolveEndpointOptions {
  mode?: WebSocketTransportMode;
  sourcePath?: Path;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function normalizeEndpointShorthand(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error("Endpoint URL cannot be empty");
  }
  if (/^:\d+(\/.*)?$/.test(trimmed)) {
    const slashIdx = trimmed.indexOf("/");
    if (slashIdx === -1) {
      return `http://127.0.0.1${trimmed}`;
    }
    const portPart = trimmed.slice(0, slashIdx);
    const pathPart = trimmed.slice(slashIdx);
    return pathPart === "/.well-known/aep.json"
      ? `http://127.0.0.1${portPart}${pathPart}`
      : `ws://127.0.0.1${portPart}${pathPart}`;
  }
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed)) {
    return trimmed;
  }
  if (/^[^/\s]+:\d+(\/.*)?$/.test(trimmed)) {
    const slashIdx = trimmed.indexOf("/");
    if (slashIdx === -1) {
      return `http://${trimmed}`;
    }
    const pathPart = trimmed.slice(slashIdx);
    return pathPart === "/.well-known/aep.json" ? `http://${trimmed}` : `ws://${trimmed}`;
  }
  return trimmed;
}

export function sanitizeMountId(raw: string): string {
  const cleaned = raw
    .trim()
    .replace(/^\/+/, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!cleaned) {
    return "endpoint";
  }
  if (!/^[A-Za-z0-9_]/.test(cleaned)) {
    return `ep-${cleaned}`;
  }
  return cleaned.slice(0, 64);
}

export async function resolveEndpointTarget(
  rawInput: string,
  options: ResolveEndpointOptions = {},
): Promise<ResolvedEndpointTarget> {
  const normalized = normalizeEndpointShorthand(rawInput);
  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error(
      `Invalid endpoint URL "${rawInput}". Expected ws://, wss://, http://, https://, or tcp://host:port.`,
    );
  }

  const protocol = parsed.protocol.toLowerCase();

  if (protocol === "ws:" || protocol === "wss:") {
    return {
      transportKind: "websocket",
      originalInput: rawInput.trim(),
      wsUrl: parsed.toString(),
      mode: options.mode ?? "binary",
      ...(options.sourcePath !== undefined ? { sourcePath: options.sourcePath } : {}),
    };
  }

  if (protocol === "tcp:") {
    const host = parsed.hostname || "127.0.0.1";
    const port = Number(parsed.port);
    if (!Number.isInteger(port) || port <= 0 || port > 65535) {
      throw new Error(`Invalid TCP port in "${rawInput}". Expected tcp://host:port.`);
    }
    return {
      transportKind: "tcp",
      originalInput: rawInput.trim(),
      host,
      port,
      ...(options.sourcePath !== undefined ? { sourcePath: options.sourcePath } : {}),
    };
  }

  if (protocol === "http:" || protocol === "https:") {
    const fetchFn = options.fetchImpl ?? fetch;
    const timeoutMs = options.timeoutMs ?? 8_000;
    const isManifestUrl = parsed.pathname.endsWith(".json");
    const discoveryUrl = isManifestUrl
      ? parsed.toString()
      : new URL("/.well-known/aep.json", parsed.origin).toString();

    let manifestError: string | undefined;
    try {
      const res = await fetchFn(discoveryUrl, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.ok) {
        const json = (await res.json()) as unknown;
        if (isPlainObject(json) && typeof json["aepEndpoint"] === "string") {
          const manifest = json as AepDiscoveryManifest;
          const endpointRaw = manifest.aepEndpoint!;
          let wsUrl: string;
          if (/^wss?:\/\//i.test(endpointRaw)) {
            wsUrl = endpointRaw;
          } else {
            const resolvedHttp = new URL(endpointRaw, parsed.origin);
            resolvedHttp.protocol = protocol === "https:" ? "wss:" : "ws:";
            wsUrl = resolvedHttp.toString();
          }
          const manifestMode =
            manifest.mode === "json" || manifest.mode === "binary" ? manifest.mode : undefined;
          const rootPath =
            typeof manifest.rootPath === "string" && manifest.rootPath.startsWith("/")
              ? manifest.rootPath
              : undefined;
          return {
            transportKind: "websocket",
            originalInput: rawInput.trim(),
            wsUrl,
            mode: options.mode ?? manifestMode ?? "binary",
            ...(options.sourcePath !== undefined
              ? { sourcePath: options.sourcePath }
              : rootPath !== undefined
                ? { sourcePath: rootPath }
                : {}),
            ...(typeof manifest.name === "string" ? { discoveredName: manifest.name } : {}),
            discoveryUrl,
            manifest,
          };
        }
        manifestError = `Discovery manifest at ${discoveryUrl} did not contain string "aepEndpoint"`;
      } else {
        manifestError = `HTTP ${res.status} from ${discoveryUrl}`;
      }
    } catch (err) {
      manifestError = err instanceof Error ? err.message : String(err);
    }

    // If user explicitly provided a non-root path like http://127.0.0.1:8781/aep, allow direct WS upgrade fallback
    if (!isManifestUrl && parsed.pathname && parsed.pathname !== "/") {
      const fallbackWs = new URL(parsed.toString());
      fallbackWs.protocol = protocol === "https:" ? "wss:" : "ws:";
      return {
        transportKind: "websocket",
        originalInput: rawInput.trim(),
        wsUrl: fallbackWs.toString(),
        mode: options.mode ?? "binary",
        ...(options.sourcePath !== undefined ? { sourcePath: options.sourcePath } : {}),
      };
    }

    throw new Error(
      `Could not discover AEP endpoint from "${rawInput}" (${manifestError ?? "unknown error"}). Provide a ws:// URL directly (e.g. ws://127.0.0.1:8781/aep) or ensure /.well-known/aep.json is served.`,
    );
  }

  throw new Error(
    `Unsupported protocol "${protocol}" in "${rawInput}". Supported: ws://, wss://, http://, https://, tcp://.`,
  );
}
