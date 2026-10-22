import {orderContext,orderFailure} from '@/lib/order-server';
import {authJson} from '@/lib/auth-handler';
import {deliverPendingOrderUpdates} from '@/lib/order-delivery';
import {wakeOrderMailWorker} from '@/lib/order-mail-worker';
export const runtime='nodejs';
export async function POST(request:Request){
 try{
 const {client,privileged}=await orderContext(request);
 const {data:admin,error:denied}=await client.rpc('toylogix_is_admin');if(denied||!admin)return authJson({error:'Acces rezervat administratorilor.'},403);
 const text=await request.text();if(text.length>2000)return authJson({error:'Cerere invalida.'},400);const body=JSON.parse(text);
 const names=['SUPABASE_SERVICE_ROLE_KEY','RESEND_API_KEY','NOTIFICATION_FROM','NOTIFICATION_TO'];const missing=names.filter(name=>!process.env[name]?.trim());
 if(body.action==='health'){
 if(missing.length){try{const health=await wakeOrderMailWorker(client,'health');return authJson({...health,missing:health.configured?[]:['conexiunea Resend']});}catch{return authJson({configured:false,missing:['conexiunea Resend'],pending:null});}}
 let pending:null|number=null;
 if(privileged){const {count}=await privileged.from('b2b_order_notifications').select('order_id',{count:'exact',head:true}).is('sent_at',null);pending=count;}
 return authJson({configured:missing.length===0,missing,pending});
 }
 if(body.action!=='retry'||typeof body.orderId!=='string')return authJson({error:'Cerere invalida.'},400);
 if(missing.length||!privileged){try{const result=await wakeOrderMailWorker(client);if(!result.configured||result.failed)throw new Error('Mail pending');return authJson({ok:true});}catch{return authJson({error:'Trimiterea e-mailurilor nu a reusit. Mesajele raman in asteptare.'},503);}}
 try{await deliverPendingOrderUpdates(privileged,body.orderId);}catch{return authJson({error:'Trimiterea e-mailurilor nu a reusit. Verifica Resend; mesajele raman in asteptare.'},503);}
 return authJson({ok:true});
 }catch(error){const failure=orderFailure(error);return authJson({error:failure.error},failure.status);}
}
