import {NextRequest,NextResponse} from 'next/server';
import {getDeviceToken} from '@/lib/dro-phone-control';
import {Pool} from 'pg';
let pool:Pool|null=null;
function db(){if(!process.env.DATABASE_URL)return null;if(!pool)pool=new Pool({connectionString:process.env.DATABASE_URL,max:5,ssl:process.env.DATABASE_SSL==='false'?false:{rejectUnauthorized:false}});return pool}
export async function GET(req:NextRequest){
 const token=(req.headers.get('authorization')||'').replace(/^Bearer\s+/,''); const d=await getDeviceToken(token); if(!d)return NextResponse.json({ok:false,error:'DEVICE_UNAUTHORIZED'},{status:401});
 const database=db(); if(!database)return NextResponse.json({ok:false,error:'DATABASE_NOT_CONFIGURED'},{status:503});
 const q=await database.query(`SELECT id,action_type,payload,state,created_at FROM remote_actions WHERE user_id=$1 AND state='REQUESTED' ORDER BY created_at ASC LIMIT 20`,[d.user_id]);
 if(q.rows.length) await database.query(`UPDATE remote_actions SET state='EXECUTING',updated_at=NOW() WHERE id=ANY($1::uuid[])`,[q.rows.map((x:any)=>x.id)]);
 return NextResponse.json({ok:true,actions:q.rows});
}
export async function POST(req:NextRequest){
 const token=(req.headers.get('authorization')||'').replace(/^Bearer\s+/,''); const d=await getDeviceToken(token); if(!d)return NextResponse.json({ok:false,error:'DEVICE_UNAUTHORIZED'},{status:401});
 const b=await req.json().catch(()=>({})); if(!b?.actionId)return NextResponse.json({ok:false,error:'ACTION_ID_REQUIRED'},{status:400});
 const database=db(); if(!database)return NextResponse.json({ok:false,error:'DATABASE_NOT_CONFIGURED'},{status:503});
 await database.query(`UPDATE remote_actions SET state=$2,updated_at=NOW() WHERE id=$1 AND user_id=$3`,[String(b.actionId),String(b.state||'SUCCESS'),d.user_id]);
 await database.query(`INSERT INTO remote_action_results(action_id,state,result) VALUES($1,$2,$3)`,[String(b.actionId),String(b.state||'SUCCESS'),JSON.stringify(b.result||{})]);
 return NextResponse.json({ok:true});
}