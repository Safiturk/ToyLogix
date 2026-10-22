import AccessGate from "../components/AccessGate";
import { CatalogThemeProvider } from "./useCatalogTheme";
export default function StoreLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AccessGate><CatalogThemeProvider>{children}</CatalogThemeProvider></AccessGate>;
}
