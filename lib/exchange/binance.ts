import crypto from 'node:crypto';
import type { ExchangeAdapter, ExchangeCredentials, ExchangePermissions } from './types';

type Method = 'GET' | 'POST' | 'DELETE';
const base = (c: ExchangeCredentials) => {
  if (c.accountType === 'FUTURES') {
    return c.environment === 'TESTNET' ? 'https://testnet.binancefuture.com' : 'https://fapi.binance.com';
  }
  return c.environment === 'TESTNET' ? 'https://testnet.binance.vision' : 'https://api.binance.com';
};
const endpoint = (c: ExchangeCredentials, spot: string, futures: string) => c.accountType === 'FUTURES' ? futures : spot;
function qs(p: Record<string, unknown>) {
  return Object.entries(p).filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(String(v))).join('&');
}
async function request(c: ExchangeCredentials, path: string, method: Method, params: Record<string, unknown> = {}, signed = false) {
  const p = { ...params } as Record<string, unknown>;
  if (c.accountType === 'FUTURES' && method === 'POST') {
    if (p.newOrderRespType === 'FULL') p.newOrderRespType = 'RESULT';
    // USD-M futures uses STOP / TAKE_PROFIT market triggers rather than Spot's limit variants.
    if (p.type === 'STOP_LOSS_LIMIT') { p.type = 'STOP'; delete p.timeInForce; delete p.price; }
    if (p.type === 'TAKE_PROFIT_LIMIT') { p.type = 'TAKE_PROFIT'; delete p.timeInForce; delete p.price; }
  }
  if (signed) { p.timestamp = Date.now(); p.recvWindow = 5000; }
  const unsignedQuery = qs(p);
  const query = signed ? unsignedQuery + '&signature=' + crypto.createHmac('sha256', c.apiSecret).update(unsignedQuery).digest('hex') : unsignedQuery;
  const res = await fetch(base(c) + path + (query ? '?' + query : ''), {
    method, headers: { 'X-MBX-APIKEY': c.apiKey, 'Content-Type': 'application/x-www-form-urlencoded' },
    cache: 'no-store', signal: AbortSignal.timeout(10000)
  });
  const body = await res.text();
  let data: any; try { data = JSON.parse(body); } catch { data = { raw: body }; }
  if (!res.ok) throw new Error(typeof data?.msg === 'string' ? 'BINANCE_' + String(data.code || res.status) + ': ' + data.msg : 'BINANCE_' + res.status);
  return data;
}
const adapter: ExchangeAdapter = {
  name: 'binance',
  async connect(c) { const result = await this.testConnection(c); if (!result.ok) throw new Error(result.message); },
  async testConnection(c) {
    try {
      const a = await request(c, endpoint(c, '/api/v3/account', '/fapi/v2/account'), 'GET', {}, true);
      const permissions: ExchangePermissions = {
        marketData: true, accountRead: true, trading: c.accountType === 'FUTURES' ? true : Boolean(a?.canTrade),
        withdrawals: c.accountType === 'FUTURES' ? false : Boolean(a?.canWithdraw),
        raw: { canTrade: a?.canTrade, canWithdraw: a?.canWithdraw, accountType: c.accountType }
      };
      return { ok: true, message: 'Connected to Binance ' + c.accountType + '.', permissions };
    } catch (e) { return { ok: false, message: e instanceof Error ? e.message : 'Connection failed' }; }
  },
  async getAccount(c) { return request(c, endpoint(c, '/api/v3/account', '/fapi/v2/account'), 'GET', {}, true); },
  async getBalance(c) {
    if (c.accountType === 'FUTURES') {
      const a = await request(c, '/fapi/v2/balance', 'GET', {}, true);
      return (Array.isArray(a) ? a : []).filter((x: any) => Number(x.availableBalance ?? x.balance) > 0);
    }
    const a = await this.getAccount(c);
    return (a.balances || []).filter((x: any) => Number(x.free) > 0 || Number(x.locked) > 0);
  },
  async getMarkets(c) { return request(c, endpoint(c, '/api/v3/exchangeInfo', '/fapi/v1/exchangeInfo'), 'GET'); },
  async getTicker(c, s) { return request(c, endpoint(c, '/api/v3/ticker/24hr', '/fapi/v1/ticker/24hr'), 'GET', { symbol: s.toUpperCase() }); },
  async getOrderBook(c, s, l = 100) { return request(c, endpoint(c, '/api/v3/depth', '/fapi/v1/depth'), 'GET', { symbol: s.toUpperCase(), limit: l }); },
  async getOpenOrders(c, s) { return request(c, endpoint(c, '/api/v3/openOrders', '/fapi/v1/openOrders'), 'GET', { symbol: s?.toUpperCase() }, true); },
  async getOrderHistory(c, s, l = 50) { return request(c, endpoint(c, '/api/v3/allOrders', '/fapi/v1/allOrders'), 'GET', { symbol: s.toUpperCase(), limit: l }, true); },
  async getPositions(c) {
    if (c.accountType === 'FUTURES') return { accountType: c.accountType, positions: await request(c, '/fapi/v2/positionRisk', 'GET', {}, true) };
    return { accountType: c.accountType, positions: [], note: 'Spot positions are represented by asset balances.' };
  },
  async createOrder(c, p) {
    if (c.accountType === 'FUTURES') {
      const payload = { ...p };
      // Spot quoteOrderQty is not a Futures order parameter.
      if (payload.quoteOrderQty !== undefined) throw new Error('quoteOrderQty is Spot-only; Futures requires an explicit quantity.');
      return request(c, '/fapi/v1/order', 'POST', payload, true);
    }
    return request(c, '/api/v3/order', 'POST', p, true);
  },
  async cancelOrder(c, s, o, cid) { return request(c, endpoint(c, '/api/v3/order', '/fapi/v1/order'), 'DELETE', { symbol: s.toUpperCase(), orderId: o, origClientOrderId: cid }, true); },
  async getOrderStatus(c, s, o, cid) { return request(c, endpoint(c, '/api/v3/order', '/fapi/v1/order'), 'GET', { symbol: s.toUpperCase(), orderId: o, origClientOrderId: cid }, true); }
};
export default adapter;
