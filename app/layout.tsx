import type { Metadata } from "next";
import "./globals.css";
import LivePresence from "./components/LivePresence";

export const metadata: Metadata = {
  title: "ToyLogix - Sistem",
  description: "Gestiune stocuri și magazin",
  manifest: "/manifest.json",
  themeColor: "#2563eb",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ro">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <link rel="icon" href="/toylogix-logo.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/toylogix-logo.svg" />
      </head>
      <body>
        <LivePresence>{children}</LivePresence>
      </body>
    </html>
  );
}
