import { orderContext, orderFailure } from '@/lib/order-server';
import { authJson } from '@/lib/auth-handler';
import { deliverOrder } from '@/lib/order-delivery';
import {wakeOrderMailWorker} from '@/lib/order-mail-worker';
export const runtime = 'nodejs';
export async function POST(request: Request) {
 try {
 const {client,privileged} = await orderContext(request);
 const text = await request.text();
 if (text.length>20000) return authJson({error:'Coș prea mare.'},400);
 const body = JSON.parse(text);
 if (!Array.isArray(body.lines) || body.lines.length>100 || !/^[0-9a-f-]{36}$/i.test(body.key)) return authJson({error:'Cerere invalidă.'},400);
 const {data: order,error} = await client.rpc('submit_b2b_order',{p_key:body.key,p_lines:body.lines});
 if (error) {
   if (error.code === 'PGRST202' || error.code === '42P01')
     return authJson({error:'Serviciul de comenzi necesită actualizarea bazei de date. Contactează ToyLogix.'},503);
   return authJson({error:'Cererea nu a fost creată. Verifică stocul și prețurile curente, apoi încearcă din nou.'},409);
 }
 let notificationPending = false;
 try {
   if (privileged&&process.env.RESEND_API_KEY) await deliverOrder(privileged,order.id);
   else {const result=await wakeOrderMailWorker(client);if(!result.configured||result.failed)throw new Error('Mail pending');}
 } catch { notificationPending = true; }
 return authJson({order,notificationPending});
 } catch (error) {
   const failure = orderFailure(error);
   return authJson({error:failure.error},failure.status);
 }
}
