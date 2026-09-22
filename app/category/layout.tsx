import AccessGate from "../components/AccessGate";
export default function CategoryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AccessGate>{children}</AccessGate>;
}
