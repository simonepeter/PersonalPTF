// PersonalPTF app.js v2.1
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwokJEIFatJ0Zz_T0iBrvgav4hegErxZ2WZQOB3sITO-J9i_ZL1NQ4WmGvPIXrEeTJnUg/exec';
const AC_COLOR = { ETF:'#4090ff', Azioni:'#9b6dff', Crypto:'#ffb340', Cash:'#18d98b', Fondi:'#00d4ff' };
const AC_BG    = { ETF:'#0f2450', Azioni:'#1e1040', Crypto:'#3a2000', Cash:'#063325', Fondi:'#003340' };
let DATA = null, CURRENT_TAB = 'overview', FORM_TIPO = 'BUY';
let SELECTED_SLICE = null, PERF_MODE = 'twr', PERF_PERIOD = 'ALL', TRX_SORT = { col:'netto', dir:-1 };
let EXPANDED_POS = null;

window.addEventListener('DOMContentLoaded', () => {
  document.getElementById('f-date').value = new Date().toISOString().split('T')[0];
  ['f-qty','f-price','f-comm'].forEach(id => document.getElementById(id).addEventListener('input', updateFormSummary));
  loadData();
});

async function loadData() {
  show('loading'); hide('page-content');
  document.getElementById('loading-text').textContent = 'Caricamento...';
  document.getElementById('live-badge').textContent = '...';
  try {
    const res = await fetch(`${SCRIPT_URL}?action=getData`, { mode:'cors' });
    const d = await res.json();
    if (d.error) throw new Error(d.error);
    DATA = d;
    document.getElementById('update-time').textContent = d.lastUpdate ? d.lastUpdate.substring(0,16) : '--';
    document.getElementById('live-badge').textContent = 'LIVE';
    hide('loading'); show('page-content');
    renderTab(CURRENT_TAB);
  } catch(e) {
    document.getElementById('loading').innerHTML = `<div style="padding:20px;width:100%;max-width:360px"><div style="font-size:12px;color:var(--text3);margin-bottom:8px">Errore connessione</div><div class="error-banner">${e.message}</div><button class="btn-retry" onclick="loadData()">Riprova</button></div>`;
    document.getElementById('live-badge').textContent = 'ERR';
  }
}

function setTab(tab) {
  CURRENT_TAB = tab; SELECTED_SLICE = null; EXPANDED_POS = null;
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

function eur(n, dec=0) { if (typeof n !== 'number' || isNaN(n)) return '—'; return new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR',maximumFractionDigits:dec}).format(n); }
function rawPct(n) { return typeof n !== 'number' ? 0 : n * 100; }
function show(id) { const e=document.getElementById(id); if(e) e.style.display=''; }
function hide(id) { const e=document.getElementById(id); if(e) e.style.display='none'; }
function col(v) { return (typeof v === 'number' && v >= 0) ? 'var(--green)' : 'var(--red)'; }

// ═══════ OVERVIEW CON DONUT ═══════
function overview() {
  const o = DATA.overview || {};
  const pnlPct = rawPct(o.pnlPct).toFixed(2);
  const pnlC = col(o.pnlEur);
  const pos = DATA.posizioni || [];
  const byAC = {};
  pos.forEach(p => { byAC[p.ac] = (byAC[p.ac]||0) + (p.mv||0); });
  if (o.cashTotale) byAC['Cash'] = (byAC['Cash']||0) + o.cashTotale;
  const grandTotal = Object.values(byAC).reduce((s,v)=>s+v,0);
  const donutSvg = buildDonut(byAC, grandTotal, o.navGestito);
  const legend = Object.entries(byAC).map(([ac,v]) => {
    const pct = grandTotal > 0 ? ((v/grandTotal)*100).toFixed(1) : '0';
    return `<div class="legend-item" id="leg-${ac}" onclick="selectSlice('${ac}')">
      <div class="legend-dot" style="background:${AC_COLOR[ac]||'#888'}"></div>
      <span class="legend-label">${ac}</span>
      <span class="legend-val">${pct}%</span>
    </div>`;
  }).join('');
  return `
  <div class="pnl-summary">
    <div>
      <div style="font-size:10px;color:var(--text3);font-weight:600;letter-spacing:0.5px">PATRIMONIO TOTALE</div>
      <div style="font-size:22px;font-weight:700;font-family:var(--mono);color:var(--text)">${eur(o.navTotale)}</div>
      <div style="font-size:11px;color:var(--text3)">Gestito ${eur(o.navGestito)} · Stabile ${eur(o.navStabile)}</div>
    </div>
    <div style="text-align:right">
      <div style="font-size:26px;font-weight:700;font-family:var(--mono);color:${pnlC}">${(o.pnlEur||0)>=0?'+':''}${pnlPct}%</div>
      <div style="font-size:12px;color:${pnlC}">${(o.pnlEur||0)>=0?'+':''}${eur(o.pnlEur)}</div>
      <div style="font-size:10px;color:var(--text3)">${o.nPos||0} posizioni</div>
    </div>
  </div>
  <div class="card">
    <div class="section-title">Allocazione portafoglio</div>
    <div class="donut-wrap">
      ${donutSvg}
      <div class="donut-legend">${legend}</div>
    </div>
    <div class="donut-detail" id="donut-detail" style="display:none"></div>
  </div>`;
}

function buildDonut(byAC, total, gestito) {
  // Cerchio più grande
  const R = 100, r = 65, cx = 140, cy = 140;
  const entries = Object.entries(byAC).filter(([,v]) => v > 0);
  let html = `<svg class="donut-svg" viewBox="0 0 280 280" width="280" height="280" onclick="handleDonutClick(event)">`;
  html += `<circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="var(--surface2)" stroke-width="${R-r}"/>`;
  let angle = -Math.PI/2;
  entries.forEach(([ac, val]) => {
    const frac = val / total;
    const sweep = frac * 2 * Math.PI;
    const x1 = cx + R * Math.cos(angle), y1 = cy + R * Math.sin(angle);
    const x2 = cx + R * Math.cos(angle + sweep), y2 = cy + R * Math.sin(angle + sweep);
    const xi1 = cx + r * Math.cos(angle), yi1 = cy + r * Math.sin(angle);
    const xi2 = cx + r * Math.cos(angle + sweep), yi2 = cy + r * Math.sin(angle + sweep);
    const large = sweep > Math.PI ? 1 : 0;
    const mid = angle + sweep/2;
    const mx = cx + (R+r)/2 * Math.cos(mid), my = cy + (R+r)/2 * Math.sin(mid);
    const path = `M ${x1.toFixed(1)} ${y1.toFixed(1)} A ${R} ${R} 0 ${large} 1 ${x2.toFixed(1)} ${y2.toFixed(1)} L ${xi2.toFixed(1)} ${yi2.toFixed(1)} A ${r} ${r} 0 ${large} 0 ${xi1.toFixed(1)} ${yi1.toFixed(1)} Z`;
    html += `<path class="donut-slice" d="${path}" fill="${AC_COLOR[ac]||'#888'}" data-ac="${ac}" data-val="${val.toFixed(0)}" data-pct="${(frac*100).toFixed(1)}"/>`;
    if (frac > 0.07) {
      html += `<text x="${mx.toFixed(1)}" y="${my.toFixed(1)}" text-anchor="middle" dominant-baseline="middle" font-size="11" font-weight="700" fill="white" pointer-events="none">${(frac*100).toFixed(0)}%</text>`;
    }
    angle += sweep;
  });
  // Centro — mostra gestito di default
  html += `<g id="donut-center" pointer-events="none">
    <text id="dc-label" x="${cx}" y="${cy-14}" text-anchor="middle" font-size="11" fill="var(--text3)" font-family="var(--font)">Gestito</text>
    <text id="dc-value" x="${cx}" y="${cy+8}" text-anchor="middle" font-size="16" font-weight="700" fill="var(--text)" font-family="var(--mono)">${eur(gestito)}</text>
  </g>`;
  html += `</svg>`;
  return html;
}

function handleDonutClick(e) {
  const slice = e.target.closest('.donut-slice');
  if (!slice) {
    selectSlice(null);
    return;
  }
  selectSlice(slice.dataset.ac, parseFloat(slice.dataset.val), parseFloat(slice.dataset.pct));
}

function selectSlice(ac, val, pct) {
  SELECTED_SLICE = ac;
  // Aggiorna fette
  document.querySelectorAll('.donut-slice').forEach(s => {
    s.classList.toggle('dimmed', !!ac && s.dataset.ac !== ac);
  });
  // Aggiorna legenda
  document.querySelectorAll('.legend-item').forEach(l => {
    l.classList.toggle('active', l.id === 'leg-' + ac);
  });
  // Aggiorna centro donut
  const dcLabel = document.getElementById('dc-label');
  const dcValue = document.getElementById('dc-value');
  if (dcLabel && dcValue) {
    if (ac) {
      dcLabel.textContent = ac;
      dcValue.textContent = eur(val);
    } else {
      dcLabel.textContent = 'Gestito';
      const gestito = (DATA.overview||{}).navGestito || 0;
      dcValue.textContent = eur(gestito);
    }
  }
  // Dettaglio sotto
  const detail = document.getElementById('donut-detail');
  if (!detail) return;
  if (!ac) { detail.style.display = 'none'; return; }
  detail.style.display = 'block';
  const pos = (DATA.posizioni||[]).filter(p => p.ac === ac);
  const tot = pos.reduce((s,p)=>s+(p.mv||0),0);
  let rows = '';
  if (ac === 'Cash') {
    const o = DATA.overview || {};
    rows = `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--border)">
        <div>
          <div style="font-size:13px;font-weight:600;color:var(--text)">Fineco</div>
          <div style="font-size:11px;color:var(--text3)">Conto corrente</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:14px;font-weight:700;font-family:var(--mono);color:var(--text)">${eur(o.cashFineco)}</div>
        </div>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0">
        <div>
          <div style="font-size:13px;font-weight:600;color:var(--text)">Kraken</div>
          <div style="font-size:11px;color:var(--text3)">Exchange crypto</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:14px;font-weight:700;font-family:var(--mono);color:var(--text)">${eur(o.cashKraken)}</div>
        </div>
      </div>`;
  } else {
    rows = pos.map(p => {
      const pp = rawPct(p.pnlPct).toFixed(2);
      const pc = parseFloat(pp) >= 0 ? 'var(--green)' : 'var(--red)';
      const bw = tot > 0 ? ((p.mv/tot)*100).toFixed(0) : 0;
      return `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--border)">
        <div style="flex:1;min-width:0">
          <div style="font-size:14px;font-weight:700;color:var(--text)">${p.ticker}</div>
          <div style="font-size:11px;color:var(--text3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${p.nome}</div>
          <div style="height:3px;background:var(--surface3);border-radius:2px;margin-top:6px;width:100%">
            <div style="height:100%;width:${bw}%;background:${AC_COLOR[ac]||'var(--blue)'};border-radius:2px"></div>
          </div>
        </div>
        <div style="text-align:right;margin-left:16px;flex-shrink:0">
          <div style="font-size:15px;font-weight:700;font-family:var(--mono);color:var(--text)">${eur(p.mv)}</div>
          <div style="font-size:13px;font-weight:700;font-family:var(--mono);color:${pc}">${parseFloat(pp)>=0?'+':''}${pp}%</div>
        </div>
      </div>`;
    }).join('');
  }
  detail.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;padding-bottom:12px;border-bottom:1px solid var(--border2);margin-bottom:4px">
      <span style="font-size:14px;font-weight:700;color:${AC_COLOR[ac]||'var(--text)'}">${ac}</span>
      <span style="font-size:14px;font-family:var(--mono);color:var(--text);font-weight:700">${pct}% · ${eur(val)}</span>
    </div>
    ${rows}`;
}

// ═══════ PERFORMANCE ═══════
function performance() {
  const perf = DATA.performance||[];
  if (!perf.length) return '<div class="empty">Nessun dato performance.<br>Il sistema registra ogni giorno alle 18:00.</div>';
  const filtered = filterPerf(perf);
  const last = filtered[filtered.length-1];
  const twr = last.twr*100;
  const msci = last.msci!==null?last.msci*100:null;
  const sp = last.sp!==null?last.sp*100:null;
  const tc = twr>=0?'var(--green)':'var(--red)';
  const chart = PERF_MODE === 'twr' ? buildPerfChart(filtered) : buildNavChart(filtered);
  const labels = filtered.filter((_,i)=>i%Math.max(1,Math.floor(filtered.length/5))===0).map(p=>`<span class="chart-label">${p.data}</span>`).join('');
  const benchRows = [
    {label:'TWR Cumulato', val:twr, color:tc},
    msci!==null?{label:'MSCI World', val:msci, color:'var(--blue)'}:null,
    sp!==null?{label:'S&P 500', val:sp, color:'var(--violet)'}:null,
    msci!==null?{label:'Active vs MSCI', val:twr-msci, color:twr-msci>=0?'var(--green)':'var(--red)'}:null,
  ].filter(Boolean).map(r=>`<div class="bench-row"><span class="bench-label">${r.label}</span><span class="bench-val" style="color:${r.color}">${r.val>=0?'+':''}${r.val.toFixed(2)}%</span></div>`).join('');
  const hist = [...filtered].reverse().slice(0,10).map(p=>{
    const t=(p.twr*100).toFixed(2),c=parseFloat(t)>=0?'var(--green)':'var(--red)';
    return `<div class="bench-row"><span style="font-size:11px;color:var(--text3)">${p.data}</span><span style="font-family:var(--mono);font-size:12px;font-weight:600;color:${c}">${parseFloat(t)>=0?'+':''}${t}%</span></div>`;
  }).join('');
  return `
  <div class="card">
    <div class="perf-hero">
      <div class="perf-twr" style="color:${tc}">${twr>=0?'+':''}${twr.toFixed(2)}%</div>
      <div class="perf-sub">Time-Weighted Return · ${filtered.length} giorni</div>
    </div>
    <div class="perf-switch">
      <button class="perf-switch-btn ${PERF_MODE==='twr'?'active':''}" onclick="setPerfMode('twr')">📈 TWR %</button>
      <button class="perf-switch-btn ${PERF_MODE==='nav'?'active':''}" onclick="setPerfMode('nav')">💶 NAV €</button>
    </div>
    <div class="period-wrap">
      ${['1S','1M','3M','ALL'].map(p=>`<button class="period-btn ${PERF_PERIOD===p?'active':''}" onclick="setPeriod('${p}')">${p}</button>`).join('')}
    </div>
    <div class="chart-wrap">${chart}</div>
    <div class="chart-labels">${labels}</div>
  </div>
  <div class="card">${benchRows}</div>
  <div class="card"><div class="section-title">Storico giornaliero</div>${hist}</div>`;
}

function filterPerf(perf) {
  if (PERF_PERIOD === 'ALL') return perf;
  const days = { '1S':7, '1M':30, '3M':90 }[PERF_PERIOD] || 999;
  return perf.slice(-days);
}
function setPerfMode(m) { PERF_MODE = m; renderTab('performance'); }
function setPeriod(p) { PERF_PERIOD = p; renderTab('performance'); }

function buildPerfChart(perf) {
  const W=320,H=110,PAD=8;
  const tv=perf.map(p=>p.twr*100),mv=perf.map(p=>p.msci!==null?p.msci*100:null).filter(v=>v!==null);
  const all=[...tv,...mv];
  const minV=Math.min(...all)-0.2,maxV=Math.max(...all)+0.2,rng=maxV-minV||1;
  function pts(arr){return arr.map((v,i)=>{const x=PAD+(i/Math.max(arr.length-1,1))*(W-PAD*2),y=H-PAD-((v-minV)/rng)*(H-PAD*2);return `${x.toFixed(1)},${y.toFixed(1)}`;}).join(' ');}
  const zY=H-PAD-((0-minV)/rng)*(H-PAD*2);
  const li=tv.length-1,lx=PAD+(li/Math.max(tv.length-1,1))*(W-PAD*2),ly=H-PAD-((tv[li]-minV)/rng)*(H-PAD*2);
  const areaPath=`M ${PAD},${zY.toFixed(1)} ${tv.map((v,i)=>{const x=PAD+(i/Math.max(tv.length-1,1))*(W-PAD*2),y=H-PAD-((v-minV)/rng)*(H-PAD*2);return `L ${x.toFixed(1)},${y.toFixed(1)}`;}).join(' ')} L ${(W-PAD).toFixed(1)},${zY.toFixed(1)} Z`;
  return `<svg class="chart" viewBox="0 0 ${W} ${H}">
    <defs><linearGradient id="ag" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="var(--green)" stop-opacity="0.2"/><stop offset="100%" stop-color="var(--green)" stop-opacity="0"/></linearGradient></defs>
    <line x1="${PAD}" y1="${zY.toFixed(1)}" x2="${W-PAD}" y2="${zY.toFixed(1)}" stroke="rgba(255,255,255,0.08)" stroke-width="1" stroke-dasharray="3,3"/>
    <path d="${areaPath}" fill="url(#ag)"/>
    ${mv.length>1?`<polyline points="${pts(mv)}" fill="none" stroke="var(--blue)" stroke-width="1.5" stroke-opacity="0.5" stroke-dasharray="4,2"/>`:''}
    <polyline points="${pts(tv)}" fill="none" stroke="var(--green)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="4" fill="var(--green)"/>
  </svg>`;
}

function buildNavChart(perf) {
  const W=320,H=110,PAD=8;
  const navV=perf.map(p=>p.nav).filter(v=>v>0);
  if (!navV.length) return '<div class="empty">NAV non disponibile</div>';
  const minV=Math.min(...navV)*0.995,maxV=Math.max(...navV)*1.005,rng=maxV-minV||1;
  const pts=navV.map((v,i)=>{const x=PAD+(i/Math.max(navV.length-1,1))*(W-PAD*2),y=H-PAD-((v-minV)/rng)*(H-PAD*2);return `${x.toFixed(1)},${y.toFixed(1)}`;}).join(' ');
  const li=navV.length-1,lx=PAD+(li/Math.max(navV.length-1,1))*(W-PAD*2),ly=H-PAD-((navV[li]-minV)/rng)*(H-PAD*2);
  const areaPath=`M ${PAD},${(H-PAD).toFixed(1)} ${navV.map((v,i)=>{const x=PAD+(i/Math.max(navV.length-1,1))*(W-PAD*2),y=H-PAD-((v-minV)/rng)*(H-PAD*2);return `L ${x.toFixed(1)},${y.toFixed(1)}`;}).join(' ')} L ${(W-PAD).toFixed(1)},${(H-PAD).toFixed(1)} Z`;
  return `<svg class="chart" viewBox="0 0 ${W} ${H}">
    <defs><linearGradient id="ng" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="var(--blue)" stop-opacity="0.2"/><stop offset="100%" stop-color="var(--blue)" stop-opacity="0"/></linearGradient></defs>
    <path d="${areaPath}" fill="url(#ng)"/>
    <polyline points="${pts}" fill="none" stroke="var(--blue)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="4" fill="var(--blue)"/>
  </svg>`;
}

// ═══════ POSIZIONI — stile tabella con espansione ═══════
function posizioni() {
  const pos=DATA.posizioni||[];
  if (!pos.length) return '<div class="empty">Nessuna posizione aperta.</div>';
  const sorted=[...pos].sort((a,b)=>(b.mv||0)-(a.mv||0));
  const tot=sorted.reduce((s,p)=>s+(p.mv||0),0);
  const rows=sorted.map((p,i)=>{
    const c=AC_COLOR[p.ac]||'#888',bg=AC_BG[p.ac]||'#1e293b';
    const pp=rawPct(p.pnlPct),pc=pp>=0?'var(--green)':'var(--red)';
    const bw=tot>0?Math.min((p.mv/tot)*100,100):0;
    const isOpen = EXPANDED_POS === p.ticker;
    const detail = isOpen ? `
      <div style="background:var(--surface2);border-radius:var(--radius-xs);padding:12px;margin:0 -8px 8px;animation:fadeIn 0.2s ease">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div><div style="font-size:10px;color:var(--text3);font-weight:600;text-transform:uppercase;letter-spacing:0.5px">Market Value</div><div style="font-size:14px;font-weight:700;font-family:var(--mono);margin-top:2px">${eur(p.mv)}</div></div>
          <div><div style="font-size:10px;color:var(--text3);font-weight:600;text-transform:uppercase;letter-spacing:0.5px">P&L €</div><div style="font-size:14px;font-weight:700;font-family:var(--mono);color:${pc};margin-top:2px">${pp>=0?'+':''}${eur(p.pnlEur)}</div></div>
          <div><div style="font-size:10px;color:var(--text3);font-weight:600;text-transform:uppercase;letter-spacing:0.5px">Peso ptf</div><div style="font-size:14px;font-weight:700;font-family:var(--mono);margin-top:2px">${bw.toFixed(1)}%</div></div>
          <div><div style="font-size:10px;color:var(--text3);font-weight:600;text-transform:uppercase;letter-spacing:0.5px">Prezzo</div><div style="font-size:14px;font-weight:700;font-family:var(--mono);margin-top:2px">${eur(p.price,2)}</div></div>
          <div><div style="font-size:10px;color:var(--text3);font-weight:600;text-transform:uppercase;letter-spacing:0.5px">Valuta</div><div style="font-size:14px;font-weight:700;margin-top:2px">${p.currency}</div></div>
          <div><div style="font-size:10px;color:var(--text3);font-weight:600;text-transform:uppercase;letter-spacing:0.5px">Asset Class</div><div style="margin-top:4px"><span class="badge" style="background:${bg};color:${c}">${p.ac}</span></div></div>
        </div>
        <div style="height:4px;background:var(--surface3);border-radius:2px;margin-top:12px">
          <div style="height:100%;width:${bw.toFixed(1)}%;background:${c};border-radius:2px"></div>
        </div>
      </div>` : '';
    return `<tr onclick="togglePos('${p.ticker}')" style="cursor:pointer">
      <td>
        <div style="display:flex;align-items:center;gap:10px">
          <div style="width:36px;height:36px;border-radius:9px;background:${bg};color:${c};display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:800;flex-shrink:0;font-family:var(--mono)">${p.ticker.split('.')[0].slice(0,3)}</div>
          <div style="min-width:0">
            <div style="font-size:13px;font-weight:700;color:var(--text)">${p.ticker}</div>
            <div style="font-size:10px;color:var(--text3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:120px">${p.nome}</div>
            ${isOpen ? detail : ''}
          </div>
        </div>
      </td>
      <td class="num">${eur(p.mv)}</td>
      <td class="pct" style="color:${pc}">${pp>=0?'+':''}${pp.toFixed(2)}%</td>
    </tr>`;
  }).join('');
  function th(label) { return `<th style="text-align:${label==='Titolo'?'left':'right'}">${label}</th>`; }
  return `<div class="card" style="overflow-x:auto">
    <div class="section-title">◆ ${pos.length} Posizioni aperte · ${eur(tot)} gestito</div>
    <table class="trx-table">
      <thead><tr>${th('Titolo')}${th('Valore')}${th('P&L %')}</tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

function togglePos(ticker) {
  EXPANDED_POS = EXPANDED_POS === ticker ? null : ticker;
  renderTab('posizioni');
}

// ═══════ MANDATE ═══════
function mandate() {
  const m=DATA.mandate||[];
  if (!m.length) return '<div class="empty">Nessun dato mandate.</div>';
  const rows=m.map(row=>{
    const cur=typeof row.current==='number'?row.current:0,tgt=typeof row.target==='number'?row.target:0;
    const min=typeof row.min==='number'?row.min:0,max=typeof row.max==='number'?row.max:1;
    const drift=cur-tgt,bw=Math.min(cur*100,100),tw=Math.min(tgt*100,100);
    const minW=Math.min(min*100,100),maxW=Math.min(max*100,100);
    const sc=row.status==='OK'?'var(--green)':row.status&&row.status.includes('SOTTO')?'var(--red)':'var(--amber)';
    const scBg=row.status==='OK'?'rgba(24,217,139,0.12)':row.status&&row.status.includes('SOTTO')?'rgba(255,77,106,0.12)':'rgba(255,179,64,0.12)';
    const fc=AC_COLOR[row.label]||'var(--blue)';
    const ds=drift>=0?`+${(drift*100).toFixed(1)}%`:`${(drift*100).toFixed(1)}%`;
    const dc=Math.abs(drift)>0.05?(drift>0?'var(--amber)':'var(--blue)'):'var(--text3)';
    return `<div class="mandate-row">
      <div class="mandate-top">
        <span class="mandate-label" style="color:${fc}">${row.label}</span>
        <span class="mandate-status" style="background:${scBg};color:${sc}">${row.status||'OK'}</span>
      </div>
      <div class="bar-track" style="height:8px">
        <div style="position:absolute;left:${minW.toFixed(1)}%;width:${(maxW-minW).toFixed(1)}%;height:100%;background:rgba(255,255,255,0.06);border-radius:3px"></div>
        <div class="bar-fill" style="width:${bw.toFixed(1)}%;background:${fc}"></div>
        <div class="bar-target" style="left:${tw.toFixed(1)}%;width:3px;background:white;opacity:0.8"></div>
      </div>
      <div class="mandate-nums">
        <span>Attuale: <b>${(cur*100).toFixed(1)}%</b></span>
        <span>Target: <b>${(tgt*100).toFixed(0)}%</b></span>
        <span style="color:${dc}">Drift: <b>${ds}</b></span>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:9px;color:var(--text4);margin-top:4px">
        <span>Min ${(min*100).toFixed(0)}%</span><span>Max ${(max*100).toFixed(0)}%</span>
      </div>
    </div>`;
  }).join('');
  return `<div class="section-title">⊞ Allocazione Mandate</div>${rows}`;
}

// ═══════ TRANSACTIONS ═══════
function transactions() {
  const trx=DATA.transactions||[];
  if (!trx.length) return '<div class="empty">Nessuna transazione trovata.</div>';
  const totAbs = trx.reduce((s,t)=>s+Math.abs(t.netto||0),0);
  const sorted=[...trx].sort((a,b)=>{
    let va=a[TRX_SORT.col]||0,vb=b[TRX_SORT.col]||0;
    if (typeof va==='string') va=va.toLowerCase(),vb=vb.toLowerCase();
    return TRX_SORT.dir * (va>vb?1:va<vb?-1:0);
  });
  function th(label,colKey) {
    const active=TRX_SORT.col===colKey;
    const arrow=active?(TRX_SORT.dir===1?'↑':'↓'):'';
    return `<th class="${active?'sort-active':''}" onclick="sortTrx('${colKey}')">${label} ${arrow}</th>`;
  }
  const rows=sorted.map(t=>{
    const isBuy=t.tipo==='BUY'||t.tipo==='PAC',isSell=t.tipo==='SELL';
    const tc=isBuy?'var(--green)':isSell?'var(--red)':'var(--amber)';
    const tbg=isBuy?'rgba(24,217,139,0.12)':isSell?'rgba(255,77,106,0.12)':'rgba(255,179,64,0.12)';
    const amtCol=isBuy?'var(--red)':'var(--green)';
    const amt=typeof t.netto==='number'?Math.abs(t.netto):0;
    const pctVal=totAbs>0?((amt/totAbs)*100).toFixed(1):'0';
    const c=AC_COLOR[t.ac]||'#888',bg=AC_BG[t.ac]||'#1e293b';
    return `<tr>
      <td><div class="trx-ticker-cell">
        <div class="trx-badge" style="background:${bg};color:${c}">${(t.ticker||'').slice(0,3)}</div>
        <div><div class="trx-name">${t.ticker} <span class="trx-type" style="background:${tbg};color:${tc}">${t.tipo}</span></div><div class="trx-date">${t.data}</div></div>
      </div></td>
      <td class="num" style="color:${amtCol}">${isBuy?'-':'+'}${eur(amt)}</td>
      <td class="pct" style="color:var(--text3)">${pctVal}%</td>
    </tr>`;
  }).join('');
  return `<div class="card">
    <div class="section-title">≡ Ultime 50 transazioni</div>
    <table class="trx-table">
      <thead><tr>${th('Titolo','ticker')}${th('Importo','netto')}${th('%','pct')}</tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

function sortTrx(col) {
  if (TRX_SORT.col === col) TRX_SORT.dir *= -1;
  else { TRX_SORT.col = col; TRX_SORT.dir = -1; }
  renderTab('transactions');
}

// ═══════ SIMULATORE ═══════
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
    <div class="scenario-card" style="border-color:rgba(64,144,255,0.3)"><div class="scenario-label" style="color:var(--blue)">→ Base</div><div class="scenario-value" id="sc-base" style="color:var(--blue)">—</div><div class="scenario-sub">+7%/anno</div></div>
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

// ═══════ FORM ═══════
function openForm() { document.getElementById('modal-overlay').classList.add('open'); document.getElementById('modal-form').classList.add('open'); document.getElementById('f-ticker').focus(); }
function closeForm() { document.getElementById('modal-overlay').classList.remove('open'); document.getElementById('modal-form').classList.remove('open'); }
function setTipo(tipo, btn) { FORM_TIPO=tipo; document.querySelectorAll('.radio-btn').forEach(b=>b.classList.remove('active')); btn.classList.add('active'); updateFormSummary(); }
function updateFormSummary() {
  const qty=parseFloat(document.getElementById('f-qty').value)||0,price=parseFloat(document.getElementById('f-price').value)||0,comm=parseFloat(document.getElementById('f-comm').value)||0;
  const ticker=document.getElementById('f-ticker').value.toUpperCase()||'—';
  if (!qty||!price){document.getElementById('form-summary').classList.remove('visible');return;}
  const totale=qty*price,netto=FORM_TIPO==='SELL'?totale-comm:-(totale+comm);
  document.getElementById('form-summary').classList.add('visible');
  document.getElementById('form-summary').innerHTML=`${FORM_TIPO} ${qty} × ${ticker} @ €${price.toFixed(2)}\nTotale: ${eur(totale,2)}  Comm: ${eur(comm,2)}  Netto: ${eur(Math.abs(netto),2)}`;
}
async function submitForm() {
  const ticker=document.getElementById('f-ticker').value.toUpperCase().trim(),nome=document.getElementById('f-nome').value.trim();
  const ac=document.getElementById('f-ac').value,qty=parseFloat(document.getElementById('f-qty').value);
  const price=parseFloat(document.getElementById('f-price').value),comm=parseFloat(document.getElementById('f-comm').value)||0;
  const date=document.getElementById('f-date').value,note=document.getElementById('f-note').value.trim();
  if (!ticker||!qty||!price||!date){alert('Compila Ticker, Quantità, Prezzo e Data');return;}
  const btn=document.getElementById('submit-btn');
  btn.classList.add('loading');btn.textContent='Salvataggio...';
  const totale=qty*price,netto=FORM_TIPO==='SELL'?totale-comm:-(totale+comm);
  try {
    const res=await fetch(`${SCRIPT_URL}?action=addTransaction`,{method:'POST',mode:'cors',headers:{'Content-Type':'application/json'},body:JSON.stringify({ticker,nome,ac,tipo:FORM_TIPO,qty,price,comm,totale,netto,date,note})});
    const d=await res.json();
    if (d.error) throw new Error(d.error);
    btn.classList.remove('loading');btn.classList.add('success');btn.textContent='✓ Salvato!';
    setTimeout(()=>{closeForm();btn.classList.remove('success');btn.textContent='Conferma operazione';loadData();},1200);
  } catch(e) {
    btn.classList.remove('loading');btn.classList.add('error');btn.textContent='✕ Errore';
    setTimeout(()=>{btn.classList.remove('error');btn.textContent='Conferma operazione';},2000);
  }
}
