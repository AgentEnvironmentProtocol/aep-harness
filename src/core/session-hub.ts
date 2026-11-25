import { randomUUID } from "node:crypto";
import {
  AEP_ERROR_CODES,
  AepError,
  isPathWithin,
  rebasePath,
  synthesizeRenderMinimal,
  type AepNode,
  type AllowedFactor,
  type BodyRoot,
  type DataRenderOptions,
  type ElevationGrantSummary,
  type ElevationLevel,
  type GetBinaryOptions,
  type LeaseMode,
  type MetaMap,
  type NodeGetResult,
  type NodeInvokeResult,
  type NodeLoadChildrenResult,
  type Path,
  type RenderMode,
  type SecurityDescriptor,
  type ServerInfo,
  type SessionAcquireLeaseResult,
  type SessionDescriptor,
  type SessionElevateResult,
  type SessionRole,
  type TreeGetParams,
  type TreeGetResult,
  type TreeQueryParams,
  type TreeQueryResult,
} from "aep-node";
import { AepClient, AepCompositeClient } from "aep-node/client";
import {
  connectNetStream,
  connectWebSocket,
  type Transport,
  type WebSocketTransportMode,
} from "aep-node/transport";
import {
  resolveEndpointTarget,
  sanitizeMountId,
  type ResolveEndpointOptions,
} from "./discovery.js";

export interface ConnectEndpointOptions {
  url?: string;
  transport?: Transport;
  mountId?: string;
  sourcePath?: Path;
  mode?: WebSocketTransportMode;
  role?: SessionRole;
  allowDowngradeToObserver?: boolean;
  auth?: {
    mode: "bearer" | "api-key";
    token?: string;
    apiKey?: string;
  };
  discoveryOptions?: ResolveEndpointOptions;
}

export interface EndpointLeaseSummary {
  leaseId: string;
  path: Path;
  downstreamPath: Path;
  mode: LeaseMode;
  expiresAt: string;
}

export interface EndpointSummary {
  mountId: string;
  anchorPath: Path;
  sourcePath: Path;
  originalUrl: string;
  resolvedEndpoint: string;
  transportKind: "websocket" | "tcp" | "custom";
  mode?: WebSocketTransportMode;
  connected: boolean;
  connectedAt: string;
  protocolVersion: string;
  serverInfo?: ServerInfo;
  role: SessionRole;
  session?: SessionDescriptor;
  security?: SecurityDescriptor;
  head: MetaMap;
  leases: EndpointLeaseSummary[];
  grants: ElevationGrantSummary[];
}

export type HarnessLogKind =
  | "connection"
  | "invoke"
  | "notification"
  | "command"
  | "agent"
  | "error";

export interface HarnessLogEntry {
  id: string;
  timestamp: string;
  kind: HarnessLogKind;
  level: "info" | "ok" | "warn" | "error";
  title: string;
  detail?: string;
  data?: unknown;
}

export interface SerializedRenderResult {
  path: Path;
  resolvedPath?: Path;
  mode: RenderMode;
  mediaType: string;
  synthesizedFallback: boolean;
  svgText?: string;
  base64Data?: string;
  byteLength: number;
  pathMap?: Record<string, Path>;
}

export interface SerializedBinaryResult {
  refId: string;
  mediaType: string;
  byteLength: number;
  base64Data: string;
  textPreview?: string;
}

interface MountedEndpointInternal {
  mountId: string;
  anchorPath: Path;
  sourcePath: Path;
  originalUrl: string;
  resolvedEndpoint: string;
  transportKind: "websocket" | "tcp" | "custom";
  mode?: WebSocketTransportMode;
  connectedAt: string;
  client: AepClient;
  leases: Map<string, EndpointLeaseSummary>;
  grants: Map<string, ElevationGrantSummary>;
  unsubscribers: Array<() => void>;
}

const DEFAULT_MAX_LOGS = 300;

export class AepHarnessHub {
  readonly composite = new AepCompositeClient();
  private readonly mounts = new Map<string, MountedEndpointInternal>();
  private readonly logs: HarnessLogEntry[] = [];
  private readonly maxLogs: number;
  private readonly changeListeners = new Set<(reason: string) => void>();
  private readonly logListeners = new Set<(entry: HarnessLogEntry) => void>();
  private readonly compositeUnsubscribers: Array<() => void> = [];

  constructor(options: { maxLogs?: number } = {}) {
    this.maxLogs = options.maxLogs ?? DEFAULT_MAX_LOGS;
    this.attachCompositeListeners();
  }

  private attachCompositeListeners(): void {
    this.compositeUnsubscribers.push(
      this.composite.onNodeAdded((ev) => {
        const addedPath =
          ev.parentPath === "/" ? `/${ev.node.id}` : `${ev.parentPath}/${ev.node.id}`;
        this.pushLog({
          kind: "notification",
          level: "info",
          title: `node.added ${addedPath}`,
          detail: `${ev.node.kind}${"type" in ev.node && ev.node.type ? `:${ev.node.type}` : ""}`,
        });
        this.emitChange("node.added");
      }),
      this.composite.onNodeUpdated((ev) => {
        this.pushLog({
          kind: "notification",
          level: "info",
          title: `node.updated ${ev.path}`,
          detail:
            ev.node.revision !== undefined ? `rev=${ev.node.revision}` : `${ev.node.kind}`,
        });
        this.emitChange("node.updated");
      }),
      this.composite.onNodeMoved((ev) => {
        this.pushLog({
          kind: "notification",
          level: "info",
          title: `node.moved ${ev.fromPath} -> ${ev.toPath}`,
        });
        this.emitChange("node.moved");
      }),
      this.composite.onNodeRemoved((ev) => {
        this.pushLog({
          kind: "notification",
          level: "info",
          title: `node.removed ${ev.path}`,
        });
        this.emitChange("node.removed");
      }),
      this.composite.onNodeEvent((ev) => {
        this.pushLog({
          kind: "notification",
          level: "info",
          title: `node.event ${ev.path} :: ${ev.event}`,
          ...(ev.data !== undefined ? { data: ev.data } : {}),
        });
        this.emitChange("node.event");
      }),
    );
  }

  onChange(listener: (reason: string) => void): () => void {
    this.changeListeners.add(listener);
    return () => {
      this.changeListeners.delete(listener);
    };
  }

  onLog(listener: (entry: HarnessLogEntry) => void): () => void {
    this.logListeners.add(listener);
    return () => {
      this.logListeners.delete(listener);
    };
  }

  private emitChange(reason: string): void {
    for (const listener of this.changeListeners) {
      listener(reason);
    }
  }

  pushLog(entry: Omit<HarnessLogEntry, "id" | "timestamp">): HarnessLogEntry {
    const full: HarnessLogEntry = {
      id: `log-${randomUUID().slice(0, 8)}`,
      timestamp: new Date().toISOString(),
      ...entry,
    };
    this.logs.push(full);
    if (this.logs.length > this.maxLogs) {
      this.logs.splice(0, this.logs.length - this.maxLogs);
    }
    for (const listener of this.logListeners) {
      listener(full);
    }
    return full;
  }

  getLogs(): HarnessLogEntry[] {
    return [...this.logs];
  }

  clearLogs(): void {
    this.logs.length = 0;
    this.emitChange("logs.cleared");
  }

  private chooseUniqueMountId(preferredRaw: string): string {
    const base = sanitizeMountId(preferredRaw);
    if (!this.mounts.has(base)) {
      return base;
    }
    let idx = 2;
    while (this.mounts.has(`${base}-${idx}`)) {
      idx += 1;
    }
    return `${base}-${idx}`;
  }

  async connectEndpoint(options: ConnectEndpointOptions): Promise<EndpointSummary> {
    let transport: Transport;
    let originalUrl = options.url?.trim() || "memory://custom";
    let resolvedEndpoint = originalUrl;
    let transportKind: "websocket" | "tcp" | "custom" = "custom";
    let mode: WebSocketTransportMode | undefined = options.mode;
    let discoveredSourcePath: Path | undefined;
    let discoveredName: string | undefined;

    if (options.transport) {
      transport = options.transport;
    } else if (options.url) {
      const resolved = await resolveEndpointTarget(options.url, {
        ...(options.mode !== undefined ? { mode: options.mode } : {}),
        ...(options.sourcePath !== undefined ? { sourcePath: options.sourcePath } : {}),
        ...options.discoveryOptions,
      });
      originalUrl = resolved.originalInput;
      if (resolved.transportKind === "websocket") {
        transportKind = "websocket";
        resolvedEndpoint = resolved.wsUrl;
        mode = resolved.mode;
        discoveredSourcePath = resolved.sourcePath;
        discoveredName = resolved.discoveredName;
        transport = await connectWebSocket(resolved.wsUrl, { mode: resolved.mode });
      } else {
        transportKind = "tcp";
        resolvedEndpoint = `tcp://${resolved.host}:${resolved.port}`;
        discoveredSourcePath = resolved.sourcePath;
        transport = await connectNetStream({
          host: resolved.host,
          port: resolved.port,
          ...(resolved.framing !== undefined ? { framing: resolved.framing } : {}),
        });
      }
    } else {
      throw new Error("connectEndpoint requires either url or transport");
    }

    const security =
      options.auth?.mode === "bearer" && options.auth.token
        ? { mode: "bearer" as const, token: options.auth.token }
        : options.auth?.mode === "api-key" && options.auth.apiKey
          ? { mode: "api-key" as const, apiKey: options.auth.apiKey }
          : { mode: "unauthenticated" as const, reserved: true };

    const client = new AepClient(transport, {
      clientInfo: {
        name: "aep-harness",
        version: "1.0.0-beta.0",
      },
      capabilities: "aep-core-streaming",
      security,
      session: {
        role: options.role ?? "controller",
        allowDowngradeToObserver: options.allowDowngradeToObserver ?? true,
      },
      syncTree: false,
    });

    try {
      const initRes = await client.initialize();
      if (initRes.authRequired && options.auth) {
        await client.authenticate({
          mode: options.auth.mode,
          ...(options.auth.token !== undefined ? { token: options.auth.token } : {}),
          ...(options.auth.apiKey !== undefined ? { apiKey: options.auth.apiKey } : {}),
        });
      }
      if (!client.isInitialized) {
        throw new Error(
          `Endpoint "${resolvedEndpoint}" requires authentication (${initRes.security.mode})`,
        );
      }

      const rootSnapshot = await client.getTree({ path: "/", maxDepth: 1, includeHead: true });
      let sourcePath: Path = "/";
      let defaultIdCandidate =
        discoveredName || client.serverInfo?.name || "endpoint";

      if (options.sourcePath !== undefined) {
        sourcePath = options.sourcePath;
        if (sourcePath !== "/") {
          defaultIdCandidate = sourcePath.split("/").filter(Boolean).pop() ?? defaultIdCandidate;
        }
      } else if (discoveredSourcePath && discoveredSourcePath !== "/") {
        sourcePath = discoveredSourcePath;
        defaultIdCandidate =
          discoveredSourcePath.split("/").filter(Boolean).pop() ?? defaultIdCandidate;
      } else if (rootSnapshot.node.kind === "body" && rootSnapshot.node.children.length === 1) {
        const singleChild = rootSnapshot.node.children[0]!;
        sourcePath = `/${singleChild.id}`;
        defaultIdCandidate = singleChild.id;
      }

      const mountId = this.chooseUniqueMountId(options.mountId ?? defaultIdCandidate);
      const anchorPath: Path = `/${mountId}`;

      await this.composite.mountServer(anchorPath, client, {
        sourcePath,
        mountKey: mountId,
      });

      const entry: MountedEndpointInternal = {
        mountId,
        anchorPath,
        sourcePath,
        originalUrl,
        resolvedEndpoint,
        transportKind,
        ...(mode !== undefined ? { mode } : {}),
        connectedAt: new Date().toISOString(),
        client,
        leases: new Map(),
        grants: new Map(),
        unsubscribers: [],
      };

      entry.unsubscribers.push(
        client.onHeadUpdated(() => {
          this.emitChange("head.updated");
        }),
        client.onElevationUpdated((ev) => {
          const existing = entry.grants.get(ev.grantId);
          if (ev.status === "expired" || ev.status === "revoked" || ev.status === "denied") {
            entry.grants.delete(ev.grantId);
          } else if (existing && ev.expiresAt !== undefined) {
            existing.expiresAt = ev.expiresAt;
          }
          this.pushLog({
            kind: "notification",
            level: ev.status === "granted" ? "ok" : "warn",
            title: `session.elevationUpdated (${mountId})`,
            detail: `grant=${ev.grantId} status=${ev.status}`,
          });
          this.emitChange("session.elevationUpdated");
        }),
        client.onLeaseUpdated((ev) => {
          if (ev.status === "released" || ev.status === "expired") {
            entry.leases.delete(ev.leaseId);
          }
          this.pushLog({
            kind: "notification",
            level: "info",
            title: `session.leaseUpdated (${mountId})`,
            detail: `lease=${ev.leaseId} status=${ev.status} path=${ev.path}`,
          });
          this.emitChange("session.leaseUpdated");
        }),
        client.onClose((err) => {
          this.pushLog({
            kind: "connection",
            level: err ? "warn" : "info",
            title: `Endpoint closed: ${anchorPath}`,
            ...(err ? { detail: err.message } : {}),
          });
          this.emitChange("endpoint.closed");
        }),
      );

      this.mounts.set(mountId, entry);

      const summary = this.toSummary(entry);
      this.pushLog({
        kind: "connection",
        level: "ok",
        title: `Mounted ${anchorPath} <- ${resolvedEndpoint}`,
        detail: `${summary.serverInfo?.name ?? "AEP Server"} (${summary.role}, source=${sourcePath})`,
      });
      this.emitChange("endpoint.connected");
      return summary;
    } catch (err) {
      await client.close().catch(() => {});
      throw err;
    }
  }

  async disconnectEndpoint(mountIdOrAnchor: string): Promise<void> {
    const cleanId = mountIdOrAnchor.replace(/^\/+/, "");
    const entry = this.mounts.get(cleanId);
    if (!entry) {
      throw new AepError(
        AEP_ERROR_CODES.NODE_NOT_FOUND,
        `No mounted endpoint found with id "${cleanId}"`,
      );
    }

    for (const unsub of entry.unsubscribers) {
      unsub();
    }
    entry.unsubscribers.length = 0;
    this.mounts.delete(cleanId);

    await this.composite.unmountServer(entry.anchorPath).catch(() => {});
    await entry.client.close("Disconnected from AEP Harness").catch(() => {});

    this.pushLog({
      kind: "connection",
      level: "info",
      title: `Disconnected ${entry.anchorPath}`,
      detail: entry.resolvedEndpoint,
    });
    this.emitChange("endpoint.disconnected");
  }

  listEndpoints(): EndpointSummary[] {
    return [...this.mounts.values()].map((m) => this.toSummary(m));
  }

  getEndpoint(mountIdOrAnchor: string): EndpointSummary | undefined {
    const cleanId = mountIdOrAnchor.replace(/^\/+/, "");
    const entry = this.mounts.get(cleanId);
    return entry ? this.toSummary(entry) : undefined;
  }

  private resolveMountForPath(pathOrMount: string): {
    mount: MountedEndpointInternal;
    downstreamPath: Path;
  } {
    const normalizedPath: Path = pathOrMount.startsWith("/") ? pathOrMount : `/${pathOrMount}`;
    for (const entry of this.mounts.values()) {
      if (isPathWithin(normalizedPath, entry.anchorPath)) {
        const downstreamPath =
          rebasePath(normalizedPath, entry.anchorPath, entry.sourcePath) ?? "/";
        return { mount: entry, downstreamPath };
      }
    }
    throw new AepError(
      AEP_ERROR_CODES.NODE_NOT_FOUND,
      `No mounted endpoint covers path "${normalizedPath}"`,
    );
  }

  async getTree(params: TreeGetParams = {}): Promise<TreeGetResult> {
    if (this.mounts.size === 0 && (params.path === undefined || params.path === "/")) {
      const emptyRoot: BodyRoot = { path: "/", kind: "body", children: [] };
      return {
        head: this.composite.getHead(),
        node: emptyRoot,
      };
    }
    return await this.composite.getTree(params);
  }

  async getNode(path: Path, options?: { maxDepth?: number }): Promise<NodeGetResult> {
    return await this.composite.getNode(path, options);
  }

  async loadChildren(
    path: Path,
    options?: { cursor?: string; limit?: number },
  ): Promise<NodeLoadChildrenResult> {
    const res = await this.composite.loadChildren(path, options);
    this.emitChange("node.loadChildren");
    return res;
  }

  async queryTree(params: TreeQueryParams = {}): Promise<TreeQueryResult> {
    if (this.mounts.size === 0) {
      return { matches: [], totalCount: 0 };
    }
    return await this.composite.queryTree(params);
  }

  async invoke<T = unknown>(
    path: Path,
    method: string,
    params?: unknown,
    options?: {
      expectedRevision?: number;
      leaseId?: string;
      grantId?: string;
    },
  ): Promise<NodeInvokeResult<T>> {
    const started = Date.now();
    try {
      const res = await this.composite.invoke<T>(path, method, params, options);
      const elapsedMs = Date.now() - started;
      this.pushLog({
        kind: "invoke",
        level: "ok",
        title: `invoke ${path} :: ${method} (${elapsedMs}ms)`,
        ...(params !== undefined ? { detail: JSON.stringify(params) } : {}),
        data: res.result,
      });
      this.emitChange("node.invoke");
      return res;
    } catch (err) {
      const elapsedMs = Date.now() - started;
      const msg = err instanceof Error ? err.message : String(err);
      this.pushLog({
        kind: "invoke",
        level: "error",
        title: `invoke failed ${path} :: ${method} (${elapsedMs}ms)`,
        detail: msg,
      });
      throw err;
    }
  }

  async renderSubtree(
    path: Path,
    mode: RenderMode = "renderMinimal",
    options?: DataRenderOptions,
  ): Promise<SerializedRenderResult> {
    if (!path || path === "/") {
      throw new AepError(
        AEP_ERROR_CODES.INVALID_PATH,
        "Select a non-root node path (e.g. /tables) to render",
      );
    }

    const renderParams: DataRenderOptions = {
      annotatePaths: true,
      ...options,
    };

    try {
      const res = await this.composite.render({
        path,
        mode,
        params: renderParams,
      });
      return this.serializeRender(res, false);
    } catch (err) {
      if (mode === "renderMinimal") {
        const nodeRes = await this.composite.getNode(path);
        const synth = synthesizeRenderMinimal(nodeRes.node, path, renderParams);
        return this.serializeRender(synth, true);
      }
      throw err;
    }
  }

  private serializeRender(
    res: {
      path: Path;
      resolvedPath?: Path;
      mode: RenderMode;
      mediaType: string;
      data: Uint8Array | string;
      pathMap?: Record<string, Path>;
    },
    synthesizedFallback: boolean,
  ): SerializedRenderResult {
    if (typeof res.data === "string") {
      return {
        path: res.path,
        ...(res.resolvedPath !== undefined ? { resolvedPath: res.resolvedPath } : {}),
        mode: res.mode,
        mediaType: res.mediaType,
        synthesizedFallback,
        svgText: res.data,
        byteLength: Buffer.byteLength(res.data, "utf8"),
        ...(res.pathMap !== undefined ? { pathMap: res.pathMap } : {}),
      };
    }

    const buf = Buffer.from(res.data);
    const isSvg = res.mediaType.includes("svg");
    return {
      path: res.path,
      ...(res.resolvedPath !== undefined ? { resolvedPath: res.resolvedPath } : {}),
      mode: res.mode,
      mediaType: res.mediaType,
      synthesizedFallback,
      ...(isSvg ? { svgText: buf.toString("utf8") } : { base64Data: buf.toString("base64") }),
      byteLength: buf.byteLength,
      ...(res.pathMap !== undefined ? { pathMap: res.pathMap } : {}),
    };
  }

  async getBinary(refId: string, params?: GetBinaryOptions): Promise<SerializedBinaryResult> {
    const res = await this.composite.getBinary(refId, params);
    const buf = Buffer.from(res.data);
    const isText =
      res.reference.mediaType.startsWith("text/") ||
      res.reference.mediaType.includes("json") ||
      res.reference.mediaType.includes("xml") ||
      res.reference.mediaType.includes("svg");
    return {
      refId: res.reference.refId,
      mediaType: res.reference.mediaType,
      byteLength: buf.byteLength,
      base64Data: buf.toString("base64"),
      ...(isText ? { textPreview: buf.subarray(0, 8192).toString("utf8") } : {}),
    };
  }

  async findFirstImageBinary(): Promise<{
    path: Path;
    refId: string;
    mediaType: string;
    base64Data: string;
  } | null> {
    if (this.mounts.size === 0) {
      return null;
    }
    try {
      const tree = await this.composite.getTree({ path: "/", maxDepth: 6, includeHead: false });
      const search = (node: AepNode, currentPath: Path): { path: Path; refId: string } | null => {
        if (
          node.state?.binaryRef &&
          node.state.binaryRef.mediaType.startsWith("image/")
        ) {
          return { path: currentPath, refId: node.state.binaryRef.refId };
        }
        if (node.kind !== "channel" && node.children) {
          for (const child of node.children) {
            const found = search(child, `${currentPath}/${child.id}`);
            if (found) {
              return found;
            }
          }
        }
        return null;
      };
      if (tree.node.kind === "body") {
        for (const top of tree.node.children) {
          const found = search(top, `/${top.id}`);
          if (found) {
            const bin = await this.getBinary(found.refId);
            return {
              path: found.path,
              refId: found.refId,
              mediaType: bin.mediaType,
              base64Data: bin.base64Data,
            };
          }
        }
      }
    } catch {
      return null;
    }
    return null;
  }

  async elevate(params: {
    targetPath: Path;
    level: ElevationLevel;
    reason: string;
    scopes?: string[];
    singleUse?: boolean;
    durationMs?: number;
    factorType?: AllowedFactor;
    proof?: string;
  }): Promise<SessionElevateResult & { mountId: string }> {
    const { mount, downstreamPath } = this.resolveMountForPath(params.targetPath);
    const res = await mount.client.elevate({
      targetPath: downstreamPath,
      level: params.level,
      reason: params.reason,
      ...(params.scopes !== undefined ? { scopes: params.scopes } : {}),
      ...(params.singleUse !== undefined ? { singleUse: params.singleUse } : {}),
      ...(params.durationMs !== undefined ? { durationMs: params.durationMs } : {}),
      factor: {
        type: params.factorType ?? "human-approval",
        ...(params.proof !== undefined ? { proof: params.proof } : {}),
        waitForApproval: true,
      },
    });

    if (res.status === "granted") {
      mount.grants.set(res.grantId, {
        grantId: res.grantId,
        level: res.level,
        targetPath: params.targetPath,
        scopes: res.scopes,
        singleUse: res.singleUse,
        ...(res.expiresAt !== undefined ? { expiresAt: res.expiresAt } : {}),
      });
    }

    this.pushLog({
      kind: "invoke",
      level: res.status === "granted" ? "ok" : "warn",
      title: `session.elevate ${params.targetPath} -> ${res.status}`,
      detail: `grantId=${res.grantId} level=${res.level}`,
    });
    this.emitChange("session.elevate");

    return { ...res, mountId: mount.mountId };
  }

  async dropElevation(mountIdOrPath: string, grantId?: string): Promise<{ dropped: string[] }> {
    const cleanId = mountIdOrPath.replace(/^\/+/, "");
    const directMount = this.mounts.get(cleanId);
    const mount = directMount ?? this.resolveMountForPath(mountIdOrPath).mount;
    const res = await mount.client.dropElevation(grantId);
    for (const id of res.dropped) {
      mount.grants.delete(id);
    }
    this.emitChange("session.dropElevation");
    return res;
  }

  async acquireLease(params: {
    path: Path;
    mode?: LeaseMode;
    durationMs?: number;
    holderName?: string;
  }): Promise<SessionAcquireLeaseResult & { mountId: string; upstreamPath: Path }> {
    const { mount, downstreamPath } = this.resolveMountForPath(params.path);
    const res = await mount.client.acquireLease({
      path: downstreamPath,
      mode: params.mode ?? "exclusive-write",
      ...(params.durationMs !== undefined ? { durationMs: params.durationMs } : {}),
      holderName: params.holderName ?? "aep-harness",
    });

    mount.leases.set(res.leaseId, {
      leaseId: res.leaseId,
      path: params.path,
      downstreamPath: res.path,
      mode: res.mode,
      expiresAt: res.expiresAt,
    });

    this.pushLog({
      kind: "invoke",
      level: "ok",
      title: `session.acquireLease ${params.path}`,
      detail: `leaseId=${res.leaseId} (${res.mode})`,
    });
    this.emitChange("session.acquireLease");

    return { ...res, mountId: mount.mountId, upstreamPath: params.path };
  }

  async releaseLease(mountIdOrPath: string, leaseId: string): Promise<{ released: true; leaseId: string }> {
    const cleanId = mountIdOrPath.replace(/^\/+/, "");
    const directMount = this.mounts.get(cleanId);
    const mount = directMount ?? this.resolveMountForPath(mountIdOrPath).mount;
    const res = await mount.client.releaseLease(leaseId);
    mount.leases.delete(leaseId);
    this.pushLog({
      kind: "invoke",
      level: "info",
      title: `session.releaseLease ${leaseId}`,
    });
    this.emitChange("session.releaseLease");
    return res;
  }

  private toSummary(entry: MountedEndpointInternal): EndpointSummary {
    return {
      mountId: entry.mountId,
      anchorPath: entry.anchorPath,
      sourcePath: entry.sourcePath,
      originalUrl: entry.originalUrl,
      resolvedEndpoint: entry.resolvedEndpoint,
      transportKind: entry.transportKind,
      ...(entry.mode !== undefined ? { mode: entry.mode } : {}),
      connected: !entry.client.isClosed,
      connectedAt: entry.connectedAt,
      protocolVersion: entry.client.protocolVersion,
      ...(entry.client.serverInfo !== undefined ? { serverInfo: entry.client.serverInfo } : {}),
      role: entry.client.session?.role ?? "controller",
      ...(entry.client.session !== undefined ? { session: entry.client.session } : {}),
      ...(entry.client.security !== undefined ? { security: entry.client.security } : {}),
      head: entry.client.head,
      leases: [...entry.leases.values()],
      grants: [...entry.grants.values()],
    };
  }

  async closeAll(): Promise<void> {
    for (const unsub of this.compositeUnsubscribers) {
      unsub();
    }
    this.compositeUnsubscribers.length = 0;
    for (const entry of this.mounts.values()) {
      for (const unsub of entry.unsubscribers) {
        unsub();
      }
      entry.unsubscribers.length = 0;
    }
    this.mounts.clear();
    await this.composite.closeAll("AEP Harness shutting down");
  }
}
