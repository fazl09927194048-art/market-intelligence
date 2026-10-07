import {NextRequest,NextResponse} from 'next/server';
import {getDeviceToken} from '@/lib/dro-phone-control';
import {Pool} from 'pg';
let pool:Pool|null=null;
function db(){if(!process.env.DATABASE_URL)return null;if(!pool)pool=new Pool({connectionString:process.env.DATABASE_URL,max:5,ssl:process.env.DATABASE_SSL==='false'?false:{rejectUnauthorized:false}});return pool}
function token(req:NextRequest){return(req.headers.get('authorization')||'').replace(/^Bearer\\s+/,'')}
export async function GET(req:NextRequest){
 const d=await getDeviceToken(token(req)); if(!d)return NextResponse.json({ok:false,error:'DEVICE_UNAUTHORIZED'},{status:401});
 const database=db(); if(!database)return NextResponse.json({ok:false,error:'DATABASE_NOT_CONFIGURED'},{status:503});
 const q=await database.query(`SELECT id,action_type,payload,state,created_at FROM remote_actions WHERE user_id=$1 AND state='REQUESTED' AND phone_session_id IN (SELECT id FROM dro_phone_sessions WHERE device_id=$2 AND ended_at IS NULL AND emergency_stopped=FALSE) ORDER BY created_at ASC LIMIT 20`,[d.user_id,d.device_id]);
 if(q.rows.length)await database.query(`UPDATE remote_actions SET state='EXECUTING',updated_at=NOW() WHERE id=ANY($1::uuid[])`,[q.rows.map((x:any)=>x.id)]);
 return NextResponse.json({ok:true,actions:q.rows});
}
export async function POST(req:NextRequest){
 const d=await getDeviceToken(token(req)); if(!d)return NextResponse.json({ok:false,error:'DEVICE_UNAUTHORIZED'},{status:401});
 const b=await req.json().catch(()=>({}));if(!b?.actionId)return NextResponse.json({ok:false,error:'ACTION_ID_REQUIRED'},{status:400});
 const database=db();if(!database)return NextResponse.json({ok:false,error:'DATABASE_NOT_CONFIGURED'},{status:503});
 const state=String(b.state||'SUCCESS').toUpperCase();const allowed=['VERIFYING','SUCCESS','FAILED','TIMEOUT'];if(!allowed.includes(state))return NextResponse.json({ok:false,error:'INVALID_ACTION_STATE'},{status:400});
 const q=await database.query(`UPDATE remote_actions SET state=$2,updated_at=NOW() WHERE id=$1 AND user_id=$3 AND phone_session_id IN (SELECT id FROM dro_phone_sessions WHERE device_id=$4) RETURNING id`,[String(b.actionId),state,d.user_id,d.device_id]);
 if(!q.rowCount)return NextResponse.json({ok:false,error:'ACTION_NOT_FOUND'},{status:404});
 await database.query(`INSERT INTO remote_action_results(action_id,state,result) VALUES($1,$2,$3)`,[String(b.actionId),state,JSON.stringify(b.result||{})]);
 return NextResponse.json({ok:true});
}