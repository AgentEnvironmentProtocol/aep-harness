import type { AepNode, BodyRoot, MethodDecl, Path, SchemaObject } from "aep-node";

export interface FormatTreeDigestOptions {
  maxDepth?: number;
  maxNodes?: number;
  includeMethods?: boolean;
  includeProperties?: boolean;
}

function summarizeValue(val: unknown, maxLen = 90): string {
  if (val === undefined) {
    return "undefined";
  }
  if (typeof val === "string") {
    const compact = val.replace(/\s+/g, " ");
    return compact.length <= maxLen
      ? JSON.stringify(compact)
      : JSON.stringify(`${compact.slice(0, maxLen - 1)}…`);
  }
  const raw = JSON.stringify(val);
  if (!raw) {
    return String(val);
  }
  return raw.length <= maxLen ? raw : `${raw.slice(0, maxLen - 1)}…`;
}

function summarizeInputSchema(schema: SchemaObject | undefined): string {
  if (!schema || typeof schema !== "object") {
    return "";
  }
  const props = schema["properties"];
  if (!props || typeof props !== "object" || Array.isArray(props)) {
    return "";
  }
  const requiredSet = new Set<string>(
    Array.isArray(schema["required"])
      ? schema["required"].filter((r): r is string => typeof r === "string")
      : [],
  );
  const parts: string[] = [];
  for (const [key, rawDef] of Object.entries(props as Record<string, unknown>)) {
    let typeLabel = "any";
    if (rawDef && typeof rawDef === "object" && !Array.isArray(rawDef)) {
      const def = rawDef as Record<string, unknown>;
      if (Array.isArray(def["enum"]) && def["enum"].length > 0) {
        typeLabel = def["enum"].map((v) => JSON.stringify(v)).join("|");
      } else if (typeof def["type"] === "string") {
        typeLabel = def["type"];
      } else if (Array.isArray(def["type"])) {
        typeLabel = def["type"].map(String).join("|");
      }
    }
    parts.push(`${key}${requiredSet.has(key) ? "*" : "?"}: ${typeLabel}`);
  }
  return parts.join(", ");
}

export function formatMethodSignature(method: MethodDecl): string {
  const args = summarizeInputSchema(method.inputSchema);
  const effect = method.sideEffects ? ` [${method.sideEffects}]` : "";
  const elev =
    method.elevation && method.elevation.level !== "none"
      ? ` [elev:${method.elevation.level}]`
      : "";
  const desc = method.description ? ` — ${method.description}` : "";
  return `${method.name}(${args})${effect}${elev}${desc}`;
}

export function formatTreeDigest(
  root: BodyRoot | AepNode,
  rootPath: Path = "/",
  options: FormatTreeDigestOptions = {},
): string {
  const maxDepth = options.maxDepth ?? 8;
  const maxNodes = options.maxNodes ?? 240;
  const includeMethods = options.includeMethods ?? true;
  const includeProperties = options.includeProperties ?? true;

  if (root.kind === "body" && root.children.length === 0) {
    return "(no AEP endpoints mounted at /)";
  }

  const lines: string[] = [];
  let visited = 0;
  let elided = 0;

  const countSubtree = (node: AepNode): number => {
    let count = 1;
    if (node.kind !== "channel" && node.children) {
      for (const child of node.children) {
        count += countSubtree(child);
      }
    }
    return count;
  };

  const walk = (node: AepNode, currentPath: Path, depth: number): void => {
    if (visited >= maxNodes) {
      elided += countSubtree(node);
      return;
    }
    visited += 1;

    const indent = "  ".repeat(depth);
    const typePart = "type" in node && node.type ? `:${node.type}` : "";
    const badges: string[] = [`${node.kind}${typePart}`];

    if (node.kind === "channel") {
      badges.push(`${node.direction}/${node.deliveryMode}/${node.payloadMode ?? "binary"}`);
    }
    if (node.revision !== undefined) {
      badges.push(`rev=${node.revision}`);
    }
    const rawElev = node.properties?.["elevation"];
    if (
      rawElev &&
      typeof rawElev === "object" &&
      !Array.isArray(rawElev) &&
      typeof (rawElev as Record<string, unknown>)["level"] === "string" &&
      (rawElev as Record<string, unknown>)["level"] !== "none"
    ) {
      badges.push(`elev=${String((rawElev as Record<string, unknown>)["level"])}`);
    }

    const propSummary: string[] = [];
    if (includeProperties && node.properties) {
      const title = node.properties["title"] ?? node.properties["label"];
      if (typeof title === "string" && title.length > 0) {
        propSummary.push(`label=${summarizeValue(title, 50)}`);
      }
      if (node.properties["disabled"] === true) {
        propSummary.push("disabled");
      }
      if (node.properties["readonly"] === true) {
        propSummary.push("readonly");
      }
      if (node.properties["required"] === true) {
        propSummary.push("required");
      }
    }

    const stateSummary: string[] = [];
    if (node.state) {
      if (node.state.value !== undefined) {
        const displayVal =
          node.kind === "editable" && node.type === "passwordField" ? '"••••"' : summarizeValue(node.state.value, 70);
        stateSummary.push(`value=${displayVal}`);
      }
      if (node.state.selected === true) {
        stateSummary.push("selected");
      }
      if (node.state.status !== undefined) {
        stateSummary.push(`status=${String(node.state.status)}`);
      }
      if (node.state.binaryRef) {
        stateSummary.push(`binaryRef=${node.state.binaryRef.refId}(${node.state.binaryRef.mediaType})`);
      }
      if (node.state.channelRef !== undefined) {
        stateSummary.push(`channelRef=${node.state.channelRef}`);
      }
    }

    const lazyTag =
      node.kind !== "channel" &&
      node.hasChildren &&
      (!node.children || node.children.length === 0)
        ? " [hasChildren: lazy]"
        : "";

    const detailParts = [...propSummary, ...stateSummary];
    const detailStr = detailParts.length > 0 ? ` | ${detailParts.join(", ")}` : "";

    lines.push(`${indent}${currentPath} [${badges.join(" ")}]${detailStr}${lazyTag}`);

    if (includeMethods && node.methods && node.methods.length > 0) {
      for (const method of node.methods) {
        lines.push(`${indent}  -> ${formatMethodSignature(method)}`);
      }
    }

    if (node.kind === "channel" || !node.children || node.children.length === 0) {
      return;
    }

    if (depth >= maxDepth) {
      for (const child of node.children) {
        elided += countSubtree(child);
      }
      lines.push(`${indent}  … (${node.children.length} child nodes hidden at maxDepth=${maxDepth})`);
      return;
    }

    for (const child of node.children) {
      const childPath = currentPath === "/" ? `/${child.id}` : `${currentPath}/${child.id}`;
      walk(child, childPath, depth + 1);
    }
  };

  if (root.kind === "body") {
    lines.push(`/ [body] (${root.children.length} mounted top-level node${root.children.length === 1 ? "" : "s"})`);
    for (const child of root.children) {
      walk(child, `/${child.id}`, 1);
    }
  } else {
    walk(root, rootPath, 0);
  }

  if (elided > 0) {
    lines.push(
      `… (${elided} additional node${elided === 1 ? "" : "s"} omitted; use get_tree/get_node on a specific path or query_tree to inspect deeper)`,
    );
  }

  return lines.join("\n");
}
