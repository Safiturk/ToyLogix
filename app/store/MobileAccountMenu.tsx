"use client";

import { useEffect, useId, useRef, useState, type Ref } from "react";
import Link from "next/link";
import s from "../customer.module.css";
import OrderNotifications from "@/app/components/OrderNotifications";

export default function MobileAccountMenu({
  desktop = false,
  name,
  isAdmin,
  favoriteCount,
  favoritesOpen,
  onOpenFavorites,
  onOpenAppearance,
  onLogout,
  wishlistTargetRef,
}: {
  desktop?: boolean;
  name?: string;
  isAdmin: boolean;
  favoriteCount: number;
  favoritesOpen: boolean;
  onOpenFavorites: () => void;
  onOpenAppearance: () => void;
  onLogout: () => Promise<void>;
  wishlistTargetRef?: Ref<HTMLSpanElement>;
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
      className={desktop ? s.desktopAccountMenu : s.mobileAccountMenu}
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
        {desktop && <><span className={s.accountIdentity}><strong>{name || "Partener"}</strong><small>{isAdmin ? "Administrator" : "Partener ToyLogix"}</small></span><span aria-hidden="true">⌄</span></>}
      </button>
      {open && <div id={dropdownId} className={s.mobileAccountDropdown}>
        <Link href="/account" onClick={() => setOpen(false)}>
          Contul meu
        </Link>
        <Link href="/store/orders" onClick={() => setOpen(false)}>Comenzile mele</Link>
        <OrderNotifications admin={isAdmin} />
        {isAdmin && (
          <Link href="/admin" onClick={() => setOpen(false)}>
            Admin Panel <span aria-hidden="true">↗</span>
          </Link>
        )}
        {!desktop && <button
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
        </button>}
        <button
          type="button"
          aria-haspopup="dialog"
          onClick={() => { closeMenu(); onOpenAppearance(); }}
        >
          <span>Aspectul magazinului</span><span aria-hidden="true">◐</span>
        </button>
        <button type="button" onClick={() => { closeMenu(); void onLogout(); }}>
          <span>Iesire din cont</span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 4H5v16h4M10 12h11m-4-4 4 4-4 4" />
          </svg>
        </button>
      </div>}
    </div>
  );
}
