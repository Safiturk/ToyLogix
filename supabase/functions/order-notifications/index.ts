import {createClient} from 'npm:@supabase/supabase-js@2.111.0';
import {jsPDF} from 'npm:jspdf@4.2.1';
import {autoTable} from 'npm:jspdf-autotable@5.0.8';
import {fontBase64} from './font.ts';

const labels:Record<string,string>={pending_review:'Cerere în curs de verificare',awaiting_payment:'Așteaptă plata',payment_under_review:'Plată în curs de verificare',payment_confirmed:'Plată confirmată',cancelled:'Anulată',rejected:'Respinsă'};
const money=(cents:number)=>(cents/100).toLocaleString('ro-RO',{style:'currency',currency:'RON'});
const headers={'Content-Type':'application/json','Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});

Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response(null,{headers});
 if(req.method!=='POST')return json({ok:false},405);
 const url=Deno.env.get('SUPABASE_URL')!,service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,anon=Deno.env.get('SUPABASE_ANON_KEY')!;
 const token=req.headers.get('authorization')?.replace(/^Bearer /i,'');if(!token)return json({ok:false},401);
 const db=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
 let admin=false;
 // The gateway checks JWTs. Queue-only cron wakeups use the project anon JWT;
 // other callers must be verified accounts, with ownership enforced elsewhere.
 if(token!==anon){
  const caller=createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:`Bearer ${token}`}}});
  const {data,error}=await caller.auth.getUser(token);if(error||!data.user?.email_confirmed_at)return json({ok:false},401);
  const {data:isAdmin,error:denied}=await caller.rpc('toylogix_is_admin');admin=!denied&&isAdmin===true;
 }
 try{
  const body=await req.json();if(!['process','health'].includes(body.action))return json({ok:false},400);
  if(body.action==='health'&&!admin)return json({ok:false},403);
  const {data:config,error:configError}=await db.rpc('order_mail_config');if(configError)throw configError;
  const configured=Boolean(config?.apiKey&&config?.from&&config?.to);
  if(body.action==='health'){
   const {count,error}=await db.from('b2b_order_notifications').select('order_id',{count:'exact',head:true}).is('sent_at',null);if(error)throw error;
   return json({ok:true,configured,pending:count});
  }
  if(!configured)return json({ok:true,configured:false});
  const cutoff=new Date(Date.now()-120000).toISOString();
  const [initial,updates]=await Promise.all([
   db.from('b2b_order_notifications').select('order_id').is('sent_at',null).or(`claimed_at.is.null,claimed_at.lt.${cutoff}`).order('order_id').limit(5),
   db.from('b2b_order_status_notifications').select('event_id').is('sent_at',null).or(`claimed_at.is.null,claimed_at.lt.${cutoff}`).order('event_id').limit(5),
  ]);
  if(initial.error||updates.error)throw initial.error||updates.error;
  let failed=0,sent=0;
  // Sequential sends stay below Resend's default request rate; the atomic
  // database claims protect simultaneous wakeups and retries.
  for(const row of initial.data??[])await deliver('initial',row.order_id).then(()=>sent++).catch(()=>failed++);
  for(const row of updates.data??[])await deliver('status',row.event_id).then(()=>sent++).catch(()=>failed++);
  return json({ok:true,configured:true,sent,failed});

  async function deliver(kind:'initial'|'status',id:string|number){
   const table=kind==='initial'?'b2b_order_notifications':'b2b_order_status_notifications';
   const field=kind==='initial'?'order_id':'event_id';
   const {data:queue,error:claim}=await db.from(table).update({claimed_at:new Date().toISOString()}).eq(field,id).is('sent_at',null).or(`claimed_at.is.null,claimed_at.lt.${cutoff}`).select('*').maybeSingle();
   if(claim)throw claim;if(!queue)return;
   try{
    const {data:o,error}=await db.from('b2b_orders').select('*').eq('id',queue.order_id).single();if(error)throw error;
    let attachment:string|undefined;
    if(kind==='initial'){
     const {data:lines,error}=await db.from('b2b_order_lines').select('product,boxes').eq('order_id',o.id);if(error)throw error;
     const doc=new jsPDF();doc.addFileToVFS('NotoSans.ttf',fontBase64);doc.addFont('NotoSans.ttf','NotoSans','normal');doc.setFont('NotoSans');doc.setFontSize(18);doc.text(`ToyLogix · ${o.code}`,14,20);
     const b=o.company.billing,a=o.company.account;
     autoTable(doc,{startY:30,styles:{font:'NotoSans',fontStyle:'normal'},body:[['Companie',b.legal_name||a.nume_firma],['CUI',b.tax_number],['Adresă',`${b.address_line1}, ${b.city}`],['Contact',a.nume_complet],['E-mail',o.customer_email],['Data',new Date(o.created_at).toLocaleDateString('ro-RO')]]});
     autoTable(doc,{styles:{font:'NotoSans',fontStyle:'normal'},head:[['Produs','Cutii','Bucăți','Subtotal']],body:(lines??[]).map(l=>[l.product.nume_produs,l.boxes,l.boxes*l.product.bucati_per_cutie,money(Math.round(l.product.pret_engros*100)*l.boxes*l.product.bucati_per_cutie)])});
     autoTable(doc,{styles:{font:'NotoSans',fontStyle:'normal'},body:[['Total net',money(o.total_cents)],['IBAN',o.bank_iban],['Beneficiar',o.bank_beneficiary],['Referință obligatorie',o.code],['Stare',labels[o.status]],['Notă','Rezumatul comenzii, nu factură fiscală. Transferul se efectuează după aprobarea cererii. Dovada plății este opțională.']]});
     attachment=doc.output('datauristring').split(',')[1];
    }
    const status=kind==='initial'?'pending_review':queue.status;
    const guidance:Record<string,string>={pending_review:'Cererea a fost primită. Așteaptă aprobarea ToyLogix înainte de a efectua transferul.',awaiting_payment:`Cererea a fost aprobată. Total net: ${money(o.total_cents)}. IBAN: ${o.bank_iban}. Beneficiar: ${o.bank_beneficiary}. Referință obligatorie: ${o.code}.`,payment_under_review:'Dovada plății a fost încărcată. ToyLogix verifică transferul bancar.',payment_confirmed:'Plata a fost confirmată. Comanda este pregătită pentru livrare.',cancelled:'Comanda a fost anulată. Nu mai efectua plata.',rejected:'Cererea sau plata a fost respinsă. Contactează ToyLogix pentru detalii.'};
    for(const [recipient,audience] of [[o.customer_email,'customer'],[config.to,'admin']]){
     const path=audience==='admin'?'/admin/orders':'/store/orders';
     const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${config.apiKey}`,'Content-Type':'application/json','Idempotency-Key':kind==='initial'?`order/${o.id}/${audience}`:`order-event/${id}/${audience}`},signal:AbortSignal.timeout(10000),body:JSON.stringify({from:config.from,to:[recipient],subject:kind==='initial'?`Cerere de comandă ${o.code}`:`${o.code} · ${labels[status]}`,text:`${o.code}\n${labels[status]}\nTotal net: ${money(o.total_cents)}\n\n${guidance[status]}\n\n${config.siteUrl}${path}?order=${o.id}`,...(attachment?{attachments:[{filename:`${o.code}.pdf`,content:attachment}]}:{})})});
     if(!response.ok||!(await response.json()).id)throw new Error('Provider did not accept notification');
     await new Promise(resolve=>setTimeout(resolve,600));
    }
    const {error:failed}=await db.from(table).update({sent_at:new Date().toISOString(),claimed_at:null}).eq(field,id);if(failed)throw failed;
   }catch(error){await db.from(table).update({claimed_at:null}).eq(field,id);throw error;}
  }
 }catch{return json({ok:false,error:'Notification worker unavailable'},503);}
});
