"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import s from "../customer.module.css";

export default function MobileAccountMenu({
  name,
  isAdmin,
}: {
  name?: string;
  isAdmin: boolean;
}) {
  const menu = useRef<HTMLDetailsElement>(null);

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
      </div>
    </details>
  );
}
