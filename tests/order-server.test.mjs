import test from 'node:test';
import assert from 'node:assert/strict';
import {orderContext,orderFailure,orderOriginAllowed} from '../lib/order-server.ts';
const env={NEXT_PUBLIC_SUPABASE_URL:'https://example.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'sb_publishable_test'};
const user={id:'customer',email_confirmed_at:'2026-09-30'};
const request=(origin='http://localhost:3100',token='valid')=>new Request('http://localhost:3100/api/orders',{method:'POST',headers:{origin,...(token?{authorization:`Bearer ${token}`}:{})}});
test('same-origin browser checkout works when Next reconstructs an internal URL',()=>{
 const r=new Request('http://localhost:3100/api/orders',{headers:{origin:'http://192.168.1.181:3100',host:'localhost:3100','sec-fetch-site':'same-origin'}});
 assert.equal(orderOriginAllowed(r),true);
 assert.equal(orderOriginAllowed(r,'https://toylogix.example'),false);
});
test('host and HTTPS proxy scheme support LAN and loopback addresses without trusting forwarded hosts',()=>{
 const r=(headers)=>new Request('http://localhost:3100/api/orders',{headers});
 assert.equal(orderOriginAllowed(r({origin:'http://127.0.0.1:3100',host:'127.0.0.1:3100'})),true);
 assert.equal(orderOriginAllowed(r({origin:'http://192.168.1.181:3100',host:'192.168.1.181:3100'})),true);
 assert.equal(orderOriginAllowed(r({origin:'https://toylogix.example',host:'toylogix.example','x-forwarded-proto':'https'})),true);
 assert.equal(orderOriginAllowed(r({origin:'https://attacker.example',host:'toylogix.example','x-forwarded-host':'attacker.example'})),false);
 assert.equal(orderOriginAllowed(r({origin:'http://localhost:3101',host:'localhost:3100'})),false);
});
test('missing, opaque and cross-site browser origins are denied',()=>{
 for(const headers of [{},{origin:'null','sec-fetch-site':'same-origin'},{origin:'http://localhost:3100','sec-fetch-site':'cross-site'},{origin:'https://attacker.example','sec-fetch-site':'same-site'},{origin:'http://localhost:3100/path','sec-fetch-site':'same-origin'}])
  assert.equal(orderOriginAllowed(new Request('http://localhost:3100/api/orders',{headers})),false);
});
test('legacy checkout verifies JWT without requiring unrelated server secrets',async()=>{
 const calls=[];
 const factory=(url,key,options)=>{calls.push({url,key,options});return {auth:{async getUser(token){assert.equal(token,'valid');return {data:{user},error:null};}}};};
 const context=await orderContext(request(),env,factory);
 assert.equal(context.user,user);assert.equal(context.privileged,null);assert.equal(calls.length,1);
 assert.equal(calls[0].options.global.headers.Authorization,'Bearer valid');
});
test('server mail client is optional and separate from the caller JWT',async()=>{
 const calls=[];const factory=(url,key,options)=>{calls.push({key,options});return {auth:{async getUser(){return {data:{user},error:null};}}};};
 const context=await orderContext(request(),{...env,SUPABASE_SERVICE_ROLE_KEY:'private-key'},factory);
 assert.ok(context.privileged);assert.equal(calls[1].key,'private-key');assert.equal(calls[1].options.global,undefined);
});
test('cross-origin and unsigned checkout fail before any backend call',async()=>{
 const factory=()=>{throw new Error('Backend must not be called');};
 await assert.rejects(()=>orderContext(request('https://attacker.example'),env,factory),error=>orderFailure(error).status===403);
 await assert.rejects(()=>orderContext(request('http://localhost:3100',''),env,factory),error=>orderFailure(error).status===401);
});
test('expired and unconfirmed JWT sessions are rejected',async()=>{
 for(const result of [{data:{user:null},error:{message:'expired'}},{data:{user:{id:'customer'}},error:null}]) {
  const factory=()=>({auth:{async getUser(){return result;}}});
  await assert.rejects(()=>orderContext(request(),env,factory),error=>orderFailure(error).status===401);
 }
});
