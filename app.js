// ─── CONFIG ──────────────────────────────────────────────
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxTPblW_RCgHALEkuvNUW6e659vpHRIBxrDTmLekf-EC_GIBeuOlb6eIrbv925b1AonYQ/exec';

// ─── COSTANTI COLORI ─────────────────────────────────────
const AC_COLOR = { ETF:'#3b82f6', Azioni:'#8b5cf6', Crypto:'#f59e0b', Cash:'#10b981', Fondi:'#06b6d4' };
const AC_BG    = { ETF:'#1e3a5f', Azioni:'#2d1b69', Crypto:'#451a03', Cash:'#064e3b', Fondi:'#164e63' };

// ─── STATE ───────────────────────────────────────────────
let DATA = null;
let CURRENT_TAB = 'overview';
let FORM_TIPO = 'BUY';

// ─── INIT ────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  document.getElementById('f-date').value = new Date().toISOString().split('T')[0];
  ['f-qty','f-price','f-comm'].forEach(id => {
    document.getElementById(id).addEventListener('input', updateFormSummary);
  });
  loadData();
});

// ─── LOAD DATA ───────────────────────────────────────────
async function loadData() {
  show('loading'); hide('page-content');
  document.getElementById('loading-text').textContent = 'Caricamento dati...';
  document.getElementById('live-badge').textContent = '...';
  try {
    const res = await fetch(`${SCRIPT_URL}?action=getData`, { mode: 'cors' });
    const d = await res.json();
    if (d.error) throw new Error(d.error);
    DATA = d;
    document.getElementById('update-time').textContent = d.lastUpdate || '--';
    document.getElementById('live-badge').textContent = 'LIVE';
    hide('loading'); show('page-content');
    renderTab(CURRENT_TAB);
  } catch(e) {
    document.getElementById('loading').innerHTML = `
      <div style="padding:20px;width:100%;max-width:360px">
        <div style="font-size:12px;color:var(--text3);margin-bottom:8px">Errore connessione</div>
        <div class="error-banner">${e.message}</div>
        <button class="btn-retry" onclick="loadData()">Riprova</button>
      </div>`;
    document.getElementById('live-badge').textContent = 'ERR';
  }
}

// ─── TAB NAVIGATION ──────────────────────────────────────
function setTab(tab) {
  CURRENT_TAB = tab;
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  document.getElementById('tab-' + tab).classList.add('active');
  document.getElementById('content').scrollTop = 0;
  if (DATA) renderTab(tab);
}

function renderTab(tab) {
  const el = document.getElementById('page-content');
  const map = { overview, performance, posizioni, mandate, transactions, simulatore };
  el.innerHTML = (map[tab] || (() => '<div class="empty">In costruzione</div>'))();
  if (tab === 'simulatore') updateSim();
}

// ─── FORMATTERS ──────────────────────────────────────────
function eur(n, dec=0) {
  if (typeof n !== 'number' || isNaN(n)) return '—';
  return new Intl.NumberFormat('it-IT', { style:'currency', currency:'EUR', maximumFractionDigits:dec }).format(n);
}
function rawPct(n) { return typeof n !== 'number' ? 0 : n * 100; }
function show(id) { document.getElementById(id).style.display = ''; }
function hide(id) { document.getElementById(id).style.display = 'none'; }
function col(v) { return (typeof v === 'number' && v >= 0) ? 'var(--green)' : 'var(--red)'; }

// ═══════════════════════════════════════════════════════════
// OVERVIEW
// ═══════════════════════════════════════════════════════════
function overview() {
  const o = DATA.overview || {};
  const pnlPct = rawPct(o.pnlPct).toFixed(2);
  const pnlC = col(o.pnlEur);
  return `
  <div class="grid2">
    <div class="card card-sm">
      <div class="card-glow" style="background:radial-gradient(circle,rgba(59,130,246,0.3),transparent)"></div>
      <span class="kpi-icon">◈</span>
      <div class="card-label">Patrimonio Totale</div>
      <div class="card-value" style="font-size:19px">${eur(o.navTotale)}</div>
      <div class="card-sub">Gestito + Pensioni</div>
    </div>
    <div class="card card-sm">
      <div class="card-glow" style="background:radial-gradient(circle,rgba(16,185,129,0.3),transparent)"></div>
      <span class="kpi-icon">◆</span>
      <div class="card-label">Portafoglio Gestito</div>
      <div class="card-value" style="font-size:19px">${eur(o.navGestito)}</div>
      <div class="card-sub" style="color:${pnlC}">${(o.pnlEur||0)>=0?'+':''}${eur(o.pnlEur)} (${(o.pnlEur||0)>=0?'+':''}${pnlPct}%)</div>
    </div>
  </div>
  <div class="grid2">
    <div class="card card-sm">
      <div class="card-glow" style="background:radial-gradient(circle,rgba(139,92,246,0.3),transparent)"></div>
      <span class="kpi-icon">◉</span>
      <div class="card-label">Patrimonio Stabile</div>
      <div class="card-value" style="font-size:19px">${eur(o.navStabile)}</div>
      <div class="card-sub">Fondi pensione</div>
    </div>
    <div class="card card-sm">
      <div class="card-glow" style="background:radial-gradient(circle,rgba(245,158,11,0.3),transparent)"></div>
      <span class="kpi-icon">◎</span>
      <div class="card-label">Liquidità</div>
      <div class="card-value" style="font-size:19px">${eur(o.cashTotale)}</div>
      <div class="card-sub">Fineco ${eur(o.cashFineco)} · Kraken ${eur(o.cashKraken)}</div>
    </div>
  </div>
  <div class="pnl-summary">
    <div>
      <div style="font-size:10px;color:var(--text3);font-weight:600;letter-spacing:0.5px">P&L GESTITO</div>
      <div style="font-size:22px;font-weight:700;font-family:var(--mono);color:${pnlC};letter-spacing:-0.5px">${(o.pnlEur||0)>=0?'+':''}${eur(o.pnlEur)}</div>
    </div>
    <div style="text-align:right">
      <div style="font-size:30px;font-weight:700;font-family:var(--mono);color:${pnlC};letter-spacing:-1px">${(o.pnlEur||0)>=0?'+':''}${pnlPct}%</div>
      <div style="font-size:10px;color:var(--text3)">${o.nPos||0} posizioni</div>
    </div>
  </div>
  ${_miniPosizioni()}
  ${_miniMandate()}`;
}

function _miniPosizioni() {
  const pos = (DATA.posizioni||[]).slice(0,4);
  if (!pos.length) return '';
  const rows = pos.map(p => {
    const c = AC_COLOR[p.ac]||'#94a3b8', bg = AC_BG[p.ac]||'#1e293b';
    const pp = rawPct(p.pnlPct).toFixed(2);
    const pc = parseFloat(pp)>=0?'var(--green)':'var(--red)';
    return `<div class="pos-item">
      <div class="pos-avatar" style="background:${bg};color:${c}">${p.ticker.split('.')[0].slice(0,3)}</div>
      <div class="pos-info"><div class="pos-ticker">${p.ticker}</div><div class="pos-name">${p.nome}</div></div>
      <div class="pos-right"><div class="pos-mv">${eur(p.mv)}</div><div class="pos-pnl" style="color:${pc}">${parseFloat(pp)>=0?'+':''}${pp}%</div></div>
    </div>`;
  }).join('');
  return `<div class="card"><div class="section-title">◆ Top Posizioni</div>${rows}
    <div style="text-align:center;margin-top:10px">
      <button onclick="setTab('posizioni')" style="background:none;border:none;color:var(--blue);font-size:12px;cursor:pointer;font-weight:600">Vedi tutte →</button>
    </div>
  </div>`;
}

function _miniMandate() {
  const m = (DATA.mandate||[]).slice(0,4);
  if (!m.length) return '';
  const rows = m.map(row => {
    const cur = typeof row.current==='number'?(row.current*100).toFixed(1):'—';
    const tgt = typeof row.target==='number'?(row.target*100).toFixed(0):'—';
    const bw = typeof row.current==='number'?Math.min(row.current*100,100):0;
    const sc = row.status==='OK'?'var(--green)':row.status&&row.status.includes('SOTTO')?'var(--red)':'var(--amber)';
    const fc = AC_COLOR[row.label]||'var(--blue)';
    return `<div style="margin-bottom:10px">
      <div style="display:flex;justify-content:space-between;margin-bottom:4px;font-size:11px">
        <span style="font-weight:600">${row.label}</span>
        <span style="color:${sc};font-weight:700">${cur}%<span style="color:var(--text3);font-weight:400"> / ${tgt}%</span></span>
      </div>
      <div class="bar-track"><div class="bar-fill" style="width:${bw.toFixed(1)}%;background:${fc}"></div><div class="bar-target" style="left:${parseFloat(tgt)}%"></div></div>
    </div>`;
  }).join('');
  return `<div class="card"><div class="section-title">⊞ Allocazione</div>${rows}</div>`;
}

// ═══════════════════════════════════════════════════════════
// PERFORMANCE
// ═══════════════════════════════════════════════════════════
function performance() {
  const perf = DATA.performance||[];
  if (!perf.length) return '<div class="empty">Nessun dato performance.<br>Il sistema registra ogni giorno alle 18:00.</div>';
  const last = perf[perf.length-1];
  const twr = last.twr*100;
  const msci = last.msci!==null?last.msci*100:null;
  const sp = last.sp!==null?last.sp*100:null;
  const tc = twr>=0?'var(--green)':'var(--red)';
  const chart = _buildChart(perf);
  const labels = perf.filter((_,i)=>i%Math.max(1,Math.floor(perf.length/5))===0).map(p=>`<span class="chart-label">${p.data}</span>`).join('');
  const benchRows = [{label:'TWR Cumulato',val:twr,color:tc},
    msci!==null?{label:'MSCI World',val:msci,color:'var(--blue)'}:null,
    sp!==null?{label:'S&P 500',val:sp,color:'var(--violet)'}:null,
    msci!==null?{label:'Active vs MSCI',val:twr-msci,color:twr-msci>=0?'var(--green)':'var(--red)'}:null,
  ].filter(Boolean).map(r=>`<div class="bench-row"><span style="font-size:12px;color:var(--text2)">${r.label}</span><span style="font-size:14px;font-weight:700;font-family:var(--mono);color:${r.color}">${r.val>=0?'+':''}${r.val.toFixed(2)}%</span></div>`).join('');
  const hist = [...perf].reverse().slice(0,10).map(p=>{
    const t=(p.twr*100).toFixed(2),c=parseFloat(t)>=0?'var(--green)':'var(--red)';
    return `<div class="bench-row"><span style="font-size:11px;color:var(--text3)">${p.data}</span><span style="font-family:var(--mono);font-size:12px;font-weight:600;color:${c}">${parseFloat(t)>=0?'+':''}${t}%</span></div>`;
  }).join('');
  return `<div class="card">
    <div class="perf-hero"><div class="perf-twr" style="color:${tc}">${twr>=0?'+':''}${twr.toFixed(2)}%</div><div class="perf-sub">TWR · ${perf.length} giorni · dal 21/04/2026</div></div>
    <div class="chart-wrap">${chart}</div><div class="chart-labels">${labels}</div>
  </div>
  <div class="card">${benchRows}</div>
  <div class="card"><div class="section-title">Storico</div>${hist}</div>`;
}

function _buildChart(perf) {
  const W=320,H=110,PAD=8;
  const tv=perf.map(p=>p.twr*100),mv=perf.map(p=>p.msci!==null?p.msci*100:null).filter(v=>v!==null),sv=perf.map(p=>p.sp!==null?p.sp*100:null).filter(v=>v!==null);
  const all=[...tv,...mv,...sv],minV=Math.min(...all)-0.2,maxV=Math.max(...all)+0.2,rng=maxV-minV||1;
  function pts(arr){return arr.map((v,i)=>{const x=PAD+(i/Math.max(arr.length-1,1))*(W-PAD*2),y=H-PAD-((v-minV)/rng)*(H-PAD*2);return `${x.toFixed(1)},${y.toFixed(1)}`;}).join(' ');}
  const zY=H-PAD-((0-minV)/rng)*(H-PAD*2),li=tv.length-1;
  const lx=PAD+(li/Math.max(tv.length-1,1))*(W-PAD*2),ly=H-PAD-((tv[li]-minV)/rng)*(H-PAD*2);
  return `<svg class="chart" viewBox="0 0 ${W} ${H}">
    <line x1="${PAD}" y1="${zY.toFixed(1)}" x2="${W-PAD}" y2="${zY.toFixed(1)}" stroke="rgba(255,255,255,0.07)" stroke-width="1" stroke-dasharray="3,3"/>
    ${mv.length>1?`<polyline points="${pts(mv)}" fill="none" stroke="var(--blue)" stroke-width="1.5" stroke-opacity="0.5" stroke-dasharray="4,2"/>`:''}
    ${sv.length>1?`<polyline points="${pts(sv)}" fill="none" stroke="var(--violet)" stroke-width="1.5" stroke-opacity="0.5" stroke-dasharray="4,2"/>`:''}
    <polyline points="${pts(tv)}" fill="none" stroke="var(--green)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="4" fill="var(--green)"/>
  </svg>`;
}

// ═══════════════════════════════════════════════════════════
// POSIZIONI
// ═══════════════════════════════════════════════════════════
function posizioni() {
  const pos=DATA.posizioni||[];
  if (!pos.length) return '<div class="empty">Nessuna posizione aperta.</div>';
  const sorted=[...pos].sort((a,b)=>(b.mv||0)-(a.mv||0));
  const tot=sorted.reduce((s,p)=>s+(p.mv||0),0);
  const rows=sorted.map(p=>{
    const c=AC_COLOR[p.ac]||'#94a3b8',bg=AC_BG[p.ac]||'#1e293b';
    const pp=rawPct(p.pnlPct),pc=pp>=0?'var(--green)':'var(--red)';
    const bw=tot>0?Math.min((p.mv/tot)*100,100):0;
    return `<div class="pos-item">
      <div class="pos-avatar" style="background:${bg};color:${c}">${p.ticker.split('.')[0].slice(0,3)}</div>
      <div class="pos-info"><div class="pos-ticker">${p.ticker}</div><div class="pos-name">${p.nome}</div>
        <span class="badge" style="background:${bg};color:${c}">${p.ac}</span>
        <div class="bar-track"><div class="bar-fill" style="width:${bw.toFixed(1)}%;background:${c}"></div></div>
      </div>
      <div class="pos-right"><div class="pos-mv">${eur(p.mv)}</div><div class="pos-pnl" style="color:${pc}">${pp>=0?'+':''}${pp.toFixed(2)}%</div><div style="font-size:9px;color:var(--text3)">${bw.toFixed(1)}% ptf</div></div>
    </div>`;
  }).join('');
  return `<div class="card"><div class="section-title">◆ ${pos.length} Posizioni aperte</div>${rows}</div>`;
}

// ═══════════════════════════════════════════════════════════
// MANDATE
// ═══════════════════════════════════════════════════════════
function mandate() {
  const m=DATA.mandate||[];
  if (!m.length) return '<div class="empty">Nessun dato mandate.</div>';
  const rows=m.map(row=>{
    const cur=typeof row.current==='number'?row.current:0,tgt=typeof row.target==='number'?row.target:0;
    const drift=cur-tgt,bw=Math.min(cur*100,100),tw=Math.min(tgt*100,100);
    const sc=row.status==='OK'?'var(--green)':row.status&&row.status.includes('SOTTO')?'var(--red)':'var(--amber)';
    const scBg=row.status==='OK'?'rgba(16,185,129,0.12)':row.status&&row.status.includes('SOTTO')?'rgba(239,68,68,0.12)':'rgba(245,158,11,0.12)';
    const fc=AC_COLOR[row.label]||'var(--blue)';
    const ds=drift>=0?`+${(drift*100).toFixed(1)}%`:`${(drift*100).toFixed(1)}%`;
    const dc=Math.abs(drift)>0.05?(drift>0?'var(--amber)':'var(--blue)'):'var(--text3)';
    return `<div class="mandate-row">
      <div class="mandate-top"><span class="mandate-label" style="color:${fc}">${row.label}</span><span class="mandate-status" style="background:${scBg};color:${sc}">${row.status||'OK'}</span></div>
      <div class="bar-track"><div class="bar-fill" style="width:${bw.toFixed(1)}%;background:${fc}"></div><div class="bar-target" style="left:${tw.toFixed(1)}%"></div></div>
      <div class="mandate-nums"><span>Attuale: <b style="color:var(--text)">${(cur*100).toFixed(1)}%</b></span><span>Target: <b style="color:var(--text)">${(tgt*100).toFixed(0)}%</b></span><span style="color:${dc}">Drift: <b>${ds}</b></span></div>
    </div>`;
  }).join('');
  return `<div class="section-title">⊞ Allocazione Mandate</div>${rows}`;
}

// ═══════════════════════════════════════════════════════════
// TRANSACTIONS
// ═══════════════════════════════════════════════════════════
function transactions() {
  const trx=DATA.transactions||[];
  if (!trx.length) return '<div class="empty">Nessuna transazione trovata.</div>';
  const rows=trx.map(t=>{
    const isBuy=t.tipo==='BUY'||t.tipo==='PAC',isSell=t.tipo==='SELL';
    const tc=isBuy?'var(--green)':isSell?'var(--red)':'var(--amber)';
    const tbg=isBuy?'rgba(16,185,129,0.12)':isSell?'rgba(239,68,68,0.12)':'rgba(245,158,11,0.12)';
    const ac=isBuy?'var(--red)':'var(--green)';
    const amt=typeof t.netto==='number'?eur(Math.abs(t.netto)):'—';
    const c=AC_COLOR[t.ac]||'#94a3b8',bg=AC_BG[t.ac]||'#1e293b';
    return `<div class="trx-item">
      <div class="trx-badge" style="background:${bg};color:${c}">${(t.ticker||'').slice(0,3)}</div>
      <div class="trx-info"><div class="trx-ticker">${t.ticker} <span class="trx-type" style="background:${tbg};color:${tc}">${t.tipo}</span></div><div class="trx-date">${t.data} · ${(t.nome||'').slice(0,22)}</div></div>
      <div class="trx-right"><div class="trx-amount" style="color:${ac}">${isBuy?'-':'+'}${amt}</div>${t.pnlNetto&&typeof t.pnlNetto==='number'?`<div style="font-size:10px;color:var(--green);font-weight:600">P&L ${eur(t.pnlNetto)}</div>`:''}</div>
    </div>`;
  }).join('');
  return `<div class="card"><div class="section-title">≡ Ultime 50 transazioni</div>${rows}</div>`;
}

// ═══════════════════════════════════════════════════════════
// SIMULATORE
// ═══════════════════════════════════════════════════════════
function simulatore() {
  const cap=(DATA.overview&&DATA.overview.navGestito)||21000;
  return `
  <div class="section-title">◉ Simulatore Previsionale</div>
  <div class="card">
    <div class="slider-wrap"><div class="slider-label"><span>Capitale iniziale</span><span class="slider-val" id="lbl-cap">${eur(cap)}</span></div><input type="range" id="sl-cap" min="5000" max="200000" step="1000" value="${Math.round(cap)}" oninput="updateSim()"></div>
    <div class="slider-wrap"><div class="slider-label"><span>PAC mensile</span><span class="slider-val" id="lbl-pac">€1.000</span></div><input type="range" id="sl-pac" min="0" max="5000" step="100" value="1000" oninput="updateSim()"></div>
    <div class="slider-wrap"><div class="slider-label"><span>Anni</span><span class="slider-val" id="lbl-anni">10 anni</span></div><input type="range" id="sl-anni" min="1" max="30" step="1" value="10" oninput="updateSim()"></div>
  </div>
  <div class="scenario-cards">
    <div class="scenario-card"><div class="scenario-label" style="color:var(--red)">⬇ Pess.</div><div class="scenario-value" id="sc-pess" style="color:var(--red)">—</div><div class="scenario-sub">+3%/anno</div></div>
    <div class="scenario-card" style="border-color:rgba(59,130,246,0.25)"><div class="scenario-label" style="color:var(--blue)">→ Base</div><div class="scenario-value" id="sc-base" style="color:var(--blue)">—</div><div class="scenario-sub">+7%/anno</div></div>
    <div class="scenario-card"><div class="scenario-label" style="color:var(--green)">⬆ Ott.</div><div class="scenario-value" id="sc-opt" style="color:var(--green)">—</div><div class="scenario-sub">+12%/anno</div></div>
  </div>
  <div class="card">
    <div class="card-label">Proiezione nel tempo</div>
    <div class="chart-wrap"><svg id="sim-svg" class="chart" viewBox="0 0 320 130"></svg></div>
    <div style="display:flex;gap:14px;margin-top:8px;font-size:10px;color:var(--text3)"><span><span style="color:var(--red)">●</span> Pessimistico</span><span><span style="color:var(--blue)">●</span> Base</span><span><span style="color:var(--green)">●</span> Ottimistico</span></div>
  </div>`;
}

function updateSim() {
  const cap=parseFloat(document.getElementById('sl-cap').value);
  const pac=parseFloat(document.getElementById('sl-pac').value);
  const anni=parseInt(document.getElementById('sl-anni').value);
  document.getElementById('lbl-cap').textContent=eur(cap);
  document.getElementById('lbl-pac').textContent=eur(pac);
  document.getElementById('lbl-anni').textContent=anni+' anni';
  function fin(r){let v=cap;for(let y=0;y<anni;y++)v=v*(1+r)+pac*12;return v;}
  function ser(r){const p=[cap];let v=cap;for(let y=0;y<anni;y++){v=v*(1+r)+pac*12;p.push(v);}return p;}
  document.getElementById('sc-pess').textContent=eur(fin(0.03),0);
  document.getElementById('sc-base').textContent=eur(fin(0.07),0);
  document.getElementById('sc-opt').textContent=eur(fin(0.12),0);
  const sP=ser(0.03),sB=ser(0.07),sO=ser(0.12);
  const all=[...sP,...sB,...sO],minV=Math.min(...all),maxV=Math.max(...all),rng=maxV-minV||1;
  const W=320,H=130,PAD=10;
  function pts(a){return a.map((v,i)=>{const x=PAD+(i/anni)*(W-PAD*2),y=H-PAD-((v-minV)/rng)*(H-PAD*2);return `${x.toFixed(1)},${y.toFixed(1)}`;}).join(' ');}
  const svg=document.getElementById('sim-svg');
  if(svg) svg.innerHTML=`
    <polyline points="${pts(sP)}" fill="none" stroke="var(--red)" stroke-width="1.5" stroke-opacity="0.6" stroke-dasharray="4,2"/>
    <polyline points="${pts(sB)}" fill="none" stroke="var(--blue)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
    <polyline points="${pts(sO)}" fill="none" stroke="var(--green)" stroke-width="1.5" stroke-opacity="0.6" stroke-dasharray="4,2"/>`;
}

// ═══════════════════════════════════════════════════════════
// FORM NUOVA OPERAZIONE
// ═══════════════════════════════════════════════════════════
function openForm() {
  document.getElementById('modal-overlay').classList.add('open');
  document.getElementById('modal-form').classList.add('open');
  document.getElementById('f-ticker').focus();
}
function closeForm() {
  document.getElementById('modal-overlay').classList.remove('open');
  document.getElementById('modal-form').classList.remove('open');
}
function setTipo(tipo, btn) {
  FORM_TIPO = tipo;
  document.querySelectorAll('.radio-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  updateFormSummary();
}
function updateFormSummary() {
  const qty=parseFloat(document.getElementById('f-qty').value)||0;
  const price=parseFloat(document.getElementById('f-price').value)||0;
  const comm=parseFloat(document.getElementById('f-comm').value)||0;
  const ticker=document.getElementById('f-ticker').value.toUpperCase()||'—';
  if (!qty||!price){document.getElementById('form-summary').classList.remove('visible');return;}
  const totale=qty*price,netto=FORM_TIPO==='SELL'?totale-comm:-(totale+comm);
  document.getElementById('form-summary').classList.add('visible');
  document.getElementById('form-summary').innerHTML=`${FORM_TIPO} ${qty} × ${ticker} @ €${price.toFixed(2)}\nTotale: ${eur(totale,2)} | Comm: ${eur(comm,2)} | Netto: ${eur(Math.abs(netto),2)}`;
}
async function submitForm() {
  const ticker=document.getElementById('f-ticker').value.toUpperCase().trim();
  const nome=document.getElementById('f-nome').value.trim();
  const ac=document.getElementById('f-ac').value;
  const qty=parseFloat(document.getElementById('f-qty').value);
  const price=parseFloat(document.getElementById('f-price').value);
  const comm=parseFloat(document.getElementById('f-comm').value)||0;
  const date=document.getElementById('f-date').value;
  const note=document.getElementById('f-note').value.trim();
  if (!ticker||!qty||!price||!date){alert('Compila Ticker, Quantità, Prezzo e Data');return;}
  const btn=document.getElementById('submit-btn');
  btn.classList.add('loading');btn.textContent='Salvataggio...';
  const totale=qty*price,netto=FORM_TIPO==='SELL'?totale-comm:-(totale+comm);
  const payload={ticker,nome,ac,tipo:FORM_TIPO,qty,price,comm,totale,netto,date,note};
  try {
    const res=await fetch(`${SCRIPT_URL}?action=addTransaction`,{method:'POST',mode:'cors',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    const d=await res.json();
    if (d.error) throw new Error(d.error);
    btn.classList.remove('loading');btn.classList.add('success');btn.textContent='✓ Salvato!';
    setTimeout(()=>{closeForm();btn.classList.remove('success');btn.textContent='Conferma operazione';loadData();},1200);
  } catch(e) {
    btn.classList.remove('loading');btn.classList.add('error');btn.textContent='✕ Errore — riprova';
    setTimeout(()=>{btn.classList.remove('error');btn.textContent='Conferma operazione';},2000);
    console.error(e);
  }
}
