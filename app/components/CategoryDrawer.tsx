"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { categorySlug } from "@/lib/category-path";
import s from "../customer.module.css";

export default function CategoryDrawer({
  categories,
  current,
  close,
}: {
  categories: string[];
  current: string;
  close: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [closing, setClosing] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const element = dialog.current;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    element?.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      if (timer.current) clearTimeout(timer.current);
      element?.close();
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, []);
  const dismiss = () => {
    if (closing) return;
    setClosing(true);
    timer.current = setTimeout(
      close,
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 220,
    );
  };
  return (
    <dialog
      id="category-menu"
      ref={dialog}
      aria-labelledby="category-menu-title"
      className={`${s.menuDrawer} ${closing ? s.menuClosing : ""}`}
      onCancel={(e) => {
        e.preventDefault();
        dismiss();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) dismiss();
      }}
    >
      <div className={s.menuContent}>
        <header>
          <div>
            <span className={s.eyebrow}>DESCOPERĂ TOYLOGIX</span>
            <h2 id="category-menu-title">Categorii</h2>
          </div>
          <button
            onClick={dismiss}
            className={s.iconButton}
            aria-label="Închide categoriile"
          >
            ✕
          </button>
        </header>
        <nav aria-label="Categorii de produse">
          <Link href="/store" onClick={dismiss}>
            Toate produsele <span aria-hidden="true">↗</span>
          </Link>
          {categories.map((category) => (
            <Link
              key={category}
              href={`/category/${encodeURIComponent(categorySlug(category))}`}
              aria-current={category === current ? "page" : undefined}
              onClick={dismiss}
            >
              {category}
              <span aria-hidden="true">›</span>
            </Link>
          ))}
        </nav>
        <p>Catalog profesional pentru partenerii ToyLogix.</p>
      </div>
    </dialog>
  );
}
