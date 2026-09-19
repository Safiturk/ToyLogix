import AccessGate from '../components/AccessGate';
export default function AdminLayout({ children }: { children: React.ReactNode }) { return <AccessGate admin>{children}</AccessGate>; }
