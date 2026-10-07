import {NextRequest,NextResponse} from 'next/server';
import {getDeviceToken,updatePhoneSessionFromDevice} from '@/lib/dro-phone-control';

export async function POST(req:NextRequest){
 const auth=req.headers.get('authorization')||'';
 const token=auth.startsWith('Bearer ')?auth.slice(7):'';
 const d=await getDeviceToken(token);
 if(!d)return NextResponse.json({ok:false,error:'DEVICE_UNAUTHORIZED'},{status:401});
 const body=await req.json().catch(()=>({}));
 try{
   const state=String(body?.state||'CONNECTED').toUpperCase();
   const result=await updatePhoneSessionFromDevice(token,state,{
     battery:Number.isFinite(body?.battery)?Number(body.battery):null,
     fps:Number.isFinite(body?.fps)?Number(body.fps):null,
     latencyMs:Number.isFinite(body?.latencyMs)?Number(body.latencyMs):null,
     accessibility:Boolean(body?.accessibility),
     mediaProjection:Boolean(body?.mediaProjection)
   });
   return NextResponse.json({ok:true,deviceId:d.device_public_id,serverTime:new Date().toISOString(),...result});
 }catch(e){
   return NextResponse.json({ok:false,error:e instanceof Error?e.message:'HEARTBEAT_FAILED'},{status:400});
 }
}