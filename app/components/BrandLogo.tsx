import Image from "next/image";
import styles from "./brand-logo.module.css";

export default function BrandLogo() {
  return (
    <Image
      src="/toylogix-logo.png"
      alt="ToyLogix — Toys Move Business Forward"
      width={1536}
      height={1024}
      sizes="(max-width: 600px) 144px, 192px"
      className={styles.image}
    />
  );
}
