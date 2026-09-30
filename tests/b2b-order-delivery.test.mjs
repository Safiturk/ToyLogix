import test from 'node:test';
import assert from 'node:assert/strict';
import {deliverOrder} from '../lib/order-delivery.ts';
import {receiptType} from '../lib/orders.ts';
test('receipt signature validation accepts only supported files',()=>{
 assert.equal(receiptType(new TextEncoder().encode('%PDF-1.7')),'application/pdf');
 assert.equal(receiptType(Uint8Array.from([137,80,78,71,13,10,26,10])),'image/png');
 assert.equal(receiptType(Uint8Array.from([255,216,255,224])),'image/jpeg');
 assert.equal(receiptType(new TextEncoder().encode('<script>not a pdf</script>')),null);
 assert.equal(receiptType(Uint8Array.from([137,80])),null);
});
test('server PDF delivery sends both recipients and preserves queue on failure',async()=>{
 const originalEnv={...process.env};const originalFetch=global.fetch;
 Object.assign(process.env,{NEXT_PUBLIC_SUPABASE_URL:'https://example.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'sb_publishable_test',NEXT_PUBLIC_ACCOUNT_HARDENING_ENABLED:'false',RESEND_API_KEY:'test',NOTIFICATION_FROM:'orders@example.ro',NOTIFICATION_TO:'admin@example.ro'});
 delete process.env.AUTH_RATE_LIMIT_SECRET;
 const order={id:'test-order',code:'TLX-2026-0042',created_at:'2026-09-30T10:00:00Z',total_cents:14808,bank_iban:'RO1111111111111',bank_beneficiary:'Test SRL',company:{account:{nume_firma:'Știință SRL',email:'customer@example.ro',telefon:'123',nume_complet:'Ștefan'},billing:{}},customer_email:'customer@example.ro'};
 const lines=[{product:{id:1,nume_produs:'Jucărie',pret_engros:12.34,bucati_per_cutie:6},boxes:2}];
 const updates=[];
 const client={from(table){const result=()=>({data:table==='b2b_orders'?order:table==='b2b_order_lines'?lines:{order_id:order.id},error:null});const chain={update(value){updates.push(value);return chain;},select(){return chain;},eq(){return chain;},is(){return chain;},or(){return chain;},async maybeSingle(){return result();},async single(){return result();},then(resolve,reject){return Promise.resolve(result()).then(resolve,reject);}};return chain;}};
 try {
 const sent=[];global.fetch=async(url,options)=>{const body=JSON.parse(options.body);sent.push({body,key:options.headers['Idempotency-Key']});return Response.json({id:'accepted'});};
 await deliverOrder(client,order.id);
 assert.deepEqual(sent.map(s=>s.body.to[0]),['customer@example.ro','admin@example.ro']);
 assert.ok(updates.some(u=>u.sent_at));
 for(const {body} of sent){assert.equal(body.attachments[0].filename,'TLX-2026-0042.pdf');assert.equal(Buffer.from(body.attachments[0].content,'base64').subarray(0,5).toString(),'%PDF-');}
 assert.deepEqual(sent.map(s=>s.key),['order/test-order/customer','order/test-order/admin']);
 updates.length=0;let calls=0;global.fetch=async()=>++calls===1?Response.json({id:'accepted'}):Response.json({error:'failed'},{status:503});
 await assert.rejects(()=>deliverOrder(client,order.id),/Mail delivery failed/);
 assert.ok(updates.some(u=>u.claimed_at===null));assert.equal(updates.some(u=>u.sent_at),false);
 }finally{global.fetch=originalFetch;for(const key of Object.keys(process.env))if(!(key in originalEnv))delete process.env[key];Object.assign(process.env,originalEnv);}
});
