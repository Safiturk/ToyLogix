"use client";
import Link from 'next/link';
import {useOrderInbox} from '@/app/components/useOrderInbox';
import OrderStatusBadge from '@/app/components/OrderStatusBadge';
import {money} from '@/lib/order-request';
import s from '@/app/components/orders.module.css';
export default function OrderOverview({enabled}:{enabled:boolean}) {
 const {inbox,error}=useOrderInbox(enabled);
 return <section className={s.widget} aria-label="Comenzi si plati"><div className={s.widgetHeading}><div><h2>Comenzi si plati</h2><p className={s.live}>Actualizare automata · cereri, plati si istoric</p></div><Link href="/admin/orders">Gestioneaza toate comenzile →</Link></div>
 <div className={s.summary}><Link href="/admin/orders?status=pending_review"><span>Cereri noi</span><strong>{inbox?.counts.pending_review??'—'}</strong></Link><Link href="/admin/orders?status=awaiting_payment"><span>Asteapta plata</span><strong>{inbox?.counts.awaiting_payment??'—'}</strong></Link><Link href="/admin/orders?status=payment_under_review"><span>Plati de verificat</span><strong>{inbox?.counts.payment_under_review??'—'}</strong></Link><Link href="/admin/orders?status=payment_confirmed"><span>Plati confirmate</span><strong>{inbox?.counts.payment_confirmed??'—'}</strong></Link></div>
 {error&&<p role="alert">{error}</p>}
 {inbox?.latest.length===0&&<p>Nu exista comenzi inregistrate.</p>}
 {inbox?.latest.map(order=><div className={s.row} key={order.id}><div className={s.rowMain}><Link href={`/admin/orders?order=${order.id}`}><strong>{order.code}</strong></Link><small>{order.company.account.nume_firma||order.customer_email}</small></div><OrderStatusBadge status={order.status}/><strong>{money(order.total_cents)}</strong><Link href={`/admin/orders?order=${order.id}`}>Verifica →</Link></div>)}
 </section>;
}
