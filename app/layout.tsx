import type { Metadata } from 'next';
import './globals.css';
import LivePresence from './components/LivePresence';

export const metadata: Metadata = {
  title: 'ToyLogix - Sistem',
  description: 'Gestiune stocuri și magazin',
  manifest: '/manifest.json',
  themeColor: '#2563eb',
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
        <link rel="apple-touch-icon" href="https://cdn-icons-png.flaticon.com/512/3081/3081559.png" />
      </head>
      <body><LivePresence>{children}</LivePresence></body>
    </html>
  );
}
