import { CatalogThemeProvider } from "../store/useCatalogTheme";
import AdminTheme from "./AdminTheme";
import AccessGate from "../components/AccessGate";
export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AccessGate admin><CatalogThemeProvider><AdminTheme>{children}</AdminTheme></CatalogThemeProvider></AccessGate>;
}
