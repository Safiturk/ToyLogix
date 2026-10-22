import { readFile } from 'node:fs/promises';
import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import type { SupabaseClient } from '@supabase/supabase-js';
import { companyDetails, money, lineTotals, type CartLine } from './order-request.ts';
import { orderStatuses, type Order, type OrderStatus } from './orders.ts';
import { readServerEnv } from './env-validation.ts';

export async function deliverOrder(client: SupabaseClient, id: string) {
 const env = readServerEnv(process.env);
 if (!env.mail) throw new Error('Mail not configured');
 const { data: queue, error: claimed } = await client.from('b2b_order_notifications').update({claimed_at:new Date().toISOString()})
  .eq('order_id',id).is('sent_at',null).or(`claimed_at.is.null,claimed_at.lt.${new Date(Date.now()-120000).toISOString()}`).select('order_id').maybeSingle();
 if (claimed) throw claimed;
 if (!queue) return;
 try {
 const {data: order, error} = await client.from('b2b_orders').select('*').eq('id',id).single();
 const {data: rows, error: failed} = await client.from('b2b_order_lines').select('product,boxes').eq('order_id',id);
 if (error || failed) throw error || failed;
 const o = order as Order;
 const attachment = (await orderPdfBytes(o,rows as CartLine[])).toString('base64');
 for (const [recipient,kind] of [[o.customer_email,'customer'],[env.mail.to,'admin']]) {
 const path=kind==='admin'?'/admin/orders':'/store/orders';
 const response = await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${env.mail.apiKey}`,'Content-Type':'application/json','Idempotency-Key':`order/${id}/${kind}`},signal:AbortSignal.timeout(8000),body:JSON.stringify({from:env.mail.from,to:[recipient],subject:`Cerere de comanda ${o.code}`,text:`Cererea ${o.code} a fost inregistrata. Total net: ${money(o.total_cents)}. Urmariti cererea in platforma ToyLogix. ${env.siteUrl ? env.siteUrl+path+"?order="+id : ""} Efectuati plata dupa aprobarea cererii. Referinta transferului: ${o.code}.`,attachments:[{filename:`${o.code}.pdf`,content:attachment}]})});
 if (!response.ok || !(await response.json()).id) throw new Error('Mail delivery failed');
 }
 const {error: acknowledged} = await client.from('b2b_order_notifications').update({sent_at:new Date().toISOString()}).eq('order_id',id);
 if (acknowledged) throw acknowledged;
 } catch (error) {
 await client.from('b2b_order_notifications').update({claimed_at:null}).eq('order_id',id);
 throw error;
 }
}

export async function orderPdfBytes(o: Order,lines:CartLine[]) {
 const doc = new jsPDF();
 const font = await readFile(process.cwd()+'/public/fonts/NotoSans.ttf');
 doc.addFileToVFS('NotoSans.ttf',font.toString('base64')); doc.addFont('NotoSans.ttf','NotoSans','normal'); doc.setFont('NotoSans');
 doc.setFontSize(18); doc.text(`ToyLogix · ${o.code}`,14,20);
 autoTable(doc,{startY:30,styles:{font:'NotoSans',fontStyle:'normal'},body:[...companyDetails(o.company.account,o.company.billing),['Data',new Date(o.created_at).toLocaleDateString('ro-RO')]]});
 autoTable(doc,{styles:{font:'NotoSans',fontStyle:'normal'},head:[['Produs','Cutii','Bucati','Subtotal']],body:lines.map(l=>[l.product.nume_produs,l.boxes,lineTotals(l).quantity,money(lineTotals(l).cents)])});
 autoTable(doc,{styles:{font:'NotoSans',fontStyle:'normal'},body:[['Total net (RON)',money(o.total_cents)],['IBAN',o.bank_iban],['Beneficiar',o.bank_beneficiary],['Referinta obligatorie',o.code],['Stare',orderStatuses[o.status] || 'Cerere in curs de verificare'],['Nota','Acesta este rezumatul comenzii, nu o factura fiscala. Transferul se efectueaza dupa aprobarea cererii. Dovada platii este optionala.']]});
 return Buffer.from(doc.output('arraybuffer'));
}

export async function deliverOrderStatus(client:SupabaseClient,eventId:number) {
 const env=readServerEnv(process.env);
 if(!env.mail)throw new Error('Mail not configured');
 const {data:queue,error:claim}=await client.from('b2b_order_status_notifications').update({claimed_at:new Date().toISOString()}).eq('event_id',eventId).is('sent_at',null).or(`claimed_at.is.null,claimed_at.lt.${new Date(Date.now()-120000).toISOString()}`).select('*').maybeSingle();
 if(claim)throw claim;if(!queue)return;
 try {
 const {data:order,error}=await client.from('b2b_orders').select('*').eq('id',queue.order_id).single();if(error)throw error;
 const o=order as Order,status=queue.status as OrderStatus;
 const guidance:Record<OrderStatus,string>={pending_review:'Cererea a fost primita.',awaiting_payment:`Cererea este aprobata. Total net: ${money(o.total_cents)}. IBAN: ${o.bank_iban}. Beneficiar: ${o.bank_beneficiary}. Referinta obligatorie: ${o.code}.`,payment_under_review:'Dovada platii a fost incarcata. ToyLogix verifica transferul bancar.',payment_confirmed:'Plata a fost confirmata. Comanda este pregatita pentru livrare.',cancelled:'Comanda a fost anulata. Nu mai efectuati plata.',rejected:'Cererea sau plata a fost respinsa. Contactati ToyLogix pentru detalii.'};
 for(const [recipient,kind] of [[o.customer_email,'customer'],[env.mail.to,'admin']]) {
 const path=kind==='admin'?'/admin/orders':'/store/orders';
 const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${env.mail.apiKey}`,'Content-Type':'application/json','Idempotency-Key':`order-event/${eventId}/${kind}`},signal:AbortSignal.timeout(8000),body:JSON.stringify({from:env.mail.from,to:[recipient],subject:`${o.code} · ${orderStatuses[status]}`,text:`${o.code}\n${orderStatuses[status]}\n\n${guidance[status]}\n\n${env.siteUrl?env.siteUrl+path+'?order='+o.id:'Urmariti comanda in platforma ToyLogix.'}`})});
 if(!response.ok||!(await response.json()).id)throw new Error('Status mail delivery failed');
 }
 const {error:failed}=await client.from('b2b_order_status_notifications').update({sent_at:new Date().toISOString()}).eq('event_id',eventId);if(failed)throw failed;
 }catch(error){await client.from('b2b_order_status_notifications').update({claimed_at:null}).eq('event_id',eventId);throw error;}
}
export async function deliverPendingOrderUpdates(client:SupabaseClient,id:string) {
 await deliverOrder(client,id);
 const {data,error}=await client.from('b2b_order_status_notifications').select('event_id').eq('order_id',id).is('sent_at',null).order('event_id');if(error)throw error;
 for(const row of data??[])await deliverOrderStatus(client,row.event_id);
}
