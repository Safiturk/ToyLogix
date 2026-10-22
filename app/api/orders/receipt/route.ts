import { orderContext, orderFailure } from '@/lib/order-server';
import { authJson } from '@/lib/auth-handler';
import { receiptType } from '@/lib/orders';
import {wakeOrderMailWorker} from '@/lib/order-mail-worker';
export const runtime = 'nodejs';
export async function POST(request: Request) {
 try {
 const {client,privileged,user} = await orderContext(request);
 if (Number(request.headers.get('content-length'))>6*1024*1024) return authJson({error:'Fisier prea mare (maximum 5 MB).'},400);
 const form = await request.formData(); const file = form.get('file'); const id = form.get('orderId');
 if (!(file instanceof File) || !file.size || file.size>5*1024*1024 || typeof id!=='string' || !/^[0-9a-f-]{36}$/i.test(id)) return authJson({error:'Selecteaza un PDF, PNG sau JPG de maximum 5 MB.'},400);
 const {data:order,error:denied} = await client.from('b2b_orders').select('user_id,status').eq('id',id).single();
 if (denied || order.user_id!==user.id || !['pending_review','awaiting_payment','payment_under_review'].includes(order.status)) return authJson({error:'Comanda nu mai accepta dovezi de plata.'},403);
 const bytes = new Uint8Array(await file.arrayBuffer()); const type = receiptType(bytes);
 if (!type) return authJson({error:'Format invalid. Foloseste PDF, PNG sau JPG.'},400);
 const path = `${user.id}/${id}/${crypto.randomUUID()}.${type==='application/pdf'?'pdf':type==='image/png'?'png':'jpg'}`;
 const {error:upload} = await client.storage.from('order-receipts').upload(path,bytes,{contentType:type});
 if (upload) throw upload;
 const {data:updated,error} = await client.rpc('transition_b2b_order',{p_id:id,p_status:'payment_under_review',p_receipt:path});
 if (error) { if (privileged) await privileged.storage.from('order-receipts').remove([path]); return authJson({error:'Dovada nu a fost asociata. Reincarca pagina si incearca din nou.'},409); }
 try{await wakeOrderMailWorker(client);}catch{/* The database queue remains durable. */}
 return authJson({order:updated});
 } catch (error) {
   const failure = orderFailure(error);
   return authJson({error:failure.error},failure.status);
 }
}
