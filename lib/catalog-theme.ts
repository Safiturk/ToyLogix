export type CatalogTheme = "light" | "dark" | "system" | "petrol";

export function parseCatalogTheme(value: unknown): CatalogTheme | null {
  return value === "light" || value === "dark" || value === "system" || value === "petrol"
    ? value : null;
}
