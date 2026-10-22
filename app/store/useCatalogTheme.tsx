"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { parseCatalogTheme, type CatalogTheme } from "@/lib/catalog-theme";
import styles from "./theme-picker.module.css";

type ThemeContextValue = {
  theme: "light" | "dark" | "petrol";
  preference: CatalogTheme;
  saving: boolean;
  ready: boolean;
  message: string;
  selectTheme: (value: CatalogTheme) => Promise<void>;
};
const ThemeContext = createContext<ThemeContextValue | null>(null);

export function CatalogThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreference] = useState<CatalogTheme>("system");
  const [systemDark, setSystemDark] = useState(false);
  const [saving, setSaving] = useState(false);
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState("");
  const owner = useRef<string | null>(null);
  const pending = useRef(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const updateSystem = () => setSystemDark(media.matches);
    updateSystem();
    media.addEventListener("change", updateSystem);
    // INITIAL_SESSION uses the existing Auth session; no extra request blocks
    // catalog loading. Metadata is a display preference, never authorization.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const id = session?.user.id ?? null;
      const changedAccount = owner.current !== id;
      owner.current = id;
      if (pending.current && !changedAccount) return;
      let cached: CatalogTheme | null = null;
      try {
        cached = parseCatalogTheme(localStorage.getItem(id ? `toylogix-theme:${id}` : "toylogix-theme"));
        // Preserve the existing light/dark preference on first upgrade.
        if (!cached) cached = parseCatalogTheme(localStorage.getItem("toylogix-theme"));
      } catch { /* Auth metadata still works when browser storage is blocked. */ }
      setPreference(parseCatalogTheme(session?.user.user_metadata?.catalog_theme) ?? cached ?? "system");
      setReady(Boolean(id));
      if (changedAccount) setMessage("");
    });
    return () => {
      subscription.unsubscribe();
      media.removeEventListener("change", updateSystem);
    };
  }, []);

  async function selectTheme(value: CatalogTheme) {
    const id = owner.current;
    if (!id || pending.current || !parseCatalogTheme(value)) return;
    pending.current = true;
    setPreference(value);
    setSaving(true);
    setMessage("");
    try {
      const { data, error } = await supabase.auth.updateUser({ data: { catalog_theme: value } });
      if (owner.current !== id) return;
      if (error || data.user?.id !== id) throw error ?? new Error("Account changed");
      try { localStorage.setItem(`toylogix-theme:${id}`, value); } catch { /* Saved to account. */ }
      setMessage("Aspectul a fost salvat în contul tău.");
    } catch {
      if (owner.current === id) setMessage("Aspectul este aplicat temporar. Salvarea în cont a eșuat; încearcă din nou.");
    } finally {
      pending.current = false;
      setSaving(false);
    }
  }
  const theme = preference === "system" ? (systemDark ? "dark" : "light") : preference;
  return <ThemeContext.Provider value={{ theme, preference, saving, ready, message, selectTheme }}>
    <div className={styles.scope} data-theme={theme}>{children}</div>
  </ThemeContext.Provider>;
}

export function useCatalogTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("CatalogThemeProvider is required");
  return context;
}
