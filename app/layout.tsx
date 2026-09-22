import type { Metadata, Viewport } from "next";
import "./globals.css";
import LivePresence from "./components/LivePresence";

export const metadata: Metadata = {
  title: "ToyLogix - Sistem",
  description: "Gestiune stocuri și magazin",
  manifest: "/manifest.json",
  applicationName: "ToyLogix",
  icons: {
    icon: [{ url: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    title: "ToyLogix",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: "#6546c8",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ro">
      <body>
        <LivePresence>{children}</LivePresence>
      </body>
    </html>
  );
}
