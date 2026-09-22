"use client";
import { useState } from "react";
import s from "../customer.module.css";
export default function ProductPicture({
  src,
  name,
  eager = false,
}: {
  src?: string;
  name: string;
  eager?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  if (!src || failed)
    return (
      <div className={s.noImage}>
        <span aria-hidden="true">◇</span>
        <small>Imagine indisponibilă</small>
      </div>
    );
  // Catalog images come from dynamic remote hosts and have a visible error fallback.
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={name}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}
