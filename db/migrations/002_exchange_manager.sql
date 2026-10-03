CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE IF NOT EXISTS exchanges(
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id TEXT NOT NULL, name TEXT NOT NULL,
 environment TEXT NOT NULL, account_type TEXT NOT NULL,
 encrypted_api_key TEXT NOT NULL, encrypted_api_secret TEXT NOT NULL, encrypted_passphrase TEXT,
 permissions JSONB NOT NULL DEFAULT '{}'::jsonb, connected BOOLEAN NOT NULL DEFAULT FALSE,
 last_sync TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(user_id,name,environment,account_type)
);
CREATE TABLE IF NOT EXISTS orders(
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id TEXT NOT NULL, exchange_id UUID NOT NULL,
 symbol TEXT NOT NULL, side TEXT NOT NULL, type TEXT NOT NULL, quantity NUMERIC, quote_quantity NUMERIC,
 price NUMERIC, client_order_id TEXT NOT NULL, exchange_order_id TEXT, status TEXT NOT NULL DEFAULT 'CREATED',
 raw JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(exchange_id,client_order_id)
);
CREATE TABLE IF NOT EXISTS order_events(id BIGSERIAL PRIMARY KEY,order_id UUID NOT NULL,from_status TEXT,to_status TEXT,event TEXT,raw JSONB NOT NULL DEFAULT '{}'::jsonb,created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS trading_profiles(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),user_id TEXT NOT NULL,name TEXT NOT NULL,max_order_usd NUMERIC NOT NULL DEFAULT 100,max_position_usd NUMERIC NOT NULL DEFAULT 500,max_daily_loss_usd NUMERIC NOT NULL DEFAULT 50,max_trades INTEGER NOT NULL DEFAULT 10,max_leverage NUMERIC NOT NULL DEFAULT 1,allowed_symbols TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],allowed_exchanges TEXT[] NOT NULL DEFAULT ARRAY['binance'],execution_mode TEXT NOT NULL DEFAULT 'PAPER',autonomous_enabled BOOLEAN NOT NULL DEFAULT FALSE);
CREATE TABLE IF NOT EXISTS audit_logs(id BIGSERIAL PRIMARY KEY,user_id TEXT,action TEXT,exchange TEXT,symbol TEXT,order_id TEXT,source TEXT,result TEXT,status TEXT,error TEXT,created_at TIMESTAMPTZ NOT NULL DEFAULT now());