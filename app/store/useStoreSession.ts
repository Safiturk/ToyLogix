"use client";
import { useSyncExternalStore } from "react";

interface StoreSession {
  id?: number;
  nume_complet?: string;
  rol?: string;
}

export function subscribeStoreSession(update: () => void) {
  window.addEventListener("storage", update);
  window.addEventListener("toylogix-session", update);
  return () => {
    window.removeEventListener("storage", update);
    window.removeEventListener("toylogix-session", update);
  };
}

export function readStoredValue(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function parseStoreSession(raw: string | null): StoreSession | null {
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function useStoreSession() {
  const session = useSyncExternalStore(
    subscribeStoreSession,
    () => readStoredValue("user_session"),
    () => undefined,
  );
  return { session, user: parseStoreSession(session ?? null) };
}
