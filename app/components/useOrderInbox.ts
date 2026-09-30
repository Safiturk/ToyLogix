"use client";
import {useCallback,useEffect,useRef,useState} from 'react';
import {supabase} from '@/lib/supabase';
import type {Order,OrderStatus} from '@/lib/orders';
export type InboxNotification={id:number;order_id:string;code:string;status:OrderStatus;created_at:string;unread:boolean};
export type OrderInbox={unread:number;counts:Partial<Record<OrderStatus,number>>;notifications:InboxNotification[];latest:Order[]};
export function useOrderInbox(enabled=true) {
 const [inbox,setInbox]=useState<OrderInbox|null>(null);
 const [error,setError]=useState('');
 const alive=useRef(false);
 const refresh=useCallback(async()=>{
  if(!enabled) return;
  const {data,error}=await supabase.rpc('order_inbox');
  if(!alive.current)return;
  if(error) setError('Notificările nu pot fi încărcate.');else{setInbox(data as OrderInbox);setError('');}
 },[enabled]);
 useEffect(()=>{
  alive.current=true;
  const update=()=>{if(document.visibilityState==='visible')void refresh();};
  void Promise.resolve().then(refresh);const timer=setInterval(update,15000);
  window.addEventListener('focus',update);window.addEventListener('toylogix-orders',update);
  return()=>{alive.current=false;clearInterval(timer);window.removeEventListener('focus',update);window.removeEventListener('toylogix-orders',update);};
 },[refresh]);
 async function markRead(){
  const latest=inbox?.notifications[0]?.created_at;
  if(!latest)return;
  const {error}=await supabase.rpc('mark_order_notifications_read',{p_until:latest});
  if(error)setError('Notificările nu pot fi marcate ca citite.');else{await refresh();window.dispatchEvent(new Event('toylogix-orders'));}
 }
 return {inbox,error,refresh,markRead};
}
