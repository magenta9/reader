import manifest from "./production-runtime-role-bindings.json";
import {
  defineProductionRuntimeRoleIdentities,
  getProductionRuntimeRoleIdentity,
  resolveProductionRuntimeRoleIdentity,
  type ProductionRuntimeRole,
  type ProductionRuntimeRoleIdentity,
  type ResolvedProductionRuntimeRoleBinding
} from "./production-runtime-role-identity.js";

export {
  defineProductionRuntimeRoleIdentities,
  type ProductionRuntimeRole,
  type ProductionRuntimeRoleIdentity,
  type ProductionRuntimeWebPreferences,
  type ResolvedProductionRuntimeRoleBinding
} from "./production-runtime-role-identity.js";

export interface ProductionRuntimeRoleBinding extends ProductionRuntimeRoleIdentity {
  readonly preloadSource: string;
}

export const productionRuntimeRoleBindings = defineProductionRuntimeRoleBindings(manifest.roles);

export function defineProductionRuntimeRoleBindings(
  candidates: readonly unknown[]
): readonly ProductionRuntimeRoleBinding[] {
  const identities = defineProductionRuntimeRoleIdentities(candidates);
  return Object.freeze(
    identities.map((identity, index) => {
      const candidate = candidates[index];
      if (!isRecord(candidate)) {
        throw new Error("Production Runtime Role Binding entry must be an object");
      }
      return Object.freeze({
        role: identity.role,
        preloadSource: requireSafeArtifact(candidate, "preloadSource"),
        preloadArtifact: identity.preloadArtifact,
        documentArtifact: identity.documentArtifact,
        globalName: identity.globalName,
        webPreferences: identity.webPreferences
      });
    })
  );
}

export function getProductionRuntimeRoleBinding(
  role: ProductionRuntimeRole,
  bindings: readonly ProductionRuntimeRoleIdentity[] = productionRuntimeRoleBindings
): ProductionRuntimeRoleIdentity {
  return getProductionRuntimeRoleIdentity(role, bindings);
}

export function resolveProductionRuntimeRoleBinding(
  role: ProductionRuntimeRole,
  resolveArtifact: (artifact: string) => string,
  bindings: readonly ProductionRuntimeRoleIdentity[] = productionRuntimeRoleBindings
): ResolvedProductionRuntimeRoleBinding {
  return resolveProductionRuntimeRoleIdentity(role, resolveArtifact, bindings);
}

function requireSafeArtifact(candidate: Record<string, unknown>, field: string): string {
  const value = candidate[field];
  if (typeof value !== "string" || !value) {
    throw new Error(`Production Runtime Role Binding requires ${field}`);
  }
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
