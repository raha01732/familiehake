// /workspace/familiehake/src/lib/clerk-role.ts
const DEFAULT_ROLE = "user";

type PublicMetadataLike = {
  role?: unknown;
};

function toNormalizedRole(value: unknown): string | null {
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized || null;
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      const normalized = toNormalizedRole(entry);
      if (normalized) return normalized;
    }
    return null;
  }

  if (value && typeof value === "object" && "name" in value) {
    return toNormalizedRole((value as { name?: unknown }).name);
  }

  return null;
}

export function getRoleFromPublicMetadata(
  publicMetadata: PublicMetadataLike | null | undefined,
  fallback = DEFAULT_ROLE
): string {
  return toNormalizedRole(publicMetadata?.role) ?? fallback;
}
