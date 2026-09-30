import {orderContext,orderFailure} from '@/lib/order-server';
import {orderPdfBytes} from '@/lib/order-delivery';
import {authJson} from '@/lib/auth-handler';
import type {Order} from '@/lib/orders';
import type {CartLine} from '@/lib/order-request';
export const runtime='nodejs';
export async function POST(request:Request){
 try{const {client}=await orderContext(request);const text=await request.text();if(text.length>2000)return authJson({error:'Cerere invalidă.'},400);const body=JSON.parse(text);if(typeof body.orderId!=='string')return authJson({error:'Comandă invalidă.'},400);
 const [{data:order,error},{data:lines,error:failed}]=await Promise.all([client.from('b2b_orders').select('*').eq('id',body.orderId).single(),client.from('b2b_order_lines').select('product,boxes').eq('order_id',body.orderId)]);
 if(error||failed)return authJson({error:'Comanda nu este disponibilă.'},404);
 const bytes=await orderPdfBytes(order as Order,lines as CartLine[]);
 return new Response(new Uint8Array(bytes),{headers:{'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="${order.code}.pdf"`,'Cache-Control':'private, no-store'}});
 }catch(error){const failure=orderFailure(error);return authJson({error:failure.error},failure.status);}
}
