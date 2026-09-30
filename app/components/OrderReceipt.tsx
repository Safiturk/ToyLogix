"use client";
import {useEffect,useState} from 'react';
import {supabase} from '@/lib/supabase';
import s from './orders.module.css';

export default function OrderReceipt({path}:{path:string|null}){
 const [url,setUrl]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{let active=true;
  if(!path)return;
  void supabase.storage.from('order-receipts').createSignedUrl(path,300).then(({data,error})=>{
   if(!active)return;
   if(error)setError('Dovada nu poate fi încărcată. Încearcă din nou.');else setUrl(data.signedUrl);
  });
  return()=>{active=false;};
 },[path]);
 async function reload(){if(!path)return;setBusy(true);setError('');
  try{const {data,error}=await supabase.storage.from('order-receipts').createSignedUrl(path,300);if(error)throw error;setUrl(data.signedUrl);}
  catch{setError('Dovada nu poate fi încărcată. Încearcă din nou.');}finally{setBusy(false);}
 }
 const pdf=path?.toLowerCase().endsWith('.pdf');
 return <section className={s.receiptCard} aria-label="Dovada plății">
  <div className={s.widgetHeading}><h3>Dovada plății</h3><strong>{path?'Document încărcat':'Nu a fost încărcată'}</strong></div>
  {!path?<p>Dovada este opțională. Plata poate fi verificată și după codul comenzii.</p>:<>
   <p>{pdf?'Document PDF':'Imagine PNG / JPG'} · Încărcată de client</p>
   {error&&<p role="alert">{error}</p>}
   {!url&&!error&&<p role="status">Se încarcă documentul…</p>}
   {url&&<><a className={s.receiptLink} href={url} target="_blank" rel="noopener noreferrer">Deschide documentul într-o filă nouă ↗</a>
    {pdf?<iframe className={s.receiptPreview} title="Previzualizare dovada plății PDF" src={url}/>:/* Private signed Storage URL, never a public bucket. */
     // eslint-disable-next-line @next/next/no-img-element
     <img className={s.receiptImage} src={url} alt="Dovada plății încărcată de client"/>}
   </>}
   <button className={s.receiptLink} disabled={busy} onClick={()=>void reload()}>{busy?'Se încarcă…':'Reîncarcă documentul'}</button>
  </>}
 </section>;
}
