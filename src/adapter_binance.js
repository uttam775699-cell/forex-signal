// ---- Binance: free, no key, live websocket for every pair at once ----
const ADAPTER = (() => {
  const REST = ["https://data-api.binance.vision", "https://api.binance.com"];
  const WSS  = ["wss://data-stream.binance.vision/stream", "wss://stream.binance.com:9443/stream"];
  const FIAT = ["EUR","GBP","AUD","JPY","CHF","CAD","NZD","TRY","BRL","ZAR","PLN","RON","UAH","MXN","ARS","CZK","COP","IDR","NGN","RUB","INR","KZT","SEK","NOK","DKK","HKD","SGD","THB"];
  const CRYPTO = ["BTCUSDT","ETHUSDT","BNBUSDT","SOLUSDT","XRPUSDT","DOGEUSDT"];
  const data = {}, ver = {}, lastMsg = {};
  let list = [], ws = null, wsIdx = 0, clockOff = 0, connected = false, histErr = false, sel = null, backup = false, restBusy = false;

  async function get(path) {
    for (const b of REST) { try { const r = await fetch(b + path); if (r.ok) return await r.json(); } catch (e) {} }
    return null;
  }
  function put(id, k) {
    const m = data[id] || (data[id] = new Map());
    m.set(k.t, k);
    if (m.size > 1300) { const ks = [...m.keys()].sort((a, b) => a - b); for (let i = 0; i < m.size - 1100; i++) m.delete(ks[i]); }
    ver[id] = (ver[id] || 0) + 1;
  }
  async function history(id, limit) {
    const d = await get(`/api/v3/klines?symbol=${id}&interval=1m&limit=${limit}`);
    if (!d) { histErr = true; return; }
    d.forEach(k => put(id, { t:k[0], o:+k[1], h:+k[2], l:+k[3], c:+k[4] }));
  }
  function connect() {
    if (ws) { ws.onclose = null; try { ws.close(); } catch (e) {} }
    const streams = list.map(p => p.id.toLowerCase() + "@kline_1m").join("/");
    ws = new WebSocket(`${WSS[wsIdx % WSS.length]}?streams=${streams}`);
    ws.onopen = () => { connected = true; };
    ws.onmessage = ev => { const k = JSON.parse(ev.data).data.k;
      put(k.s, { t:k.t, o:+k.o, h:+k.h, l:+k.l, c:+k.c }); lastMsg[k.s] = Date.now(); };
    ws.onclose = () => { connected = false; wsIdx++; setTimeout(connect, 2500); };
  }
  return {
    async init() {
      const t0 = Date.now(), st = await get("/api/v3/time"), t1 = Date.now();
      if (st && st.serverTime) clockOff = st.serverTime - (t0 + t1) / 2;
      const all = await get("/api/v3/ticker/price");
      const have = new Set((all || []).map(x => x.symbol));
      if (!all) { ["EURUSDT","GBPUSDT","BTCUSDT"].forEach(s => have.add(s));
        showErr("⚠️ Binance se connect nahi ho paya. Internet check kariye. Kuch deshon/networks me Binance block hota hai – tab VPN ya dusra network try kariye."); }
      for (const f of FIAT) {
        if (have.has(f + "USDT")) list.push({ id:f + "USDT", label:`${f}/USD`, fx:true, group:"Forex (free live)" });
        if (have.has("USDT" + f)) list.push({ id:"USDT" + f, label:`USD/${f}`, fx:true, group:"Forex (free live)" });
      }
      if (have.has("PAXGUSDT")) list.push({ id:"PAXGUSDT", label:"XAU/USD (Gold)", fx:true, group:"Gold" });
      for (const c of CRYPTO) if (have.has(c)) list.push({ id:c, label:c.replace("USDT", "/USD"), fx:false, group:"Crypto 24x7" });
      await Promise.all(list.map(p => history(p.id, 600)));
      connect();
      // backup: if the websocket is silent for the selected pair, pull it over REST every 3 s
      setInterval(async () => {
        if (!sel || restBusy) return;
        backup = !connected || Date.now() - (lastMsg[sel] || 0) > 8000;
        if (!backup) return;
        restBusy = true;
        const d = await get(`/api/v3/klines?symbol=${sel}&interval=1m&limit=3`);
        if (d) { d.forEach(k => put(sel, { t:k[0], o:+k[1], h:+k[2], l:+k[3], c:+k[4] })); lastMsg[sel] = Date.now(); }
        restBusy = false;
      }, 3000);
      // re-sync the clock every 10 minutes
      setInterval(async () => { const t0 = Date.now(), st = await get("/api/v3/time"), t1 = Date.now();
        if (st && st.serverTime) clockOff = st.serverTime - (t0 + t1) / 2; }, 600000);
      return list;
    },
    select(id) { sel = id; history(id, 1000); },
    bars(id) { const m = data[id]; return m ? [...m.values()].sort((a, b) => a.t - b.t) : []; },
    version(id) { return ver[id] || 0; },
    scanIds() { return list.map(p => p.id); },
    now() { return Date.now() + clockOff; },
    fresh(id) { return Date.now() - (lastMsg[id] || 0) < 20000; },
    hint() { return connected ? "Is pair par abhi trade kam ho rahe hain (data dheere aa raha hai) – dusra pair chuniye." : "Binance se live connection nahi bana – reconnect ho raha hai…"; },
    status() {
      const age = sel && lastMsg[sel] ? Math.round((Date.now() - lastMsg[sel]) / 1000) : null;
      if (backup && age !== null && age < 20) return { on:true, text:`Live (backup REST) · ${age}s pehle · clock ${(clockOff/1000).toFixed(1)}s` };
      return { on: connected, text: connected ? `Live · Binance · update ${age ?? "--"}s pehle · ${list.length} pairs · clock ${clockOff >= 0 ? "+" : ""}${(clockOff/1000).toFixed(1)}s` : histErr ? "Binance connect nahi hua" : "Connecting…" };
    },
  };
})();
