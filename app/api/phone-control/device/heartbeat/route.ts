import {NextRequest,NextResponse} from 'next/server';
import {getDeviceToken} from '@/lib/dro-phone-control';
export async function POST(req:NextRequest){
 const auth=req.headers.get('authorization')||'';
 const token=auth.startsWith('Bearer ')?auth.slice(7):'';
 const d=await getDeviceToken(token);
 if(!d)return NextResponse.json({ok:false,error:'DEVICE_UNAUTHORIZED'},{status:401});
 return NextResponse.json({ok:true,deviceId:d.device_public_id,serverTime:new Date().toISOString()});
}