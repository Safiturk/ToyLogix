import { createClient } from '@supabase/supabase-js';
import { readServerEnv } from '../../lib/env-validation';
import { deliverOrder, deliverOrderStatus } from '../../lib/order-delivery';
export default async function handler() {
 const env=readServerEnv(process.env);
 if (!env.secret || !env.mail) throw new Error('Order delivery configuration incomplete');
 const client=createClient(env.url,env.secret,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data,error}=await client.from('b2b_order_notifications').select('order_id').is('sent_at',null).order('order_id').limit(10);
 if(error) throw error;
 const results=await Promise.allSettled((data??[]).map(row=>deliverOrder(client,row.order_id)));
 const {data:events,error:failed}=await client.from('b2b_order_status_notifications').select('event_id').is('sent_at',null).order('event_id').limit(10);
 if(failed)throw failed;
 const statusResults=await Promise.allSettled((events??[]).map(event=>deliverOrderStatus(client,event.event_id)));
 if(statusResults.some(r=>r.status==='rejected'))throw new Error('Status notifications will be retried');
 if(results.some(r=>r.status==='rejected')) throw new Error('Order notifications will be retried');
 return new Response('Order notifications processed');
}
export const config={schedule:'*/5 * * * *'};
