"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { openDialog } from "@/lib/dialog";
import s from "../customer.module.css";

export default function FilterDrawer({
  children,
  close,
  count,
}: {
  children: ReactNode;
  close: () => void;
  count: number;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => openDialog(ref.current), []);
  return (
    <dialog
      ref={ref}
      id="mobile-filters"
      className={s.menuDrawer}
      aria-labelledby="filter-drawer-title"
      onCancel={close}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className={s.menuContent}>
        <header>
          <h2 id="filter-drawer-title">Filtrează produsele</h2>
          <button
            className={s.iconButton}
            onClick={close}
            aria-label="Închide filtrele"
          >
            ✕
          </button>
        </header>
        <div className={`${s.filterSidebar} ${s.drawerFilters}`}>
          {children}
        </div>
        <button className={`${s.primary} ${s.filterApply}`} onClick={close}>
          Vezi {count} produse
        </button>
      </div>
    </dialog>
  );
}
