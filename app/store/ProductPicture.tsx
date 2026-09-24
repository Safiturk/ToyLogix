"use client";
import { useState } from "react";
import Image from "next/image";
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
  return (
    <Image
      src={src}
      alt={name}
      width={800}
      height={800}
      sizes="(max-width: 767px) 50vw, (max-width: 1100px) 33vw, 25vw"
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}
