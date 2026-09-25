"use client";
import { useState, useSyncExternalStore } from "react";
import type { ProductCard } from "@/lib/catalog";
import {
  MAX_BOXES,
  parseCart,
  validProduct,
  type CartLine,
} from "@/lib/order-request";
import { readStoredValue, useStoreSession } from "./useStoreSession";

const subscribe = (update: () => void) => {
  window.addEventListener("storage", update);
  window.addEventListener("toylogix-cart", update);
  return () => {
    window.removeEventListener("storage", update);
    window.removeEventListener("toylogix-cart", update);
  };
};
export function useCart() {
  const { user } = useStoreSession();
  const key = user?.id ? `toylogix-cart-v1:${user.id}` : null;
  const raw = useSyncExternalStore(
    subscribe,
    () => (key ? readStoredValue(key) : null),
    () => null,
  );
  const [error, setError] = useState("");
  const lines = parseCart(raw);
  function update(change: (current: CartLine[]) => CartLine[]) {
    if (!key) return false;
    try {
      localStorage.setItem(
        key,
        JSON.stringify(change(parseCart(localStorage.getItem(key)))),
      );
      window.dispatchEvent(new Event("toylogix-cart"));
      setError("");
      return true;
    } catch {
      setError(
        "Coșul nu poate fi salvat. Permite stocarea locală în browser și încearcă din nou.",
      );
      return false;
    }
  }
  return {
    lines,
    raw,
    error,
    update,
    add(product: ProductCard) {
      if (!validProduct(product)) return false;
      return update((current) => {
        const existing = current.find((l) => l.product.id === product.id);
        return existing
          ? current.map((l) =>
              l.product.id === product.id
                ? { product, boxes: Math.min(MAX_BOXES, l.boxes + 1) }
                : l,
            )
          : [...current, { product, boxes: 1 }];
      });
    },
  };
}
