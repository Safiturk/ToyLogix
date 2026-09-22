"use client";
import { useState, useSyncExternalStore } from "react";
import { parseFavoriteIds } from "@/lib/favorites";
import { readStoredValue, subscribeStoreSession } from "./useStoreSession";

export function useFavorites(userId?: number) {
  const storageKey = userId
    ? `toylogix-favorites:${userId}`
    : "toylogix-favorites";
  const saved = useSyncExternalStore(
    subscribeStoreSession,
    () => readStoredValue(storageKey),
    () => null,
  );
  const [favoriteError, setFavoriteError] = useState("");
  let favorites: number[];
  try {
    favorites = parseFavoriteIds(saved);
  } catch {
    favorites = [];
  }

  function toggleFavorite(id: number) {
    try {
      const current = parseFavoriteIds(localStorage.getItem(storageKey));
      const added = !current.includes(id);
      const next = added
        ? [...current, id]
        : current.filter((value) => value !== id);
      localStorage.setItem(storageKey, JSON.stringify(next));
      window.dispatchEvent(new Event("toylogix-session"));
      setFavoriteError("");
      return added;
    } catch {
      setFavoriteError(
        "Favoritele nu pot fi salvate. Permite stocarea locală în browser.",
      );
      return null;
    }
  }
  return { favorites, favoriteError, toggleFavorite };
}
