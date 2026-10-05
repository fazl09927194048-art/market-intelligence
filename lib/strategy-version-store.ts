import {db} from './exchange/db';

let ready=false;
export async function ensureStrategyVersionSchema(){
 if(ready)return;
 await db().query(`CREATE TABLE IF NOT EXISTS strategy_versions(id TEXT PRIMARY KEY,parent_version TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),status TEXT NOT NULL,metrics JSONB NOT NULL DEFAULT '{}'::jsonb,reason TEXT NOT NULL DEFAULT '');CREATE INDEX IF NOT EXISTS strategy_versions_status_idx ON strategy_versions(status,created_at DESC)`);
 ready=true;
}
export async function saveStrategyVersion(v:{id:string;parentVersion:string;status:string;metrics:unknown;reason:string}){await ensureStrategyVersionSchema();await db().query(`INSERT INTO strategy_versions(id,parent_version,status,metrics,reason) VALUES($1,$2,$3,$4::jsonb,$5) ON CONFLICT(id) DO UPDATE SET status=EXCLUDED.status,metrics=EXCLUDED.metrics,reason=EXCLUDED.reason`,[v.id,v.parentVersion,v.status,JSON.stringify(v.metrics),v.reason]);return true;}
export async function listPersistedStrategyVersions(limit=100){await ensureStrategyVersionSchema();const r=await db().query(`SELECT id,parent_version,created_at,status,metrics,reason FROM strategy_versions ORDER BY created_at DESC LIMIT $1`,[Math.min(100,Math.max(1,limit))]);return r.rows;}
