const DEFAULT_API = 'https://market-intelligence-840b.onrender.com';
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== 'MARKET_INTEL_ANALYZE') return;
  const base = message.apiBase || DEFAULT_API;
  fetch(`${base}/api/intelligence`, {cache:'no-store'}).then(r=>r.json()).then(data=>sendResponse({ok:true,data})).catch(error=>sendResponse({ok:false,error:String(error)}));
  return true;
});
