import Link from "next/link";
import Image from "next/image";

type BrandLogoProps = {
  className?: string;
  href?: string;
  subtitle?: string;
};

export default function BrandLogo({
  className,
  href = "/store",
  subtitle = "JUCĂRII & DISTRIBUȚIE B2B",
}: BrandLogoProps) {
  return (
    <Link href={href} className={className} aria-label="ToyLogix">
      <Image src="/toylogix-logo.svg" alt="ToyLogix" width={780} height={190} />
      {subtitle && <small>{subtitle}</small>}
    </Link>
  );
}
