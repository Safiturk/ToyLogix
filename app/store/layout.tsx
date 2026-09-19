import AccessGate from '../components/AccessGate';
export default function StoreLayout({children}:{children:React.ReactNode}) {return <AccessGate>{children}</AccessGate>;}
