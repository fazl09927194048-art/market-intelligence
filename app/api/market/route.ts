import { NextResponse } from 'next/server';

export const revalidate = 60;

const ids = 'bitcoin,ethereum,solana,binancecoin';

export async function GET() {
  try {
    const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`, { next: { revalidate: 60 } });
    if (!res.ok) throw new Error(`CoinGecko ${res.status}`);
    const data = await res.json();
    const markets = [
      ['BTC', 'Bitcoin', 'bitcoin'],
      ['ETH', 'Ethereum', 'ethereum'],
      ['SOL', 'Solana', 'solana'],
      ['BNB', 'BNB', 'binancecoin'],
    ].map(([symbol, name, id]) => ({ symbol, name, price: data[id]?.usd ?? 0, change: data[id]?.usd_24h_change ?? 0 }));
    return NextResponse.json({ markets, source: 'CoinGecko', updatedAt: new Date().toISOString() }, { headers: { 'Cache-Control': 's-maxage=60, stale-while-revalidate=120' } });
  } catch {
    return NextResponse.json({ markets: [], source: 'unavailable', updatedAt: new Date().toISOString() }, { status: 200 });
  }
}