"use client";
import {useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {orderStatuses} from '@/lib/orders';
import {useOrderInbox} from './useOrderInbox';
import s from './orders.module.css';
export default function OrderNotifications({admin=false,enabled=true}:{admin?:boolean;enabled?:boolean}) {
 const {inbox,error,markRead}=useOrderInbox(enabled);
 const [open,setOpen]=useState(false);const ref=useRef<HTMLDivElement>(null);
 useEffect(()=>{const close=(e:PointerEvent)=>{if(!ref.current?.contains(e.target as Node))setOpen(false);};const escape=(e:KeyboardEvent)=>{if(e.key==='Escape')setOpen(false);};document.addEventListener('pointerdown',close);document.addEventListener('keydown',escape);return()=>{document.removeEventListener('pointerdown',close);document.removeEventListener('keydown',escape);};},[]);
 const href=admin?'/admin/orders':'/store/orders';
 return <div className={s.bellWrap} ref={ref}>
  <button className={s.bell} aria-label={`Notificări comenzi${inbox?.unread?`, ${inbox.unread} necitite`:''}`} aria-expanded={open} onClick={()=>setOpen(v=>!v)}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg>Notificări{Boolean(inbox?.unread)&&<span className={s.count}>{inbox!.unread}</span>}</button>
  {open&&<div className={s.dropdown}><div className={s.widgetHeading}><strong>Notificări comenzi</strong><button onClick={()=>void markRead()} disabled={!inbox?.unread}>Marchează ca citite</button></div>{error&&<p role="alert">{error}</p>}{!inbox?.notifications.length&&<p>Nu există notificări noi.</p>}{inbox?.notifications.map(item=><Link key={item.id} href={`${href}?order=${item.order_id}`} className={item.unread?s.unread:''} onClick={()=>setOpen(false)}><strong>{item.code}</strong><span>{orderStatuses[item.status]}</span><small>{new Date(item.created_at).toLocaleString('ro-RO')}</small></Link>)}<Link href={href} onClick={()=>setOpen(false)}>Vezi toate comenzile →</Link></div>}
 </div>;
}
