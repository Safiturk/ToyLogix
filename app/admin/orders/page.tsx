import OrdersPanel from '@/app/components/OrdersPanel';
export default async function OrdersPage({searchParams}:{searchParams:Promise<{order?:string|string[];status?:string|string[]}>}) {
 const query=await searchParams;
 const id=typeof query.order==='string'?query.order:undefined,status=typeof query.status==='string'?query.status:undefined;
 return <OrdersPanel key={`${id}:${status}`} admin initialOrderId={id} initialStatus={status}/>;
}
