import AccessGate from "../components/AccessGate";
import { CatalogThemeProvider } from "../store/useCatalogTheme";
export default function CategoryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AccessGate><CatalogThemeProvider>{children}</CatalogThemeProvider></AccessGate>;
}
