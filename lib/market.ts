export type MarketSnapshot = {
  symbol: string; name: string; price: number; change24h: number; volume24h?: number; marketCap?: number;
  source: string; fetchedAt: string; freshnessMs: number;
};

const ASSETS = [
  ['BTC','Bitcoin','bitcoin'], ['ETH','Ethereum','ethereum'], ['SOL','Solana','solana'], ['BNB','BNB','binancecoin'],
] as const;

async function json(url: string, init?: RequestInit) {
  const r = await fetch(url, { ...init, signal: AbortSignal.timeout(7000), cache: 'no-store', headers: { 'accept':'application/json', ...(init?.headers || {}) } });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}

async function coinGecko(): Promise<MarketSnapshot[]> {
  const ids = ASSETS.map(x=>x[2]).join(',');
  const data = await json(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true&include_market_cap=true`);
  const now = Date.now();
  return ASSETS.map(([symbol,name,id])=>({symbol,name,price:Number(data[id]?.usd),change24h:Number(data[id]?.usd_24h_change),volume24h:Number(data[id]?.usd_24h_vol),marketCap:Number(data[id]?.usd_market_cap),source:'CoinGecko',fetchedAt:new Date(now).toISOString(),freshnessMs:0})).filter(x=>Number.isFinite(x.price));
}

async function binance(): Promise<MarketSnapshot[]> {
  const symbols = ASSETS.map(x=>`${x[0]}USDT`);
  const rows = await Promise.all(symbols.map(s=>json(`https://api.binance.com/api/v3/ticker/24hr?symbol=${s}`)));
  const now=Date.now();
  return rows.map((r:any,i)=>({symbol:ASSETS[i][0],name:ASSETS[i][1],price:Number(r.lastPrice),change24h:Number(r.priceChangePercent),volume24h:Number(r.quoteVolume),source:'Binance',fetchedAt:new Date(now).toISOString(),freshnessMs:0})).filter(x=>Number.isFinite(x.price));
}

export async function getMarkets(): Promise<{markets:MarketSnapshot[]; provider:string; warnings:string[]}> {
  const warnings:string[]=[];
  try { const markets=await coinGecko(); if(markets.length) return {markets,provider:'CoinGecko',warnings}; } catch(e){ warnings.push(`CoinGecko unavailable: ${e instanceof Error?e.message:'error'}`); }
  try { const markets=await binance(); if(markets.length) return {markets,provider:'Binance',warnings}; } catch(e){ warnings.push(`Binance unavailable: ${e instanceof Error?e.message:'error'}`); }
  return {markets:[],provider:'unavailable',warnings};
}
