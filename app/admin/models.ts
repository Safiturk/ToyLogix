import type { Product } from "@/lib/catalog";
import type { Account } from "@/lib/account";

export interface InventoryProduct extends Omit<Product, "id"> {
  id?: number;
  gen: string;
  stoc_critic: number;
}

export type AdminAccount = Pick<
  Account,
  "id" | "nume_complet" | "email" | "telefon" | "status" | "rol"
> & { nume_firma?: string | null };

export function createProductDraft(): InventoryProduct {
  return {
    cod_bara: "",
    nume_produs: "",
    categorie: "Masini",
    brand: "",
    varsta_recomandata: "",
    gen: "Unisex",
    material: "",
    pret_retail: 0,
    pret_engros: 0,
    bucati_per_cutie: 1,
    stoc_actual: 0,
    stoc_critic: 10,
    imagini: [],
    descriere: "",
  };
}
