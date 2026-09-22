// Parse errors intentionally propagate to writes so corrupt storage is not overwritten.
export function parseFavoriteIds(raw: string | null): number[] {
  const stored: unknown = JSON.parse(raw || "[]");
  return Array.isArray(stored)
    ? stored.filter((id): id is number => typeof id === "number")
    : [];
}
