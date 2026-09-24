"use client";
import { useEffect, useRef } from "react";
import { openDialog } from "@/lib/dialog";
import { type ProductCard, productImages, formatPrice } from "@/lib/catalog";
import ProductPicture from "./ProductPicture";
import s from "../customer.module.css";
export default function FavoritesDialog({
  products,
  loading,
  error,
  close,
  openProduct,
  remove,
  favoriteError,
}: {
  products: ProductCard[];
  loading: boolean;
  error: string;
  close: () => void;
  openProduct: (product: ProductCard) => void;
  remove: (id: number) => void;
  favoriteError: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => openDialog(dialogRef.current), []);
  return (
    <dialog
      ref={dialogRef}
      id="favorites-dialog"
      className={s.dialog}
      aria-labelledby="favorites-title"
      onCancel={close}
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div className={s.dialogContent}>
        <header className={s.dialogTop}>
          <div>
            <span className={s.eyebrow}>COLECȚIA TA</span>
            <h2 id="favorites-title" className={s.favoritesTitle}>
              Produsele favorite{" "}
              <span className={s.countBadge}>{products.length}</span>
            </h2>
          </div>
          <button
            className={s.iconButton}
            onClick={close}
            aria-label="Închide favoritele"
          >
            ✕
          </button>
        </header>
        <p className={s.muted}>
          Toate produsele salvate, din toate categoriile, într-un singur loc.
        </p>
        {favoriteError && (
          <p role="alert" className={s.priceWarning}>
            {favoriteError}
          </p>
        )}
        {loading ? (
          <p role="status">Se încarcă favoritele…</p>
        ) : error ? (
          <p role="alert">{error}</p>
        ) : products.length ? (
          <ul className={s.favoritesList}>
            {products.map((product) => (
              <li className={s.favoriteItem} key={product.id}>
                <button
                  className={s.favoriteProduct}
                  onClick={() => openProduct(product)}
                  aria-label={`Vezi detalii: ${product.nume_produs}`}
                >
                  <div className={s.favoriteImage}>
                    <ProductPicture
                      src={productImages(product)[0]}
                      name={product.nume_produs}
                    />
                  </div>
                  <div>
                    <small className={s.muted}>{product.categorie}</small>
                    <h3>{product.nume_produs}</h3>
                    <span className={s.muted}>Preț en-gros</span>
                    <strong>{formatPrice(product.pret_engros)}</strong>
                    <small className={s.muted}>
                      RRP {formatPrice(product.pret_retail)} ·{" "}
                      {product.bucati_per_cutie || "—"} buc./cutie
                    </small>
                  </div>
                </button>
                <button
                  className={s.textButton}
                  onClick={() => remove(product.id)}
                  aria-label={`Elimină din favorite: ${product.nume_produs}`}
                >
                  Elimină
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className={s.empty}>
            <span aria-hidden="true">♡</span>
            <h3>Încă nu ai produse favorite</h3>
            <p>Apasă pe inimioara unui produs pentru a-l găsi aici.</p>
          </div>
        )}
        <button className={s.secondary} onClick={close}>
          Continuă cumpărăturile
        </button>
      </div>
    </dialog>
  );
}
