"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import s from "../customer.module.css";

export default function MobileAccountMenu({
  name,
  isAdmin,
  favoriteCount,
  favoritesOpen,
  onOpenFavorites,
  isDark,
  onToggleTheme,
  onLogout,
}: {
  name?: string;
  isAdmin: boolean;
  favoriteCount: number;
  favoritesOpen: boolean;
  onOpenFavorites: () => void;
  isDark: boolean;
  onToggleTheme: () => void;
  onLogout: () => Promise<void>;
}) {
  const menu = useRef<HTMLDetailsElement>(null);
  const closeMenu = () => {
    menu.current?.removeAttribute("open");
    menu.current?.querySelector("summary")?.focus();
  };

  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !menu.current?.contains(event.target)) {
        menu.current?.removeAttribute("open");
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && menu.current?.open) {
        menu.current.removeAttribute("open");
        menu.current.querySelector("summary")?.focus();
      }
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  return (
    <details
      ref={menu}
      className={s.mobileAccountMenu}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          event.currentTarget.removeAttribute("open");
        }
      }}
    >
      <summary className={s.mobileAccountTrigger} aria-label="Meniul contului">
        <span className={s.accountAvatar} aria-hidden="true">
          {(name || "Partener")
            .trim()
            .split(/\s+/)
            .slice(0, 2)
            .map((part) => part[0])
            .join("")
            .toLocaleUpperCase("ro")}
        </span>
      </summary>
      <div className={s.mobileAccountDropdown}>
        <Link href="/account" onClick={() => menu.current?.removeAttribute("open")}>
          Contul meu
        </Link>
        {isAdmin && (
          <Link href="/admin" onClick={() => menu.current?.removeAttribute("open")}>
            Admin Panel <span aria-hidden="true">↗</span>
          </Link>
        )}
        <button
          type="button"
          aria-haspopup="dialog"
          aria-expanded={favoritesOpen}
          aria-controls="favorites-dialog"
          onClick={() => {
            closeMenu();
            onOpenFavorites();
          }}
        >
          <span>♡ Favorite</span><b>{favoriteCount}</b>
        </button>
        <button
          type="button"
          aria-pressed={isDark}
          aria-label={isDark ? "Activează tema luminoasă" : "Activează tema întunecată"}
          onClick={onToggleTheme}
        >
          <span>{isDark ? "Tema luminoasă" : "Tema întunecată"}</span>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
            {isDark ? <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" /></> : <path d="M20 15.5A8.5 8.5 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5Z" />}
          </svg>
        </button>
        <button type="button" onClick={() => { closeMenu(); void onLogout(); }}>
          <span>Ieșire din cont</span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 4H5v16h4M10 12h11m-4-4 4 4-4 4" />
          </svg>
        </button>
      </div>
    </details>
  );
}
