"use client";

import { useEffect, useId, useRef, useState, type Ref } from "react";
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
  wishlistTargetRef,
}: {
  name?: string;
  isAdmin: boolean;
  favoriteCount: number;
  favoritesOpen: boolean;
  onOpenFavorites: () => void;
  isDark: boolean;
  onToggleTheme: () => void;
  onLogout: () => Promise<void>;
  wishlistTargetRef: Ref<HTMLSpanElement>;
}) {
  const menu = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const dropdownId = useId();
  const closeMenu = () => {
    setOpen(false);
    trigger.current?.focus();
  };

  useEffect(() => {
    const closeOutside = (event: Event) => {
      if (event.target instanceof Node && !menu.current?.contains(event.target)) {
        setOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && menu.current?.contains(document.activeElement)) {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("focusin", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("focusin", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  return (
    <div
      ref={menu}
      className={s.mobileAccountMenu}
    >
      <button type="button" ref={trigger} className={s.mobileAccountTrigger} aria-label="Meniul contului" aria-expanded={open} aria-controls={dropdownId} onClick={() => setOpen((value) => !value)}>
        <span ref={wishlistTargetRef} className={s.accountAvatar} aria-hidden="true">
          {(name || "Partener")
            .trim()
            .split(/\s+/)
            .slice(0, 2)
            .map((part) => part[0])
            .join("")
            .toLocaleUpperCase("ro")}
        </span>
      </button>
      {open && <div id={dropdownId} className={s.mobileAccountDropdown}>
        <Link href="/account" onClick={() => setOpen(false)}>
          Contul meu
        </Link>
        {isAdmin && (
          <Link href="/admin" onClick={() => setOpen(false)}>
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
      </div>}
    </div>
  );
}
