// ---- Twelve Data via the viewer's claude.ai connector ----
// 1-min history (get_time_series) only contains CLOSED minutes and comes in the
// account's timezone, so: history once a minute for closed bars + real-time
// price (get_price) every few seconds to build the running candle, with the
// timezone offset worked out from the data itself.
const ADAPTER = (() => {
  const SERVER = "Twelve Data";
  const MAJ = ["EUR/USD","GBP/USD","USD/JPY","USD/CHF","AUD/USD","USD/CAD","NZD/USD"];
  const CROSS = ["EUR/GBP","EUR/JPY","EUR/CHF","EUR/AUD","EUR/CAD","EUR/NZD","GBP/JPY","GBP/CHF","GBP/AUD","GBP/CAD","GBP/NZD",
    "AUD/JPY","AUD/CHF","AUD/CAD","AUD/NZD","CAD/JPY","CAD/CHF","CHF/JPY","NZD/JPY","NZD/CHF","NZD/CAD"];
  const EXO = ["USD/INR","USD/TRY","USD/ZAR","USD/MXN","USD/SGD","USD/HKD","USD/SEK","USD/NOK","USD/PLN","USD/CNH","USD/THB","USD/BRL","EUR/TRY","EUR/HUF"];
  const list = [
    ...MAJ.map(s => ({ id:s, label:s, fx:true, group:"Majors" })),
    ...CROSS.map(s => ({ id:s, label:s, fx:true, group:"Crosses" })),
    ...EXO.map(s => ({ id:s, label:s, fx:true, group:"Exotics" })),
    { id:"XAU/USD", label:"XAU/USD", fx:true, group:"Metals" }, { id:"XAG/USD", label:"XAG/USD", fx:true, group:"Metals" },
    { id:"BTC/USD", label:"BTC/USD", fx:false, group:"Crypto" }, { id:"ETH/USD", label:"ETH/USD", fx:false, group:"Crypto" },
  ];
  const data = {}, ver = {}, priceAt = {}, seriesAt = {};
  let mcp = null, running = false, loop = null, sel = null, poll = store.get("t_poll", 10);
  let tzOff = null, stat = { on:false, text:"START dabaiye" }, scanIds = [], scanning = false;
  let inflight = 0, callsMin = [], lastPriceTry = 0, lastSeriesMin = null, forcedFor = null, lagMs = null, stale = false;

  const MIN = 60000;
  function budgetOk() { const t = Date.now(); callsMin = callsMin.filter(x => t - x < MIN); return callsMin.length < 8; }
  async function call(tool, input) {
    callsMin.push(Date.now()); inflight++;
    const t0 = Date.now();
    try { const r = await mcp.callTool(SERVER, tool, input, { cache:false }); lagMs = Date.now() - t0; return r.payload; }
    finally { inflight--; }
  }
  function text(payload) {
    if (payload && typeof payload === "object") return payload.result ?? payload.text ?? JSON.stringify(payload);
    return String(payload);
  }
  function touch(sym) { ver[sym] = (ver[sym] || 0) + 1; }
  function trim(m) { if (m.size > 1300) { const ks = [...m.keys()].sort((a, b) => a - b); for (let i = 0; i < m.size - 1100; i++) m.delete(ks[i]); } }

  async function fetchSeries(sym, size) {
    const txt = text(await call("get_time_series", { symbol:sym, interval:"1min", outputsize:size }));
    if (!txt.includes("datetime")) throw { code:"tool_error", message:txt.slice(0, 200) };
    const lines = txt.trim().split("\n"), head = lines.shift().split(";"), ix = n => head.indexOf(n);
    const rows = lines.map(l => { const c = l.split(";");
      return { t:Date.parse(c[ix("datetime")].replace(" ", "T") + "Z"), o:+c[ix("open")], h:+c[ix("high")], l:+c[ix("low")], c:+c[ix("close")] }; });
    if (!rows.length) return;
    // timezone: newest closed bar should be the previous minute → round the gap to 15 min
    const newest = Math.max(...rows.map(r => r.t)), expect = Math.floor(Date.now() / MIN) * MIN - MIN;
    const gap = expect - newest, q = Math.round(gap / (15*MIN)) * 15*MIN;
    if (Math.abs(gap - q) <= 6*MIN && Math.abs(q) <= 14*3600000) { tzOff = q; stale = false; }
    else if (tzOff === null) { tzOff = q; stale = true; }      // data far behind → market closed / delayed
    else stale = expect - (newest + tzOff) > 6*MIN;
    const m = data[sym] || (data[sym] = new Map());
    rows.forEach(r => { r.t += tzOff; m.set(r.t, r); });
    trim(m); seriesAt[sym] = Date.now(); touch(sym);
  }
  async function fetchPrice(sym) {
    const txt = text(await call("get_price", { symbol:sym }));
    const p = parseFloat(txt.split("\n").pop());
    if (!isFinite(p)) throw { code:"tool_error", message:txt.slice(0, 200) };
    const m = data[sym] || (data[sym] = new Map()), now = Date.now(), t = Math.floor(now / MIN) * MIN;
    let b = m.get(t);
    if (!b) { const prev = m.get(t - MIN); const o = prev ? prev.c : p; b = { t, o, h:Math.max(o, p), l:Math.min(o, p), c:p, live:true }; m.set(t, b); }
    else { if (p > b.h) b.h = p; if (p < b.l) b.l = p; b.c = p; }
    priceAt[sym] = now; touch(sym);
  }
  function fail(e) {
    const c = e && e.code;
    const msg = {
      server_not_connected: "Twelve Data connector juda nahi hai. claude.ai → Settings → Connectors me <b>Twelve Data</b> jodiye, phir page reload kariye.",
      needs_reauth: "Twelve Data ka login expire ho gaya. claude.ai → Settings → Connectors me <b>reconnect</b> kariye.",
      not_in_manifest: "Is page ko Twelve Data ki ijazat nahi mili. Page reload karke <b>Allow</b> dabaiye.",
      approval_required: "Twelve Data ke liye ijazat chahiye — START dobara dabaiye aur <b>Allow</b> kariye.",
      selection_required: "Ek se zyada Twelve Data connector hain — claude.ai ke prompt me ek chuniye.",
      blocked_by_policy: "Aapke account ki policy is connector ko rokti hai.",
      server_unavailable: "Twelve Data abhi jawab nahi de raha. Apne aap phir koshish ho rahi hai.",
      tool_error: "Twelve Data: " + ((e && e.message) || "").slice(0, 160) + "<br>Agar 'credits'/'limit' likha hai to aaj ki free limit (800) khatam — refresh 15–20s kariye ya kal chalaiye.",
    }[c] || ("Data error: " + ((e && (e.message || e.code)) || e));
    showErr("⚠️ " + msg);
    if (["server_not_connected","needs_reauth","not_in_manifest","blocked_by_policy","selection_required","approval_required","not_granted","capability_disabled"].includes(c)) stopRun();
  }
  async function safe(fn) { try { await fn(); showErr(""); return true; } catch (e) { fail(e); return false; } }

  // scheduler – runs every 500 ms
  async function step() {
    if (!running || !sel) return;
    const now = Date.now(), minute = Math.floor(now / MIN) * MIN, sec = (now - minute) / 1000;
    const cs = Math.floor(now / TF) * TF, left = (cs + TF - now) / 1000;
    // 1) closed-minute history: once per minute, a few seconds after the minute closes
    if (lastSeriesMin !== minute && sec >= 4 && budgetOk() && inflight < 2) {
      lastSeriesMin = minute; safe(() => fetchSeries(sel, 6));
      return;
    }
    // 2) forced fresh price just before the 0:30 signal lock
    if (forcedFor !== cs && left <= 34 && left > 31 && budgetOk() && inflight < 2) {
      forcedFor = cs; lastPriceTry = now; safe(() => fetchPrice(sel));
      return;
    }
    // 3) regular live price
    if (now - lastPriceTry >= poll * 1000 && budgetOk() && inflight === 0 && !(left > 31 && left < 40)) {
      lastPriceTry = now; safe(() => fetchPrice(sel));
    }
  }
  async function startRun() {
    if (!mcp) mcp = await claude.use("mcp").catch(() => null);
    if (!mcp) { showErr("⚠️ Yahan connector nahi chal sakta. Yeh page claude.ai (app ya website) par kholiye aur Settings → Connectors me Twelve Data jodiye."); return; }
    running = true; $("tdRun").textContent = "■ STOP"; $("tdRun").className = "stop";
    stat = { on:false, text:`Loading ${sel}…` };
    clearInterval(loop);
    lastSeriesMin = Math.floor(Date.now() / MIN) * MIN;          // the full load below counts as this minute's history
    const ok = await safe(() => fetchSeries(sel, 1000));
    if (ok) await safe(() => fetchPrice(sel));
    lastPriceTry = Date.now();
    if (running) loop = setInterval(step, 500);
  }
  function stopRun() {
    running = false; clearInterval(loop); $("tdRun").textContent = "▶ START"; $("tdRun").className = "go";
    stat = { on:false, text:"Ruka hua – START dabaiye (credits bach rahe hain)" };
  }
  async function scanMajors() {
    if (scanning) return;
    if (!mcp) mcp = await claude.use("mcp").catch(() => null);
    if (!mcp) { showErr("⚠️ Connector yahan available nahi."); return; }
    scanning = true; const b = $("tdScan"); b.disabled = true;
    for (const s of MAJ) {
      if (s === sel && running) { if (!scanIds.includes(s)) scanIds.push(s); continue; }
      while (!budgetOk() || (running && callsMin.length >= 5)) { b.textContent = `Ruko (limit)… ${s}`; await new Promise(r => setTimeout(r, 2000)); }
      b.textContent = `Scanning ${s}…`;
      try { await fetchSeries(s, 400); if (!scanIds.includes(s)) scanIds.push(s); lastScan = 0; }
      catch (e) { if (e && e.code !== "tool_error") { fail(e); break; } }
    }
    b.disabled = false; b.textContent = "🔍 7 majors scan (~7 credits)"; scanning = false;
  }
  const credPerHour = () => Math.round(60 * (1 + 60 / poll + 0.5));
  return {
    async init() {
      $("adapterControls").innerHTML = `<button id="tdRun" class="go">▶ START</button>
        <label class="mut" style="font-size:12px">live price har <select id="tdPoll"><option>5</option><option>10</option><option>15</option><option>20</option></select>s</label>
        <span class="mut" style="font-size:12px" id="tdCred"></span>`;
      $("tdPoll").value = String(poll);
      $("tdCred").textContent = `~${credPerHour()} credits/ghanta`;
      $("tdRun").onclick = () => running ? stopRun() : startRun();
      $("tdPoll").onchange = e => { poll = +e.target.value; store.set("t_poll", poll); $("tdCred").textContent = `~${credPerHour()} credits/ghanta`; };
      $("scanCtl").innerHTML = `<button id="tdScan">🔍 7 majors scan (~7 credits)</button>
        <div class="note">Scan ek baar ka snapshot hai. Free plan me 1 minute me 8 request milti hain, isliye software khud intezaar karke ek-ek karke laata hai.</div>`;
      $("tdScan").onclick = scanMajors;
      return list;
    },
    select(id) { sel = id; forcedFor = null; tzOff = null; if (running) { clearInterval(loop); startRun(); } },
    bars(id) { const m = data[id]; return m ? [...m.values()].sort((a, b) => a.t - b.t) : []; },
    version(id) { return ver[id] || 0; },
    scanIds() { return scanIds; },
    now() { return Date.now(); },
    fresh(id) { return running && id === sel && !stale && Date.now() - (priceAt[id] || 0) < Math.max(20, poll + 12) * 1000; },
    hint() {
      if (!running) return "Upar ▶ START dabaiye.";
      if (stale) return "Twelve Data ka data purana hai – shayad market band hai (weekend/holiday).";
      return "Live price ka intezaar…";
    },
    status() {
      if (!running) return stat;
      const age = priceAt[sel] ? Math.round((Date.now() - priceAt[sel]) / 1000) : null;
      if (stale) return { on:false, text:`${sel}: data purana – market band?` };
      if (age === null) return { on:false, text:`Loading ${sel}…` };
      return { on: age < poll + 12, text:`Live · ${sel} · price ${age}s pehle · connector ${lagMs ? (lagMs/1000).toFixed(1) + "s" : "--"} · ${callsMin.length}/8 per min` };
    },
  };
})();
