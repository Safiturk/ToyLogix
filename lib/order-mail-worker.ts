import type {SupabaseClient} from '@supabase/supabase-js';

// The hosted worker reads only durable queues; callers cannot supply recipients.
export async function wakeOrderMailWorker(client:SupabaseClient,action:'process'|'health'='process'){
 const {data,error}=await client.functions.invoke('order-notifications',{body:{action}});
 if(error||!data?.ok)throw new Error('Order email worker unavailable');
 return data as {ok:true;configured:boolean;pending:number|null;failed?:number};
}
