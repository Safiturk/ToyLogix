"use client";
import { useEffect, useRef, type ReactNode } from "react";
import s from "../customer.module.css";

export default function FilterDrawer({ children, close, count }: {
  children: ReactNode; close: () => void; count: number;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    dialog?.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      dialog?.close();
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, []);
  return <dialog ref={ref} id="mobile-filters" className={s.menuDrawer}
    aria-labelledby="filter-drawer-title"
    onCancel={close} onClick={e => { if (e.target === e.currentTarget) close(); }}>
    <div className={s.menuContent}>
      <header><h2 id="filter-drawer-title">Filtrează produsele</h2>
        <button className={s.iconButton} onClick={close} aria-label="Închide filtrele">✕</button>
      </header>
      <div className={`${s.filterSidebar} ${s.drawerFilters}`}>{children}</div>
      <button className={`${s.primary} ${s.filterApply}`} onClick={close}>Vezi {count} produse</button>
    </div>
  </dialog>;
}
