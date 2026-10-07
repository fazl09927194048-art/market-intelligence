import {NextResponse} from 'next/server';
import {getCurrentUser} from '@/lib/auth';

export const dynamic='force-dynamic';

export async function GET(){
 const user=await getCurrentUser();
 if(!user)return NextResponse.json({ok:false,error:'AUTH_REQUIRED'},{status:401});
 const urls=(process.env.DRO_TURN_URLS||'').split(',').map(x=>x.trim()).filter(Boolean);
 const username=process.env.DRO_TURN_USERNAME||'';
 const credential=process.env.DRO_TURN_CREDENTIAL||'';
 const servers:any[]=[{urls:'stun:stun.l.google.com:19302'}];
 if(urls.length&&username&&credential)servers.push({urls,username,credential});
 return NextResponse.json({ok:true,servers,turnConfigured:servers.length>1},{headers:{'Cache-Control':'no-store'}});
}