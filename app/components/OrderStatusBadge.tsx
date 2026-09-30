"use client";
import {orderStatuses,type OrderStatus} from '@/lib/orders';
import s from './orders.module.css';
export const statusTone:Record<OrderStatus,string>={pending_review:'amber',awaiting_payment:'blue',payment_under_review:'violet',payment_confirmed:'green',cancelled:'red',rejected:'red'};
export default function OrderStatusBadge({status}:{status:OrderStatus}) {
 const pending=['pending_review','awaiting_payment','payment_under_review'].includes(status);
 return <span className={`${s.badge} ${s[statusTone[status]]}`} data-status={status}><span className={`${s.dot} ${pending?s.pulse:''}`} aria-hidden="true">{status==='payment_confirmed'?'✓':['cancelled','rejected'].includes(status)?'×':''}</span>{orderStatuses[status]}</span>;
}
export function OrderProgress({status}:{status:OrderStatus}) {
 const steps=['Cerere primită','Cerere aprobată','Verificarea plății','Plată confirmată'];
 const position=['pending_review','awaiting_payment','payment_under_review','payment_confirmed'].indexOf(status);
 const descriptions:Record<OrderStatus,string>={pending_review:'Cererea a fost primită. Așteaptă aprobarea ToyLogix înainte de a efectua transferul.',awaiting_payment:'Cererea este aprobată. Efectuează transferul și folosește codul comenzii ca referință.',payment_under_review:'Dovada a fost primită. ToyLogix verifică transferul bancar.',payment_confirmed:'Plata este confirmată. Comanda este pregătită pentru livrare.',cancelled:'Comanda a fost anulată. Nu mai efectua plata pentru această comandă.',rejected:'Cererea sau plata a fost respinsă. Contactează ToyLogix pentru detalii.'};
 return <div className={`${s.progressCard} ${s[statusTone[status]]}`} role="status" aria-live="polite"><OrderStatusBadge status={status}/><p>{descriptions[status]}</p><ol className={s.steps}>{steps.map((step,index)=><li key={step} className={index<position?s.complete:index===position?s.current:''} aria-current={index===position?'step':undefined}><span className={s.stepCircle}>{index<position?'✓':index+1}</span><span>{step}</span></li>)}</ol></div>;
}
