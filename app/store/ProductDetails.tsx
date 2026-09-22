"use client";
import { useEffect, useRef, useState } from "react";
import { openDialog } from "@/lib/dialog";
import { type Product, productImages, formatPrice } from "@/lib/catalog";
import ProductPicture from "./ProductPicture";
import s from "../customer.module.css";
import { useWishlistMotion } from "./useWishlistMotion";
export default function ProductDetails({
  product,
  close,
  isFavorite,
  toggleFavorite,
  favoriteError,
}: {
  product: Product;
  close: () => void;
  isFavorite: boolean;
  toggleFavorite: () => boolean | null;
  favoriteError: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [toast, setToast] = useState<{ message: string } | null>(null);
  const { bounce } = useWishlistMotion();
  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 2200);
    return () => window.clearTimeout(timeout);
  }, [toast]);
  const gallery = productImages(product);
  useEffect(() => openDialog(dialogRef.current), []);
  return (
    <dialog
      ref={dialogRef}
      className={s.dialog}
      aria-labelledby="product-title"
      onCancel={close}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className={s.dialogContent}>
        <div className={s.dialogTop}>
          <span className={s.eyebrow}>
            {product.categorie || "Catalog ToyLogix"}
          </span>
          <button
            className={s.iconButton}
            onClick={close}
            aria-label="Închide detaliile"
          >
            ✕
          </button>
        </div>
        <div className={s.detailGrid}>
          <div>
            <div className={s.detailImage}>
              <ProductPicture
                key={gallery[galleryIndex] ?? "empty"}
                src={gallery[galleryIndex]}
                name={product.nume_produs}
                eager
              />
            </div>
            {gallery.length > 1 && (
              <div className={s.thumbnails} aria-label="Galerie produs">
                {gallery.map((src, i) => (
                  <button
                    key={`${src}-${i}`}
                    aria-label={`Imaginea ${i + 1}`}
                    aria-pressed={i === galleryIndex}
                    onClick={() => setGalleryIndex(i)}
                  >
                    <ProductPicture
                      src={src}
                      name={`${product.nume_produs}, imaginea ${i + 1}`}
                    />
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className={s.detailInfo}>
            <p className={s.muted}>{product.brand || "ToyLogix · Catalog"}</p>
            <h2 id="product-title">{product.nume_produs}</h2>
            <button
              className={`${s.secondary} ${s.detailFavorite}`}
              aria-pressed={isFavorite}
              onClick={(event) => {
                const added = toggleFavorite();
                if (added === null) {
                  setToast(null);
                  return;
                }
                bounce(event.currentTarget.querySelector("svg"));
                setToast({
                  message: added
                    ? "Adăugat la favorite"
                    : "Eliminat din favorite",
                });
              }}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill={isFavorite ? "currentColor" : "none"}
                stroke="currentColor"
                strokeWidth="1.6"
                aria-hidden="true"
              >
                <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z" />
              </svg>
              {isFavorite ? "Elimină din favorite" : "Adaugă la favorite"}
            </button>
            {favoriteError && (
              <p role="alert" className={s.priceWarning}>
                {favoriteError}
              </p>
            )}
            <div
              role="status"
              aria-live="polite"
              aria-atomic="true"
              className={toast ? s.favoriteToast : undefined}
            >
              {toast?.message}
            </div>
            <span
              className={
                Number(product.stoc_actual) > 0 ? s.inStock : s.outOfStock
              }
            >
              {Number(product.stoc_actual) > 0
                ? `În stoc · ${product.stoc_actual} buc.`
                : "Stoc epuizat"}
            </span>
            <div className={s.pricePanel}>
              <span className={s.eyebrow}>Preț en-gros / bucată</span>
              <strong>{formatPrice(product.pret_engros)}</strong>
              <p>
                Preț recomandat de vânzare: {formatPrice(product.pret_retail)}
              </p>
              <hr />
              <span>
                Ambalare:{" "}
                <b>{product.bucati_per_cutie || "—"} bucăți / cutie</b>
              </span>
            </div>
            <dl className={s.specifications}>
              {[
                ["Cod de bare", product.cod_bara],
                ["Vârstă recomandată", product.varsta_recomandata],
                ["Material", product.material],
                ["Categorie", product.categorie],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value || "Nespecificat"}</dd>
                </div>
              ))}
            </dl>
            <h3>Despre produs</h3>
            <p className={s.description}>
              {product.descriere ||
                "Descrierea acestui produs nu este încă disponibilă."}
            </p>
          </div>
        </div>
      </div>
    </dialog>
  );
}
