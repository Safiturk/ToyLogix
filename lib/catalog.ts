export interface Product {
  id: number;
  cod_bara: string;
  nume_produs: string;
  categorie: string;
  brand: string;
  varsta_recomandata: string;
  material: string;
  pret_retail: number;
  pret_engros: number;
  bucati_per_cutie: number;
  stoc_actual: number;
  imagini?: string[];
  descriere?: string;
}

export type ProductCard = Pick<
  Product,
  | "id"
  | "nume_produs"
  | "categorie"
  | "brand"
  | "varsta_recomandata"
  | "pret_retail"
  | "pret_engros"
  | "bucati_per_cutie"
  | "stoc_actual"
  | "imagini"
>;

export type CatalogField =
  "categorie" | "brand" | "varsta_recomandata" | "material";

export function normalizeCatalogText(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLocaleLowerCase("ro")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function productImages(product: Pick<Product, "imagini">) {
  return (product.imagini ?? []).filter(Boolean);
}

export function formatPrice(amount: number) {
  return new Intl.NumberFormat("ro-RO", {
    style: "currency",
    currency: "RON",
  }).format(Number(amount) || 0);
}

export function catalogOptions(products: Product[], field: CatalogField) {
  return Array.from(
    new Map(
      products
        .filter((product) => product[field]?.trim())
        .map((product) => [
          normalizeCatalogText(product[field]),
          product[field].trim(),
        ]),
    ).values(),
  ).sort((a, b) => a.localeCompare(b, "ro"));
}

export interface CatalogFilters {
  query: string;
  brands: string[];
  materials: string[];
  age: string;
  stockOnly: boolean;
  minPrice: string;
  maxPrice: string;
}

export function matchesCatalogFilters(
  product: Product,
  filters: CatalogFilters,
) {
  const { query, brands, materials, age, stockOnly, minPrice, maxPrice } =
    filters;
  if (
    query &&
    ![product.nume_produs, product.brand, product.cod_bara].some((value) =>
      normalizeCatalogText(value).includes(normalizeCatalogText(query)),
    )
  )
    return false;
  if (
    brands.length &&
    !brands.some(
      (value) =>
        normalizeCatalogText(product.brand) === normalizeCatalogText(value),
    )
  )
    return false;
  if (
    materials.length &&
    !materials.some(
      (value) =>
        normalizeCatalogText(product.material) === normalizeCatalogText(value),
    )
  )
    return false;
  if (
    age &&
    normalizeCatalogText(product.varsta_recomandata) !==
      normalizeCatalogText(age)
  )
    return false;
  if (stockOnly && !(Number(product.stoc_actual) > 0)) return false;
  if (minPrice !== "" && !(Number(product.pret_engros) >= Number(minPrice)))
    return false;
  if (maxPrice !== "" && !(Number(product.pret_engros) <= Number(maxPrice)))
    return false;
  return true;
}

export function compareProducts(a: Product, b: Product, sort: string) {
  switch (sort) {
    case "price-up":
      return Number(a.pret_engros) - Number(b.pret_engros);
    case "price-down":
      return Number(b.pret_engros) - Number(a.pret_engros);
    case "name":
      return String(a.nume_produs).localeCompare(String(b.nume_produs), "ro");
    default:
      return b.id - a.id;
  }
}
