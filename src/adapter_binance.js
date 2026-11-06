// ---- Binance: free, no key, live websocket ----
// • kline_1m for every pair (scanner)            – Binance pushes these every ~2 s
// • aggTrade for the SELECTED pair              – every single trade, instantly
// • delay meter: Binance event time vs synced clock
// • REST backup + reconnect when silent, when the tab comes back, or when the network changes
const ADAPTER = (() => {
  const REST = ["https://data-api.binance.vision", "https://api.binance.com", "https://api1.binance.com", "https://api3.binance.com"];
  const WSS  = ["wss://stream.binance.com:9443/stream", "wss://data-stream.binance.vision/stream", "wss://stream.binance.com:443/stream"];
  const FIAT = ["EUR","GBP","AUD","JPY","CHF","CAD","NZD","TRY","BRL","ZAR","PLN","RON","UAH","MXN","ARS","CZK","COP","IDR","NGN","RUB","INR","KZT","SEK","NOK","DKK","HKD","SGD","THB"];
  const CRYPTO = ["BTCUSDT","ETHUSDT","BNBUSDT","SOLUSDT","XRPUSDT","DOGEUSDT"];
  const MIN = 60000;
  const data = {}, ver = {}, lastMsg = {}, lastTrade = {};
  let list = [], ws = null, wsIdx = store.get("t_wsIdx", 0), clockOff = 0, connected = false, histErr = false;
  let sel = null, tradeSub = null, backup = false, restBusy = false, delays = [], lastAny = 0, msgId = 1, connectAt = 0;

  async function get(path, ms = 4000) {
    for (const b of REST) {
      try { const r = await fetch(b + path, { signal: AbortSignal.timeout ? AbortSignal.timeout(ms) : undefined, cache:"no-store" });
            if (r.ok) return await r.json(); } catch (e) {}
    }
    return null;
  }
  async function syncClock() {
    const t0 = Date.now(), st = await get("/api/v3/time", 3000), t1 = Date.now();
    if (st && st.serverTime && t1 - t0 < 2000) clockOff = st.serverTime - (t0 + t1) / 2;
  }
  const nowS = () => Date.now() + clockOff;
  function bump(id) { ver[id] = (ver[id] || 0) + 1; }
  function trim(m) { if (m.size > 2400) { const ks = [...m.keys()].sort((a, b) => a - b); for (let i = 0; i < m.size - 2200; i++) m.delete(ks[i]); } }
  function putBar(id, k) { const m = data[id] || (data[id] = new Map()); m.set(k.t, k); trim(m); bump(id); }
  function noteDelay(eventTime) { const d = nowS() - eventTime; if (d > -2000 && d < 60000) { delays.push(d); if (delays.length > 30) delays.shift(); } }
  const delayMs = () => delays.length ? delays.slice().sort((a, b) => a - b)[Math.floor(delays.length / 2)] : null;

  async function history(id, limit, endTime) {
    const d = await get(`/api/v3/klines?symbol=${id}&interval=1m&limit=${limit}${endTime ? "&endTime=" + endTime : ""}`, 8000);
    if (!d) { histErr = true; return; }
    d.forEach(k => {
      const cur = data[id] && data[id].get(k[0]);
      // never let an older REST snapshot overwrite a fresher live minute
      if (cur && cur.live && k[0] === Math.floor(nowS() / MIN) * MIN) return;
      putBar(id, { t:k[0], o:+k[1], h:+k[2], l:+k[3], c:+k[4] });
    });
    lastMsg[id] = Math.max(lastMsg[id] || 0, Date.now());
  }
  function onKline(k, E) {
    const id = k.s, t = k.t, m = data[id] || (data[id] = new Map()), cur = m.get(t);
    lastMsg[id] = Date.now(); if (E) noteDelay(E);
    // for the selected pair, trades are fresher than the 2-second kline snapshot
    if (!k.x && cur && cur.live && Date.now() - (lastTrade[id] || 0) < 5000) {
      cur.h = Math.max(cur.h, +k.h); cur.l = Math.min(cur.l, +k.l); bump(id); return;
    }
    putBar(id, { t, o:+k.o, h:+k.h, l:+k.l, c:+k.c });
  }
  function onTrade(a) {
    const id = a.s, p = +a.p, T = a.T || a.E, t = Math.floor(T / MIN) * MIN;
    const m = data[id] || (data[id] = new Map());
    let b = m.get(t);
    if (!b) { const prev = m.get(t - MIN); const o = prev ? prev.c : p; b = { t, o, h:Math.max(o, p), l:Math.min(o, p), c:p, live:true }; m.set(t, b); trim(m); }
    else { if (p > b.h) b.h = p; if (p < b.l) b.l = p; b.c = p; b.live = true; }
    lastTrade[id] = lastMsg[id] = Date.now(); if (a.E) noteDelay(a.E); bump(id);
  }
  function send(o) { try { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); } catch (e) {} }
  function subscribeTrades() {
    if (!connected || !sel) return;
    const want = sel.toLowerCase() + "@aggTrade";
    if (tradeSub === want) return;
    if (tradeSub) send({ method:"UNSUBSCRIBE", params:[tradeSub], id:msgId++ });
    send({ method:"SUBSCRIBE", params:[want], id:msgId++ }); tradeSub = want;
  }
  function connect() {
    if (ws) { ws.onclose = null; ws.onmessage = null; try { ws.close(); } catch (e) {} }
    connected = false; tradeSub = null; connectAt = Date.now();
    const streams = list.map(p => p.id.toLowerCase() + "@kline_1m").join("/");
    const url = `${WSS[wsIdx % WSS.length]}?streams=${streams}`;
    const sock = ws = new WebSocket(url);
    const openTimer = setTimeout(() => { if (sock === ws && !connected) { wsIdx++; connect(); } }, 6000);   // stuck connecting → next server
    sock.onopen = () => { clearTimeout(openTimer); connected = true; store.set("t_wsIdx", wsIdx % WSS.length); lastAny = Date.now(); subscribeTrades(); };
    sock.onmessage = ev => {
      lastAny = Date.now();
      const msg = JSON.parse(ev.data), d = msg.data; if (!d) return;
      if (d.e === "kline") onKline(d.k, d.E);
      else if (d.e === "aggTrade") onTrade(d);
    };
    sock.onclose = () => { clearTimeout(openTimer); if (sock !== ws) return; connected = false; wsIdx++; setTimeout(connect, 1500); };
    sock.onerror = () => {};
  }
  function wake() {      // tab visible again / network back: resync quickly
    if (!list.length) return;
    if (!connected || Date.now() - lastAny > 4000) connect();
    if (sel) history(sel, 5);
    syncClock();
  }
  return {
    async init() {
      await syncClock();
      const all = await get("/api/v3/ticker/price", 8000);
      const have = new Set((all || []).map(x => x.symbol));
      if (!all) { ["EURUSDT","GBPUSDT","BTCUSDT"].forEach(s => have.add(s));
        showErr("⚠️ Binance se connect nahi ho paya. Internet check kariye. Kuch networks par Binance block hota hai – WiFi ↔ mobile data badal kar ya VPN se try kariye."); }
      for (const f of FIAT) {
        if (have.has(f + "USDT")) list.push({ id:f + "USDT", label:`${f}/USD`, fx:true, group:"Forex (free live)" });
        if (have.has("USDT" + f)) list.push({ id:"USDT" + f, label:`USD/${f}`, fx:true, group:"Forex (free live)" });
      }
      if (have.has("PAXGUSDT")) list.push({ id:"PAXGUSDT", label:"XAU/USD (Gold)", fx:true, group:"Gold" });
      for (const c of CRYPTO) if (have.has(c)) list.push({ id:c, label:c.replace("USDT", "/USD"), fx:false, group:"Crypto 24x7" });
      connect();                                                // live first, history fills in behind it
      await Promise.all(list.map(p => history(p.id, 600)));
      // watchdog: silent socket → REST backup every 2 s, and reconnect after 10 s of silence
      setInterval(async () => {
        if (connected && Date.now() - lastAny > 10000 && Date.now() - connectAt > 10000) { wsIdx++; connect(); }
        if (!sel || restBusy) return;
        backup = !connected || Date.now() - (lastMsg[sel] || 0) > 5000;
        if (!backup) return;
        restBusy = true;
        const d = await get(`/api/v3/klines?symbol=${sel}&interval=1m&limit=2`, 2500);
        if (d) { d.forEach(k => putBar(sel, { t:k[0], o:+k[1], h:+k[2], l:+k[3], c:+k[4] })); lastMsg[sel] = Date.now(); }
        restBusy = false;
      }, 2000);
      setInterval(syncClock, 300000);
      document.addEventListener("visibilitychange", () => { if (!document.hidden) wake(); });
      window.addEventListener("online", wake);
      window.addEventListener("focus", wake);
      return list;
    },
    select(id) { sel = id; subscribeTrades();
      history(id, 1000).then(() => { const m = data[id]; if (m && m.size) history(id, 1000, Math.min(...m.keys()) - 1); }); },
    bars(id) { const m = data[id]; return m ? [...m.values()].sort((a, b) => a.t - b.t) : []; },
    version(id) { return ver[id] || 0; },
    scanIds() { return list.map(p => p.id); },
    now: nowS,
    fresh(id) { return Date.now() - (lastMsg[id] || 0) < 15000; },
    hint() { return connected ? "Is pair par abhi trade kam ho rahe hain – EUR/USD ya dusra active pair chuniye." : "Binance se live connection nahi bana – reconnect ho raha hai…"; },
    status() {
      const age = sel && lastMsg[sel] ? (Date.now() - lastMsg[sel]) / 1000 : null, dl = delayMs();
      const dtxt = dl === null ? "" : ` · deri ${(dl / 1000).toFixed(1)}s`;
      if (!connected && backup && age !== null && age < 15) return { on:true, text:`Live (backup) · update ${age.toFixed(0)}s pehle${dtxt}` };
      if (!connected) return { on:false, text: histErr ? "Binance connect nahi hua – network badal kar dekhiye" : "Connecting…" };
      const fast = sel && Date.now() - (lastTrade[sel] || 0) < 5000;
      return { on:true, text:`Live ${fast ? "⚡ har trade" : "· 2s"} · update ${age === null ? "--" : age.toFixed(1) + "s"} pehle${dtxt} · clock ${(clockOff/1000).toFixed(1)}s` };
    },
  };
})();
