"use client";
import {useCallback,useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {supabase} from '@/lib/supabase';
import {orderStatuses,type Order,type OrderStatus} from '@/lib/orders';
import {money,companyDetails,lineTotals,type CartLine} from '@/lib/order-request';
import OrderStatusBadge,{OrderProgress} from './OrderStatusBadge';
import OrderNotifications from './OrderNotifications';
import OrderReceipt from './OrderReceipt';
import {authPost} from '@/lib/auth-client';
import s from '@/app/store/cart.module.css';
import ui from './orders.module.css';
type OrderEvent={id:number;status:OrderStatus;created_at:string;actor:string};
type MailHealth={configured:boolean;missing:string[];pending:number|null};
export default function OrdersPanel({admin=false,initialOrderId=null,initialStatus='all'}:{admin?:boolean;initialOrderId?:string|null;initialStatus?:string}) {
 const [orders,setOrders]=useState<Order[]>([]),[selected,setSelected]=useState<Order|null>(null);
 const [lines,setLines]=useState<CartLine[]>([]),[events,setEvents]=useState<OrderEvent[]>([]);
 const [message,setMessage]=useState(''),[loadError,setLoadError]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true);
 const [page,setPage]=useState(0),[count,setCount]=useState(0),[filter,setFilter]=useState(initialStatus in orderStatuses||['open','history'].includes(initialStatus)?initialStatus:'all'),[search,setSearch]=useState('');
 const [mailHealth,setMailHealth]=useState<MailHealth|null>(null),[emailState,setEmailState]=useState<{sent_at:string|null;pending_updates:number}|null>(null);
 const [selectedId,setSelectedId]=useState<string|null>(initialOrderId);
 const alive=useRef(false),requestVersion=useRef(0);
 const selectOrder=(id:string|null)=>{setSelectedId(id);setLines([]);setEvents([]);setSelected(null);const url=new URL(window.location.href);if(id)url.searchParams.set('order',id);else url.searchParams.delete('order');window.history.replaceState(null,'',url);};
 const refresh=useCallback(async()=>{
  const version=++requestVersion.current;
  try {
   let query=supabase.from('b2b_orders').select('*',{count:'exact'}).order('created_at',{ascending:false}).order('id',{ascending:false});
   if(filter==='open')query=query.in('status',['pending_review','awaiting_payment','payment_under_review']);
   else if(filter==='history')query=query.in('status',['payment_confirmed','cancelled','rejected']);
   else if(filter in orderStatuses)query=query.eq('status',filter);
   if(search.trim())query=query.ilike('code',`%${search.trim().replace(/[\\%_]/g,'\\$&')}%`);
   const result=await query.range(page*20,page*20+19);
   if(result.error)throw result.error;
   if(!alive.current||version!==requestVersion.current)return;
   setOrders(result.data as Order[]);setCount(result.count??0);setLoadError('');setLoading(false);
   if(selectedId){
    const [order,rows,history,mail]=await Promise.all([
     supabase.from('b2b_orders').select('*').eq('id',selectedId).single(),
     supabase.from('b2b_order_lines').select('product,boxes').eq('order_id',selectedId),
     supabase.from('b2b_order_events').select('id,status,created_at,actor').eq('order_id',selectedId).order('created_at',{ascending:true}).order('id',{ascending:true}),
     supabase.rpc('order_email_state',{p_id:selectedId}),
    ]);
    if(!alive.current||version!==requestVersion.current)return;
    if(order.error||rows.error||history.error)throw order.error||rows.error||history.error;
    setSelected(order.data as Order);setLines(rows.data as CartLine[]);setEvents(history.data as OrderEvent[]);setEmailState(mail.error?null:mail.data);
   }
  }catch{if(alive.current&&version===requestVersion.current){setLoadError('Comenzile nu pot fi încărcate. Încearcă din nou.');setLoading(false);}}
 },[filter,page,search,selectedId]);
 useEffect(()=>{alive.current=true;void Promise.resolve().then(refresh);const update=()=>{if(document.visibilityState==='visible')void refresh();};const timer=setInterval(update,15000);window.addEventListener('focus',update);window.addEventListener('toylogix-orders',update);return()=>{alive.current=false;clearInterval(timer);window.removeEventListener('focus',update);window.removeEventListener('toylogix-orders',update);};},[refresh]);
 useEffect(()=>{if(!admin)return;let active=true;void authPost('/api/orders/notifications',{action:'health'},true).then(result=>{if(active)setMailHealth(result);}).catch(()=>{if(active)setMailHealth({configured:false,missing:['configurația serverului'],pending:null});});return()=>{active=false;};},[admin]);
 async function transition(status:OrderStatus){
  if(!selected||busy)return;setBusy(true);setMessage('');
  try{const {data,error}=await supabase.rpc('transition_b2b_order',{p_id:selected.id,p_status:status});if(error)throw error;setSelected(data as Order);setMessage('Starea comenzii a fost actualizată.');await refresh();window.dispatchEvent(new Event('toylogix-orders'));if(mailHealth?.configured)void authPost('/api/orders/notifications',{action:'retry',orderId:selected.id},true).catch(()=>{});}
  catch{setMessage('Acțiunea nu a fost confirmată. Verifică stocul, starea comenzii și drepturile de administrator.');}finally{setBusy(false);}
 }
 async function upload(file:File){
  if(!selected||busy)return;setBusy(true);setMessage('');
  try{const {data}=await supabase.auth.getSession();if(!data.session)throw new Error('Autentificarea este necesară.');const form=new FormData();form.set('orderId',selected.id);form.set('file',file);const response=await fetch('/api/orders/receipt',{method:'POST',headers:{Authorization:`Bearer ${data.session.access_token}`},body:form});const result=await response.json();if(!response.ok)throw new Error(result.error);setSelected(result.order);setMessage('Dovada a fost încărcată. Plata va fi verificată de ToyLogix.');await refresh();window.dispatchEvent(new Event('toylogix-orders'));}
  catch(error){setMessage(error instanceof Error?error.message:'Încărcarea nu a reușit.');}finally{setBusy(false);}
 }
 async function download(){if(!selected||busy)return;setBusy(true);try{const {data}=await supabase.auth.getSession();if(!data.session)throw new Error('Autentificarea este necesară.');const response=await fetch('/api/orders/pdf',{method:'POST',headers:{Authorization:`Bearer ${data.session.access_token}`,'Content-Type':'application/json'},body:JSON.stringify({orderId:selected.id})});if(!response.ok)throw new Error('PDF-ul nu poate fi descărcat.');const url=URL.createObjectURL(await response.blob());const a=document.createElement('a');a.href=url;a.download=`${selected.code}.pdf`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(error){setMessage(error instanceof Error?error.message:'PDF indisponibil.');}finally{setBusy(false);}}
 async function retryMail(){if(!selected||busy)return;setBusy(true);try{await authPost('/api/orders/notifications',{action:'retry',orderId:selected.id},true);setMessage('Notificările prin e-mail au fost trimise.');await refresh();}catch(error){setMessage(error instanceof Error?error.message:'E-mailurile nu au fost trimise.');}finally{setBusy(false);}}
 return <main className={s.page}><div className={s.container}>
  <div className={s.heading}><div><p className={s.muted}>TOYLOGIX · COMENZI B2B</p><h1>{admin?'Comenzi și plăți':'Comenzile mele'}</h1><p className={ui.live}>Stare actualizată automat la fiecare 15 secunde</p></div><OrderNotifications admin={admin}/><Link href={admin?'/admin':'/store'}>← Înapoi</Link></div>
  {message&&<p role="status" className={s.notice}>{message}</p>}{loadError&&<p role="alert" className={s.notice}>{loadError}</p>}
  {admin&&mailHealth&&!mailHealth.configured&&<div className={ui.mailNotice}><strong>E-mailurile automate necesită configurare.</strong><p>Comenzile și notificările din platformă funcționează. Lipsește conexiunea pentru trimiterea e-mailurilor; mesajele rămân în așteptare.</p></div>}
  {selectedId&&!selected&&!loadError&&<section className={s.panel}><p role="status">Se încarcă detaliile comenzii…</p></section>}
  {selected&&<section className={s.panel} aria-label="Detaliile comenzii">
   <div className={s.heading}><div><h2>Cerere înregistrată · {selected.code}</h2><p className={s.muted}>{new Date(selected.created_at).toLocaleString('ro-RO')}</p></div><button className={s.secondary} onClick={()=>selectOrder(null)}>Închide detaliile</button></div>
   <OrderProgress status={selected.status}/>
   <div className={s.totals}><span>Total net de plată</span><strong>{money(selected.total_cents)}</strong></div>
   <OrderReceipt key={`${selected.id}:${selected.receipt_url}`} path={selected.receipt_url}/>
   {admin&&<div className={s.actions}>
    {selected.status==='pending_review'&&<button className={s.primary} disabled={busy} onClick={()=>transition('awaiting_payment')}>Aprobă cererea / proforma</button>}
    {['awaiting_payment','payment_under_review'].includes(selected.status)&&<button className={s.primary} disabled={busy} onClick={()=>transition('payment_confirmed')}>Confirmă plata</button>}
    {['pending_review','awaiting_payment','payment_under_review'].includes(selected.status)&&<><button className={s.secondary} disabled={busy} onClick={()=>transition('rejected')}>{selected.status==='pending_review'?'Respinge cererea':'Respinge plata'}</button><button className={s.secondary} disabled={busy} onClick={()=>transition('cancelled')}>Anulează comanda</button></>}
   </div>}
   <h3>Plată prin transfer bancar</h3><dl className={s.company}><div><dt>IBAN</dt><dd><strong>{selected.bank_iban}</strong></dd></div><div><dt>Beneficiar</dt><dd>{selected.bank_beneficiary}</dd></div><div><dt>Bancă</dt><dd>{selected.bank_name||'—'}</dd></div><div><dt>Referință obligatorie</dt><dd><strong>{selected.code}</strong></dd></div></dl><p className={s.muted}>Scrie codul {selected.code} în detaliile transferului. Dovada plății este opțională.</p>
   <h3>Datele companiei</h3><dl className={s.company}>{companyDetails(selected.company.account,selected.company.billing).map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
   <h3>Produse comandate</h3>{lines.map(line=><div className={ui.row} key={line.product.id}><strong className={ui.rowMain}>{line.product.nume_produs}</strong><span>{line.boxes} cutii · {lineTotals(line).quantity} buc.</span><span>{money(lineTotals(line).cents)}</span></div>)}
   <div className={s.actions}><button className={s.secondary} disabled={busy} onClick={download}>Descarcă rezumatul PDF</button></div>
   {!admin&&['pending_review','awaiting_payment','payment_under_review'].includes(selected.status)&&<label className={s.notice}>Dovada plății (opțional · PDF, PNG, JPG · maximum 5 MB)<input type="file" accept="application/pdf,image/png,image/jpeg" disabled={busy} onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)void upload(file);}}/></label>}
   <h3>Istoricul comenzii</h3><ol className={ui.history}>{events.map(event=><li key={event.id}><OrderStatusBadge status={event.status}/><time dateTime={event.created_at}>{new Date(event.created_at).toLocaleString('ro-RO')}</time></li>)}</ol>
   {emailState&&<div className={s.notice}><strong>{emailState.sent_at?'Confirmarea prin e-mail a fost trimisă.':'Confirmarea prin e-mail este în așteptare.'}</strong><p>Urmărește starea comenzii aici, indiferent de livrarea e-mailului.</p>{admin&&mailHealth?.configured&&<button className={s.secondary} disabled={busy} onClick={retryMail}>Retrimite notificările în așteptare</button>}</div>}
  </section>}
  <section className={s.panel} aria-label="Lista comenzilor"><div className={s.heading}><h2>{admin?'Toate comenzile':'Istoricul comenzilor mele'}</h2><span>{count} comenzi</span></div><div className={ui.toolbar}><input aria-label="Caută codul comenzii" placeholder="Caută codul comenzii…" value={search} onChange={e=>{setSearch(e.target.value);setPage(0);}}/><select aria-label="Filtrează comenzile" value={filter} onChange={e=>{setFilter(e.target.value);setPage(0);}}><option value="all">Toate comenzile</option><option value="open">În desfășurare</option><option value="history">Finalizate / anulate</option>{Object.entries(orderStatuses).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select><button className={s.secondary} disabled={busy} onClick={()=>void refresh()}>Reîncarcă</button></div>
   {loading?<p>Se încarcă…</p>:orders.length===0?<p>Nu există comenzi pentru filtrul ales.</p>:orders.map(order=><article className={ui.row} key={order.id}><div className={ui.rowMain}><button className={s.secondary} onClick={()=>selectOrder(order.id)}>{order.code}</button><small>{admin?(order.company.account.nume_firma||order.customer_email):new Date(order.created_at).toLocaleString('ro-RO')}</small>{order.receipt_url&&<small className={ui.receiptIndicator}>Dovadă de plată încărcată</small>}</div><OrderStatusBadge status={order.status}/><strong>{money(order.total_cents)}</strong><span>{new Date(order.created_at).toLocaleDateString('ro-RO')}</span></article>)}
   <nav className={s.actions}><button className={s.secondary} disabled={page===0} onClick={()=>setPage(p=>p-1)}>Înapoi</button><span>Pagina {page+1} / {Math.max(1,Math.ceil(count/20))}</span><button className={s.secondary} disabled={(page+1)*20>=count} onClick={()=>setPage(p=>p+1)}>Înainte</button></nav>
  </section>
 </div></main>;
}
