import {db} from './exchange/db';

let ready=false;
export async function ensureStrategyVersionSchema(){
 if(ready)return;
 await db().query(`CREATE TABLE IF NOT EXISTS strategy_versions(id TEXT PRIMARY KEY,parent_version TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),status TEXT NOT NULL,metrics JSONB NOT NULL DEFAULT '{}'::jsonb,forward_metrics JSONB,reason TEXT NOT NULL DEFAULT '');ALTER TABLE strategy_versions ADD COLUMN IF NOT EXISTS forward_metrics JSONB;CREATE INDEX IF NOT EXISTS strategy_versions_status_idx ON strategy_versions(status,created_at DESC);CREATE TABLE IF NOT EXISTS strategy_runtime(id TEXT PRIMARY KEY CHECK(id='active'),version_id TEXT NOT NULL,updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
 ready=true;
}
export async function saveStrategyVersion(v:{id:string;parentVersion:string;status:string;metrics:unknown;forwardMetrics?:unknown;reason:string}){await ensureStrategyVersionSchema();await db().query(`INSERT INTO strategy_versions(id,parent_version,status,metrics,forward_metrics,reason) VALUES($1,$2,$3,$4::jsonb,$5::jsonb,$6) ON CONFLICT(id) DO UPDATE SET status=EXCLUDED.status,metrics=EXCLUDED.metrics,forward_metrics=EXCLUDED.forward_metrics,reason=EXCLUDED.reason`,[v.id,v.parentVersion,v.status,JSON.stringify(v.metrics),JSON.stringify(v.forwardMetrics??null),v.reason]);return true;}
export async function listPersistedStrategyVersions(limit=100){await ensureStrategyVersionSchema();const r=await db().query(`SELECT id,parent_version,created_at,status,metrics,forward_metrics,reason FROM strategy_versions ORDER BY created_at DESC LIMIT $1`,[Math.min(100,Math.max(1,limit))]);return r.rows;}

export async function setActiveStrategyVersion(versionId:string){await ensureStrategyVersionSchema();await db().query("INSERT INTO strategy_runtime(id,version_id) VALUES('active',$1) ON CONFLICT(id) DO UPDATE SET version_id=EXCLUDED.version_id,updated_at=NOW()",[versionId]);return versionId;}
export async function getActiveStrategyVersion(){await ensureStrategyVersionSchema();const r=await db().query("SELECT version_id FROM strategy_runtime WHERE id='active'");return r.rows[0]?.version_id??null;}
