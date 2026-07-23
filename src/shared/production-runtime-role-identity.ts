const PRODUCTION_RUNTIME_ROLES = [
  "reader-window",
  "playback-renderer",
  "playback-overlay"
] as const;

export type ProductionRuntimeRole = (typeof PRODUCTION_RUNTIME_ROLES)[number];

export interface ProductionRuntimeWebPreferences {
  readonly contextIsolation: true;
  readonly nodeIntegration: false;
  readonly sandbox: false;
  readonly backgroundThrottling?: false;
}

export interface ProductionRuntimeRoleIdentity {
  readonly role: ProductionRuntimeRole;
  readonly preloadArtifact: string;
  readonly documentArtifact: string;
  readonly globalName: string;
  readonly webPreferences: ProductionRuntimeWebPreferences;
}

export interface ResolvedProductionRuntimeRoleBinding extends ProductionRuntimeRoleIdentity {
  readonly preloadEntry: string;
  readonly documentEntry: string;
}

export function defineProductionRuntimeRoleIdentities(
  candidates: readonly unknown[]
): readonly ProductionRuntimeRoleIdentity[] {
  const roles = new Set<string>();
  const preloadArtifacts = new Set<string>();
  const documentArtifacts = new Set<string>();
  const identities = candidates.map((candidate) => {
    const identity = parseIdentity(candidate);
    if (roles.has(identity.role)) {
      throw new Error(`Production Runtime Role Binding has duplicate role ${identity.role}`);
    }
    if (preloadArtifacts.has(identity.preloadArtifact)) {
      throw new Error(
        `Production Runtime Role Binding has duplicate preloadArtifact ${identity.preloadArtifact}`
      );
    }
    if (documentArtifacts.has(identity.documentArtifact)) {
      throw new Error(
        `Production Runtime Role Binding has duplicate documentArtifact ${identity.documentArtifact}`
      );
    }
    roles.add(identity.role);
    preloadArtifacts.add(identity.preloadArtifact);
    documentArtifacts.add(identity.documentArtifact);
    return identity;
  });

  for (const role of PRODUCTION_RUNTIME_ROLES) {
    if (!roles.has(role)) {
      throw new Error(`Production Runtime Role Binding is missing role ${role}`);
    }
  }
  return Object.freeze(identities);
}

export function getProductionRuntimeRoleIdentity(
  role: ProductionRuntimeRole,
  identities: readonly ProductionRuntimeRoleIdentity[]
): ProductionRuntimeRoleIdentity {
  const identity = identities.find((candidate) => candidate.role === role);
  if (!identity) throw new Error(`Unknown production runtime role ${role}`);
  return identity;
}

export function resolveProductionRuntimeRoleIdentity(
  role: ProductionRuntimeRole,
  resolveArtifact: (artifact: string) => string,
  identities: readonly ProductionRuntimeRoleIdentity[]
): ResolvedProductionRuntimeRoleBinding {
  const identity = getProductionRuntimeRoleIdentity(role, identities);
  return Object.freeze({
    ...identity,
    preloadEntry: resolveArtifact(identity.preloadArtifact),
    documentEntry: resolveArtifact(identity.documentArtifact)
  });
}

function parseIdentity(candidate: unknown): ProductionRuntimeRoleIdentity {
  if (!isRecord(candidate)) {
    throw new Error("Production Runtime Role Binding entry must be an object");
  }
  const role = requireString(candidate, "role");
  if (!isProductionRuntimeRole(role)) {
    throw new Error(`Production Runtime Role Binding has unknown role ${role}`);
  }
  return Object.freeze({
    role,
    preloadArtifact: requireSafeArtifact(candidate, "preloadArtifact"),
    documentArtifact: requireSafeArtifact(candidate, "documentArtifact"),
    globalName: requireString(candidate, "globalName"),
    webPreferences: parseWebPreferences(candidate.webPreferences)
  });
}

function parseWebPreferences(candidate: unknown): ProductionRuntimeWebPreferences {
  if (!isRecord(candidate)) {
    throw new Error("Production Runtime Role Binding webPreferences must be an object");
  }
  if (
    candidate.contextIsolation !== true ||
    candidate.nodeIntegration !== false ||
    candidate.sandbox !== false ||
    (candidate.backgroundThrottling !== undefined && candidate.backgroundThrottling !== false)
  ) {
    throw new Error("Production Runtime Role Binding has unsafe webPreferences");
  }
  return Object.freeze({
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: false,
    ...(candidate.backgroundThrottling === false ? { backgroundThrottling: false } : {})
  });
}

function requireSafeArtifact(candidate: Record<string, unknown>, field: string): string {
  const value = requireString(candidate, field);
  const segments = value.split("/");
  if (
    value.startsWith("/") ||
    value.includes("\\") ||
    !/^[A-Za-z0-9._/-]+$/.test(value) ||
    segments.some((segment) => !segment || segment === "." || segment === "..")
  ) {
    throw new Error(`Production Runtime Role Binding has unsafe ${field}`);
  }
  return value;
}

function requireString(candidate: Record<string, unknown>, field: string): string {
  const value = candidate[field];
  if (typeof value !== "string" || !value) {
    throw new Error(`Production Runtime Role Binding requires ${field}`);
  }
  return value;
}

function isProductionRuntimeRole(value: string): value is ProductionRuntimeRole {
  return (PRODUCTION_RUNTIME_ROLES as readonly string[]).includes(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
