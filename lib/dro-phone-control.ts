import { Pool } from 'pg';
import { createHash, randomBytes } from 'crypto';

let pool: Pool | null = null;
let ready = false;
function db(){ if(!process.env.DATABASE_URL) return null; if(!pool) pool=new Pool({connectionString:process.env.DATABASE_URL,max:5,idleTimeoutMillis:30000,connectionTimeoutMillis:5000,ssl:process.env.DATABASE_SSL==='false'?false:{rejectUnauthorized:false}}); return pool; }
async function schema(database:Pool){
 if(ready)return;
 await database.query(`
 CREATE TABLE IF NOT EXISTS devices (
   id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
   device_id TEXT NOT NULL UNIQUE, name TEXT NOT NULL DEFAULT 'Android', platform TEXT NOT NULL DEFAULT 'android',
   public_key TEXT, trusted BOOLEAN NOT NULL DEFAULT FALSE, revoked BOOLEAN NOT NULL DEFAULT FALSE,
   last_seen_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
 );
 CREATE INDEX IF NOT EXISTS devices_user_idx ON devices(user_id);
 CREATE TABLE IF NOT EXISTS device_pairings (
   id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
   code_hash TEXT NOT NULL, expires_at TIMESTAMPTZ NOT NULL, used_at TIMESTAMPTZ,
   created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
 );
 CREATE INDEX IF NOT EXISTS device_pairings_user_idx ON device_pairings(user_id,expires_at);
 CREATE TABLE IF NOT EXISTS device_sessions (
   id UUID PRIMARY KEY DEFAULT gen_random_uuid(), device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
   user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, token_hash TEXT NOT NULL UNIQUE,
   state TEXT NOT NULL DEFAULT 'CONNECTING', mode TEXT NOT NULL DEFAULT 'ASSIST',
   expires_at TIMESTAMPTZ NOT NULL, revoked_at TIMESTAMPTZ, last_seen_at TIMESTAMPTZ,
   created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
 );
 CREATE INDEX IF NOT EXISTS device_sessions_user_idx ON device_sessions(user_id,expires_at);
 CREATE TABLE IF NOT EXISTS device_permissions (
   device_id UUID PRIMARY KEY REFERENCES devices(id) ON DELETE CASCADE,
   overlay BOOLEAN NOT NULL DEFAULT FALSE, notification BOOLEAN NOT NULL DEFAULT FALSE,
   media_projection BOOLEAN NOT NULL DEFAULT FALSE, accessibility BOOLEAN NOT NULL DEFAULT FALSE,
   updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
 );
 CREATE TABLE IF NOT EXISTS dro_phone_sessions (
   id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
   device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
   session_id TEXT NOT NULL UNIQUE, mode TEXT NOT NULL DEFAULT 'ASSIST',
   status TEXT NOT NULL DEFAULT 'CONNECTING', emergency_stopped BOOLEAN NOT NULL DEFAULT FALSE,
   created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), ended_at TIMESTAMPTZ
 );
 CREATE TABLE IF NOT EXISTS dro_action_plans (
   id UUID PRIMARY KEY DEFAULT gen_random_uuid(), phone_session_id UUID REFERENCES dro_phone_sessions(id) ON DELETE SET NULL,
   user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, command TEXT NOT NULL,
   plan JSONB NOT NULL DEFAULT '{}'::jsonb, state TEXT NOT NULL DEFAULT 'REQUESTED',
   created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), completed_at TIMESTAMPTZ
 );
 CREATE TABLE IF NOT EXISTS remote_actions (
   id UUID PRIMARY KEY DEFAULT gen_random_uuid(), phone_session_id UUID REFERENCES dro_phone_sessions(id) ON DELETE SET NULL,
   user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, action_type TEXT NOT NULL,
   payload JSONB NOT NULL DEFAULT '{}'::jsonb, state TEXT NOT NULL DEFAULT 'REQUESTED',
   idempotency_key TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
 );
 CREATE UNIQUE INDEX IF NOT EXISTS remote_actions_idempotency_idx ON remote_actions(user_id,idempotency_key) WHERE idempotency_key IS NOT NULL;
 CREATE TABLE IF NOT EXISTS remote_action_results (
   id UUID PRIMARY KEY DEFAULT gen_random_uuid(), action_id UUID NOT NULL REFERENCES remote_actions(id) ON DELETE CASCADE,
   state TEXT NOT NULL, result JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
 );
 CREATE TABLE IF NOT EXISTS remote_control_audit_logs (
   id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
   device_id UUID REFERENCES devices(id) ON DELETE SET NULL, session_id UUID REFERENCES dro_phone_sessions(id) ON DELETE SET NULL,
   event TEXT NOT NULL, metadata JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
 );
 `);
 ready=true;
}
const hash=(v:string)=>createHash('sha256').update(v).digest('hex');
const code=()=>randomBytes(4).toString('hex').toUpperCase().slice(0,6);
export async function createPairing(userId:string){
 const d=db(); if(!d) throw new Error('Database is not configured'); await schema(d);
 const plain=code(); await d.query(`DELETE FROM device_pairings WHERE user_id=$1 AND used_at IS NULL`,[userId]);
 await d.query(`INSERT INTO device_pairings(user_id,code_hash,expires_at) VALUES($1,$2,NOW()+INTERVAL '10 minutes')`,[userId,hash(plain)]);
 return {code:plain,expiresIn:600};
}
export async function pairDevice(input:{code:string;deviceId:string;name?:string;platform?:string;publicKey?:string}){
 const d=db(); if(!d) throw new Error('Database is not configured'); await schema(d);
 const q=await d.query(`SELECT id,user_id FROM device_pairings WHERE code_hash=$1 AND used_at IS NULL AND expires_at>NOW() ORDER BY created_at DESC LIMIT 1`,[hash(input.code.trim().toUpperCase())]);
 const row=q.rows[0]; if(!row) throw new Error('PAIRING_CODE_INVALID_OR_EXPIRED');
 const deviceId=input.deviceId.slice(0,120);
 const existing=await d.query(`SELECT id,user_id FROM devices WHERE device_id=$1 LIMIT 1`,[deviceId]);
 let device=existing.rows[0];
 if(device && String(device.user_id)!==String(row.user_id)) throw new Error('DEVICE_ALREADY_TRUSTED_BY_ANOTHER_USER');
 if(!device){
   const ins=await d.query(`INSERT INTO devices(user_id,device_id,name,platform,public_key,trusted) VALUES($1,$2,$3,$4,$5,TRUE) RETURNING id`,[row.user_id,deviceId,(input.name||'Android').slice(0,80),(input.platform||'android').slice(0,30),input.publicKey||null]);
   device=ins.rows[0];
 } else {
   await d.query(`UPDATE devices SET public_key=$2,trusted=TRUE,revoked=FALSE,last_seen_at=NOW() WHERE id=$1`,[device.id,input.publicKey||null]);
 }
 await d.query(`INSERT INTO device_permissions(device_id) VALUES($1) ON CONFLICT(device_id) DO NOTHING`,[device.id]);
 await d.query(`UPDATE device_pairings SET used_at=NOW() WHERE id=$1`,[row.id]);
 const token=randomBytes(32).toString('base64url');
 await d.query(`INSERT INTO device_sessions(device_id,user_id,token_hash,expires_at,last_seen_at) VALUES($1,$2,$3,NOW()+INTERVAL '30 days',NOW())`,[device.id,row.user_id,hash(token)]);
 await d.query(`INSERT INTO remote_control_audit_logs(user_id,device_id,event,metadata) VALUES($1,$2,'DEVICE_PAIRED',$3)`,[row.user_id,device.id,JSON.stringify({platform:input.platform||'android'})]);
 return {token,deviceId,deviceDbId:String(device.id),userId:String(row.user_id)};
}
export async function getDeviceToken(token:string){
 const d=db(); if(!d||!token)return null; await schema(d);
 const q=await d.query(`SELECT s.id session_id,s.user_id,s.device_id,d.device_id device_public_id,d.revoked,d.trusted FROM device_sessions s JOIN devices d ON d.id=s.device_id WHERE s.token_hash=$1 AND s.expires_at>NOW() AND s.revoked_at IS NULL LIMIT 1`,[hash(token)]);
 const r=q.rows[0]; if(!r||r.revoked||!r.trusted)return null;
 await d.query(`UPDATE device_sessions SET last_seen_at=NOW() WHERE id=$1`,[r.session_id]);
 await d.query(`UPDATE devices SET last_seen_at=NOW() WHERE id=$1`,[r.device_id]);
 return r;
}
export async function getPhoneOverview(userId:string){
 const d=db(); if(!d) return {configured:false,device:null,session:null,pairing:null};
 await schema(d);
 const q=await d.query(`SELECT id,device_id,name,platform,trusted,revoked,last_seen_at,created_at FROM devices WHERE user_id=$1 ORDER BY created_at DESC LIMIT 1`,[userId]);
 const device=q.rows[0]||null;
 const s=device?await d.query(`SELECT id,session_id,mode,status,emergency_stopped,created_at FROM dro_phone_sessions WHERE user_id=$1 AND device_id=$2 AND ended_at IS NULL ORDER BY created_at DESC LIMIT 1`,[userId,device.id]):{rows:[]};
 return {configured:Boolean(device),device:device?{...device,id:String(device.id),lastSeenAt:device.last_seen_at?.toISOString()||null}:null,session:s.rows[0]||null};
}
export async function createPhoneSession(userId:string,mode:string='ASSIST'){
 const d=db(); if(!d) throw new Error('Database is not configured'); await schema(d);
 const dev=(await d.query(`SELECT id FROM devices WHERE user_id=$1 AND trusted=TRUE AND revoked=FALSE ORDER BY created_at DESC LIMIT 1`,[userId])).rows[0];
 if(!dev) throw new Error('NO_TRUSTED_DEVICE');
 await d.query(`UPDATE dro_phone_sessions SET status='STOPPED',ended_at=NOW() WHERE user_id=$1 AND device_id=$2 AND ended_at IS NULL AND emergency_stopped=FALSE`,[userId,dev.id]);
 const sid=randomBytes(18).toString('base64url');
 const r=await d.query(`INSERT INTO dro_phone_sessions(user_id,device_id,session_id,mode,status) VALUES($1,$2,$3,$4,'CONNECTING') RETURNING id,session_id,mode,status`,[userId,dev.id,sid,mode]);
 await d.query(`INSERT INTO remote_control_audit_logs(user_id,device_id,session_id,event,metadata) VALUES($1,$2,$3,'PHONE_SESSION_CREATED',$4)`,[userId,dev.id,r.rows[0].id,JSON.stringify({mode})]);
 return {...r.rows[0],deviceId:String(dev.id)};
}
export async function createAction(userId:string,sessionId:string,actionType:string,payload:any,idempotencyKey?:string){
 const d=db(); if(!d) throw new Error('Database is not configured'); await schema(d);
 const session=await d.query(`SELECT id FROM dro_phone_sessions WHERE session_id=$1 AND user_id=$2 AND ended_at IS NULL AND emergency_stopped=FALSE LIMIT 1`,[sessionId,userId]);
 if(!session.rows[0]) throw new Error('PHONE_SESSION_NOT_ACTIVE');
 const q=await d.query(`INSERT INTO remote_actions(user_id,phone_session_id,action_type,payload,idempotency_key) VALUES($1,$2,$3,$4,$5) ON CONFLICT(user_id,idempotency_key) WHERE idempotency_key IS NOT NULL DO UPDATE SET updated_at=NOW() RETURNING id,action_type,state,created_at`,[userId,session.rows[0].id,actionType,JSON.stringify(payload||{}),idempotencyKey||null]);
 await d.query(`INSERT INTO remote_control_audit_logs(user_id,session_id,event,metadata) VALUES($1,(SELECT id FROM dro_phone_sessions WHERE session_id=$2),'REMOTE_ACTION_REQUESTED',$3)`,[userId,sessionId,JSON.stringify({actionType})]);
 return q.rows[0];
}
export async function emergencyStop(userId:string){
 const d=db(); if(!d) throw new Error('Database is not configured'); await schema(d);
 await d.query(`UPDATE dro_phone_sessions SET emergency_stopped=TRUE,status='STOPPED',ended_at=NOW() WHERE user_id=$1 AND ended_at IS NULL`,[userId]);
 await d.query(`UPDATE remote_actions SET state='CANCELLED',updated_at=NOW() WHERE user_id=$1 AND state IN ('REQUESTED','EXECUTING','VERIFYING') AND phone_session_id IN (SELECT id FROM dro_phone_sessions WHERE user_id=$1 AND emergency_stopped=TRUE)`,[userId]);
 await d.query(`INSERT INTO remote_control_audit_logs(user_id,event,metadata) VALUES($1,'EMERGENCY_STOP',$2)`,[userId,JSON.stringify({source:'web'})]);
 return {stopped:true};
}

export async function updatePhoneSessionFromDevice(token:string,state:string,metrics:{battery:number|null;fps:number|null;latencyMs:number|null;accessibility:boolean;mediaProjection:boolean}){
 const d=db(); if(!d) throw new Error('Database is not configured'); await schema(d);
 const dev=await getDeviceToken(token); if(!dev) throw new Error('DEVICE_UNAUTHORIZED');
 const s=await d.query(`SELECT id,session_id FROM dro_phone_sessions WHERE device_id=$1 AND ended_at IS NULL AND emergency_stopped=FALSE ORDER BY created_at DESC LIMIT 1`,[dev.device_id]);
 if(!s.rows[0]) return {session:null};
 const status=['CONNECTED','CONNECTING','DISCONNECTED','STOPPED'].includes(state)?state:'CONNECTED';
 if(status==='STOPPED'){
   await d.query(`UPDATE dro_phone_sessions SET status='STOPPED',ended_at=NOW() WHERE id=$1`,[s.rows[0].id]);
 } else {
   await d.query(`UPDATE dro_phone_sessions SET status=$2 WHERE id=$1`,[s.rows[0].id,status]);
 }
 await d.query(`INSERT INTO remote_control_audit_logs(user_id,device_id,session_id,event,metadata) VALUES($1,$2,$3,'DEVICE_HEARTBEAT',$4)`,[dev.user_id,dev.device_id,s.rows[0].id,JSON.stringify(metrics)]);
 return {session:s.rows[0].session_id,status};
}
