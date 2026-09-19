"use client";

import { useSyncExternalStore } from "react";

type Theme = "light" | "dark";
let temporaryTheme: Theme | null = null;
const key = "toylogix-theme";

function snapshot(): Theme {
  if (temporaryTheme) return temporaryTheme;
  try {
    const saved = localStorage.getItem(key);
    if (saved === "light" || saved === "dark") return saved;
  } catch { /* Private browsing can disable storage. */ }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function subscribe(update: () => void) {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  window.addEventListener("storage", update);
  window.addEventListener("toylogix-theme", update);
  media.addEventListener("change", update);
  return () => {
    window.removeEventListener("storage", update);
    window.removeEventListener("toylogix-theme", update);
    media.removeEventListener("change", update);
  };
}

export function useCatalogTheme() {
  const theme = useSyncExternalStore(subscribe, snapshot, () => "light" as const);
  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    try {
      localStorage.setItem(key, next);
      temporaryTheme = null;
    } catch { temporaryTheme = next; }
    window.dispatchEvent(new Event("toylogix-theme"));
  };
  return { theme, toggleTheme };
}
