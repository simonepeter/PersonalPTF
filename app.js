
// PersonalPTF app.js v2.3
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxTPblW_RCgHALEkuvNUW6e659vpHRIBxrDTmLekf-EC_GIBeuOlb6eIrbv925b1AonYQ/exec';
const AC_COLOR = { ETF:'#4090ff', Azioni:'#9b6dff', Crypto:'#ffb340', Cash:'#18d98b', Fondi:'#00d4ff' };
const AC_BG    = { ETF:'#0f2450', Azioni:'#1e1040', Crypto:'#3a2000', Cash:'#063325', Fondi:'#003340' };

const MANDATE_SECTIONS = {
  'L1 — Asset Class': ['ETF','Azioni','Cash','Crypto','Fondi','Oro'],
  'L2 — Geografia':   ['USA / Nord America','Europa','Emerging Markets','Asia Sviluppata','Global / Multi'],
  'L3 — Settori':     ['Technology','Financials','Consumer','Healthcare','Energy','Materie Prime','Other / Multi'],
  'L4 — Valuta':      ['EUR','USD','Other'],
};

let DATA = null, CURRENT_TAB = 'overview', FORM_TIPO = 'BUY';
let SELECTED_SLICE = null;
let PERF_MODE = 'twr', PERF_PERIOD = 'ALL';
let TRX_SORT = { col:'netto', dir:-1 };
let POS_SORT = { col:'mv', dir:-1 }, EXPANDED_POS = null;
let MANDATE_OPEN = { 'L1 — Asset Class':true, 'L2 — Geografia':false, 'L3 — Settori':false, 'L4 — Valuta':false };

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
  const map = { overview, performance, posizioni, mandate, transactions, simulatore, news };
  el.innerHTML = (map[tab] || (() => '<div class="empty">In costruzione</div>'))();
  if (tab === 'simulatore') updateSim();
  if (tab === 'news') setTimeout(() => loadNews(), 50);
}

function eur(n, dec=0) { if (typeof n !== 'number' || isNaN(n)) return '—'; return new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR',maximumFractionDigits:dec}).format(n); }
function rawPct(n) { return typeof n !== 'number' ? 0 : n * 100; }
function show(id) { const e=document.getElementById(id); if(e) e.style.display=''; }
function hide(id) { const e=document.getElementById(id); if(e) e.style.display='none'; }
function col(v) { return (typeof v === 'number' && v >= 0) ? 'var(--green)' : 'var(--red)'; }
function numK(n) { if (typeof n !== 'number') return '—'; if (Math.abs(n)>=1000) return (n/1000).toFixed(0)+'k'; return n.toFixed(0); }

// ═══════ OVERVIEW ═══════
function overview() {
  const o = DATA.overview || {};
  const pnlPct = rawPct(o.pnlPct).toFixed(2);
  const pnlC = col(o.pnlEur);
  const pos = DATA.posizioni || [];
  const byAC = {};
  pos.forEach(p => { byAC[p.ac] = (byAC[p.ac]||0) + (p.mv||0); });
  if (o.cashTotale) byAC['Cash'] = (byAC['Cash']||0) + o.cashTotale;
  const grandTotal = Object.values(byAC).reduce((s,v)=>s+v,0);
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
      ${buildDonut(byAC, grandTotal, o.navGestito)}
      <div class="donut-legend">
        ${Object.entries(byAC).map(([ac,v]) => {
          const pct = grandTotal>0?((v/grandTotal)*100).toFixed(1):'0';
          return `<div class="legend-item" id="leg-${ac}" onclick="selectSlice('${ac}')">
            <div class="legend-dot" style="background:${AC_COLOR[ac]||'#888'}"></div>
            <span class="legend-label">${ac}</span>
            <span class="legend-val">${pct}%</span>
          </div>`;
        }).join('')}
      </div>
    </div>
    <div class="donut-detail" id="donut-detail" style="display:none"></div>
  </div>`;
}

function buildDonut(byAC, total, gestito) {
  const R=110,r=72,cx=150,cy=150;
  const entries = Object.entries(byAC).filter(([,v])=>v>0);
  let html = `<svg class="donut-svg" viewBox="0 0 300 300" width="300" height="300" onclick="handleDonutClick(event)">`;
  html += `<circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="var(--surface2)" stroke-width="${R-r}"/>`;
  let angle = -Math.PI/2;
  entries.forEach(([ac,val]) => {
    const frac=val/total, sweep=frac*2*Math.PI;
    const x1=cx+R*Math.cos(angle),y1=cy+R*Math.sin(angle);
    const x2=cx+R*Math.cos(angle+sweep),y2=cy+R*Math.sin(angle+sweep);
    const xi1=cx+r*Math.cos(angle),yi1=cy+r*Math.sin(angle);
    const xi2=cx+r*Math.cos(angle+sweep),yi2=cy+r*Math.sin(angle+sweep);
    const large=sweep>Math.PI?1:0, mid=angle+sweep/2;
    const mx=cx+(R+r)/2*Math.cos(mid),my=cy+(R+r)/2*Math.sin(mid);
    const path=`M ${x1.toFixed(1)} ${y1.toFixed(1)} A ${R} ${R} 0 ${large} 1 ${x2.toFixed(1)} ${y2.toFixed(1)} L ${xi2.toFixed(1)} ${yi2.toFixed(1)} A ${r} ${r} 0 ${large} 0 ${xi1.toFixed(1)} ${yi1.toFixed(1)} Z`;
    html+=`<path class="donut-slice" d="${path}" fill="${AC_COLOR[ac]||'#888'}" data-ac="${ac}" data-val="${val.toFixed(0)}" data-pct="${(frac*100).toFixed(1)}"/>`;
    if(frac>0.07) html+=`<text x="${mx.toFixed(1)}" y="${my.toFixed(1)}" text-anchor="middle" dominant-baseline="middle" font-size="11" font-weight="700" fill="white" pointer-events="none">${(frac*100).toFixed(0)}%</text>`;
    angle+=sweep;
  });
  html+=`<g id="donut-center" pointer-events="none">
    <text id="dc-label" x="${cx}" y="${cy-16}" text-anchor="middle" font-size="11" fill="var(--text3)" font-family="var(--font)">Gestito</text>
    <text id="dc-value" x="${cx}" y="${cy+8}" text-anchor="middle" font-size="15" font-weight="700" fill="var(--text)" font-family="var(--mono)">${eur(gestito)}</text>
  </g></svg>`;
  return html;
}

function handleDonutClick(e) {
  const slice=e.target.closest('.donut-slice');
  slice?selectSlice(slice.dataset.ac,parseFloat(slice.dataset.val),parseFloat(slice.dataset.pct)):selectSlice(null);
}

function selectSlice(ac,val,pct) {
  SELECTED_SLICE=ac;
  document.querySelectorAll('.donut-slice').forEach(s=>s.classList.toggle('dimmed',!!ac&&s.dataset.ac!==ac));
  document.querySelectorAll('.legend-item').forEach(l=>l.classList.toggle('active',l.id==='leg-'+ac));
  const dcLabel=document.getElementById('dc-label'),dcValue=document.getElementById('dc-value');
  if(dcLabel&&dcValue){if(ac){dcLabel.textContent=ac;dcValue.textContent=eur(val);}else{dcLabel.textContent='Gestito';dcValue.textContent=eur((DATA.overview||{}).navGestito||0);}}
  const detail=document.getElementById('donut-detail');
  if(!detail)return;
  if(!ac){detail.style.display='none';return;}
  detail.style.display='block';
  const pos=(DATA.posizioni||[]).filter(p=>p.ac===ac);
  const tot=pos.reduce((s,p)=>s+(p.mv||0),0);
  let rows='';
  if(ac==='Cash'){
    const o=DATA.overview||{};
    rows=`<div style="display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-bottom:1px solid var(--border)"><div><div style="font-size:13px;font-weight:600;color:var(--text)">Fineco</div><div style="font-size:11px;color:var(--text3)">Conto corrente</div></div><div style="font-size:15px;font-weight:700;font-family:var(--mono)">${eur(o.cashFineco)}</div></div>
    <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 0"><div><div style="font-size:13px;font-weight:600;color:var(--text)">Kraken</div><div style="font-size:11px;color:var(--text3)">Exchange</div></div><div style="font-size:15px;font-weight:700;font-family:var(--mono)">${eur(o.cashKraken)}</div></div>`;
  } else {
    rows=pos.map(p=>{
      const pp=rawPct(p.pnlPct).toFixed(2),pc=parseFloat(pp)>=0?'var(--green)':'var(--red)';
      const bw=tot>0?((p.mv/tot)*100).toFixed(0):0;
      return `<div style="display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-bottom:1px solid var(--border)">
        <div style="flex:1;min-width:0;margin-right:16px"><div style="font-size:14px;font-weight:700;color:var(--text)">${p.ticker}</div><div style="font-size:11px;color:var(--text3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.nome}</div><div style="height:3px;background:var(--surface3);border-radius:2px;margin-top:7px"><div style="height:100%;width:${bw}%;background:${AC_COLOR[ac]||'var(--blue)'};border-radius:2px"></div></div></div>
        <div style="text-align:right;flex-shrink:0"><div style="font-size:15px;font-weight:700;font-family:var(--mono)">${eur(p.mv)}</div><div style="font-size:13px;font-weight:700;font-family:var(--mono);color:${pc}">${parseFloat(pp)>=0?'+':''}${pp}%</div></div>
      </div>`;
    }).join('');
  }
  detail.innerHTML=`<div style="display:flex;justify-content:space-between;align-items:center;padding-bottom:12px;border-bottom:1px solid var(--border2);margin-bottom:4px"><span style="font-size:14px;font-weight:700;color:${AC_COLOR[ac]||'var(--text)'}">${ac}</span><span style="font-size:14px;font-family:var(--mono);font-weight:700">${pct}% · ${eur(val)}</span></div>${rows}`;
}

// ═══════ PERFORMANCE — 4 GRAFICI ═══════
function performance() {
  const perf=DATA.performance||[];
  if(!perf.length) return '<div class="empty">Nessun dato performance.<br>Il sistema registra ogni giorno alle 18:00.</div>';
  const filtered=filterPerf(perf);

  const modeButtons=`<div class="perf-switch">
    <button class="perf-switch-btn ${PERF_MODE==='twr'?'active':''}" onclick="setPerfMode('twr')">📈 TWR %</button>
    <button class="perf-switch-btn ${PERF_MODE==='nav'?'active':''}" onclick="setPerfMode('nav')">💶 NAV €</button>
    <button class="perf-switch-btn ${PERF_MODE==='tot'?'active':''}" onclick="setPerfMode('tot')">🏦 Totale €</button>
    <button class="perf-switch-btn ${PERF_MODE==='alloc'?'active':''}" onclick="setPerfMode('alloc')">🥧 Alloc %</button>
  </div>`;

  const periodButtons=`<div class="period-wrap">
    ${['1S','1M','3M','ALL'].map(p=>`<button class="period-btn ${PERF_PERIOD===p?'active':''}" onclick="setPeriod('${p}')">${p}</button>`).join('')}
  </div>`;

  const labels=buildChartLabels(filtered,'data');

  if(PERF_MODE==='twr') {
    const last=filtered[filtered.length-1];
    const twr=last.twr*100;
    const msci=last.msci!==null?last.msci*100:null;
    const sp=last.sp!==null?last.sp*100:null;
    const tc=twr>=0?'var(--green)':'var(--red)';
    const chart=buildTWRChart(filtered);
    const benchRows=[
      {label:'TWR Cumulato',val:twr,color:tc},
      msci!==null?{label:'MSCI World',val:msci,color:'var(--blue)'}:null,
      sp!==null?{label:'S&P 500',val:sp,color:'var(--violet)'}:null,
      msci!==null?{label:'Active vs MSCI',val:twr-msci,color:twr-msci>=0?'var(--green)':'var(--red)'}:null,
    ].filter(Boolean).map(r=>`<div class="bench-row"><span class="bench-label">${r.label}</span><span class="bench-val" style="color:${r.color}">${r.val>=0?'+':''}${r.val.toFixed(2)}%</span></div>`).join('');
    const hist=[...filtered].reverse().slice(0,10).map(p=>{
      const t=(p.twr*100).toFixed(2),c=parseFloat(t)>=0?'var(--green)':'var(--red)';
      return `<div class="bench-row"><span style="font-size:11px;color:var(--text3)">${p.data}</span><span style="font-family:var(--mono);font-size:12px;font-weight:600;color:${c}">${parseFloat(t)>=0?'+':''}${t}%</span></div>`;
    }).join('');
    return `<div class="card">
      <div class="perf-hero"><div class="perf-twr" style="color:${tc}">${twr>=0?'+':''}${twr.toFixed(2)}%</div><div class="perf-sub">TWR · ${filtered.length} giorni</div></div>
      ${modeButtons}${periodButtons}
      <div class="chart-wrap">${chart}</div>
      <div class="chart-labels">${labels}</div>
      <div style="display:flex;gap:14px;margin-top:8px;font-size:10px;color:var(--text3)">
        <span><span style="color:var(--green)">●</span> TWR</span>
        ${msci?`<span><span style="color:var(--blue)">●</span> MSCI</span>`:''}
        ${sp?`<span><span style="color:var(--violet)">●</span> S&P 500</span>`:''}
      </div>
    </div>
    <div class="card">${benchRows}</div>
    <div class="card"><div class="section-title">Storico giornaliero</div>${hist}</div>`;
  }

  if(PERF_MODE==='nav') {
    const navVals=filtered.map(p=>p.nav).filter(v=>v>0);
    const last=navVals[navVals.length-1]||0;
    const first=navVals[0]||0;
    const change=first>0?((last-first)/first*100):0;
    const chart=buildEurChart(filtered,'nav','var(--blue)');
    return `<div class="card">
      <div class="perf-hero"><div class="perf-twr" style="color:var(--blue)">${eur(last)}</div><div class="perf-sub">NAV Gestito · ${filtered.length} giorni</div></div>
      ${modeButtons}${periodButtons}
      <div class="chart-wrap">${chart}</div>
      <div class="chart-labels">${labels}</div>
    </div>
    <div class="card">
      <div class="bench-row"><span class="bench-label">Valore attuale</span><span class="bench-val">${eur(last)}</span></div>
      <div class="bench-row"><span class="bench-label">Variazione periodo</span><span class="bench-val" style="color:${change>=0?'var(--green)':'var(--red)'}">${change>=0?'+':''}${change.toFixed(2)}%</span></div>
      <div class="bench-row"><span class="bench-label">Massimo</span><span class="bench-val">${eur(Math.max(...navVals))}</span></div>
      <div class="bench-row"><span class="bench-label">Minimo</span><span class="bench-val">${eur(Math.min(...navVals))}</span></div>
    </div>`;
  }

  if(PERF_MODE==='tot') {
    const totVals=filtered.map(p=>p.patrimonio).filter(v=>v&&v>0);
    const last=totVals[totVals.length-1]||0;
    const first=totVals[0]||0;
    const change=first>0?((last-first)/first*100):0;
    const chart=totVals.length>1?buildEurChart(filtered,'patrimonio','var(--violet)'):'<div class="empty">Dati patrimonio totale non disponibili</div>';
    const o=DATA.overview||{};
    return `<div class="card">
      <div class="perf-hero"><div class="perf-twr" style="color:var(--violet)">${eur(last||o.navTotale)}</div><div class="perf-sub">Patrimonio Totale · ${filtered.length} giorni</div></div>
      ${modeButtons}${periodButtons}
      <div class="chart-wrap">${chart}</div>
      <div class="chart-labels">${labels}</div>
    </div>
    <div class="card">
      <div class="bench-row"><span class="bench-label">Totale oggi</span><span class="bench-val" style="color:var(--violet)">${eur(o.navTotale)}</span></div>
      <div class="bench-row"><span class="bench-label">Gestito</span><span class="bench-val" style="color:var(--green)">${eur(o.navGestito)}</span></div>
      <div class="bench-row"><span class="bench-label">Stabile (pensioni)</span><span class="bench-val">${eur(o.navStabile)}</span></div>
      <div class="bench-row"><span class="bench-label">Variazione periodo</span><span class="bench-val" style="color:${change>=0?'var(--green)':'var(--red)'}">${change>=0?'+':''}${change.toFixed(2)}%</span></div>
    </div>`;
  }

  if(PERF_MODE==='alloc') {
    const chart=buildAllocChart(filtered);
    const last=filtered[filtered.length-1];
    return `<div class="card">
      <div class="perf-hero"><div style="font-size:18px;font-weight:700;color:var(--text)">Allocazione nel tempo</div><div class="perf-sub">Distribuzione % asset class · ${filtered.length} giorni</div></div>
      ${modeButtons}${periodButtons}
      <div class="chart-wrap">${chart}</div>
      <div class="chart-labels">${labels}</div>
      <div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:12px;font-size:10px">
        <span><span style="color:var(--violet)">●</span> Azioni</span>
        <span><span style="color:var(--blue)">●</span> ETF</span>
        <span><span style="color:var(--green)">●</span> Cash</span>
        <span><span style="color:var(--amber)">●</span> Crypto</span>
      </div>
    </div>
    <div class="card">
      <div class="section-title">Allocazione attuale</div>
      ${last&&last.pctAzioni!==null?`<div class="bench-row"><span class="bench-label">Azioni</span><span class="bench-val" style="color:var(--violet)">${(rawPct(last.pctAzioni)).toFixed(1)}%</span></div>`:''}
      ${last&&last.pctEtf!==null?`<div class="bench-row"><span class="bench-label">ETF</span><span class="bench-val" style="color:var(--blue)">${(rawPct(last.pctEtf)).toFixed(1)}%</span></div>`:''}
      ${last&&last.pctCash!==null?`<div class="bench-row"><span class="bench-label">Cash</span><span class="bench-val" style="color:var(--green)">${(rawPct(last.pctCash)).toFixed(1)}%</span></div>`:''}
      ${last&&last.pctCrypto!==null?`<div class="bench-row"><span class="bench-label">Crypto</span><span class="bench-val" style="color:var(--amber)">${(rawPct(last.pctCrypto)).toFixed(1)}%</span></div>`:''}
    </div>`;
  }
}

function filterPerf(perf) {
  if(PERF_PERIOD==='ALL') return perf;
  const days={'1S':7,'1M':30,'3M':90}[PERF_PERIOD]||999;
  return perf.slice(-days);
}
function setPerfMode(m){PERF_MODE=m;renderTab('performance');}
function setPeriod(p){PERF_PERIOD=p;renderTab('performance');}
function buildChartLabels(data,key){return data.filter((_,i)=>i%Math.max(1,Math.floor(data.length/5))===0).map(p=>`<span class="chart-label">${p[key]}</span>`).join('');}

// ─── TWR Chart con S&P ───────────────────────────────────
function buildTWRChart(perf) {
  const W=320,H=130,PL=42,PR=10,PT=12,PB=8;
  const tv=perf.map(p=>p.twr*100);
  const mv=perf.map(p=>p.msci!==null?p.msci*100:null).filter(v=>v!==null);
  const sv=perf.map(p=>p.sp!==null?p.sp*100:null).filter(v=>v!==null);
  const all=[...tv,...mv,...sv];
  const minV=Math.min(...all)-0.3,maxV=Math.max(...all)+0.3,rng=maxV-minV||1;
  const cW=W-PL-PR,cH=H-PT-PB;
  function xp(i,len){return PL+(i/Math.max(len-1,1))*cW;}
  function yp(v){return PT+cH-((v-minV)/rng)*cH;}
  function pts(arr){return arr.map((v,i)=>`${xp(i,arr.length).toFixed(1)},${yp(v).toFixed(1)}`).join(' ');}
  const ticks=5,tickArr=Array.from({length:ticks},(_,i)=>minV+(rng/(ticks-1))*i);
  let yAxis='';
  tickArr.forEach(t=>{const y=yp(t).toFixed(1);yAxis+=`<line x1="${PL}" y1="${y}" x2="${W-PR}" y2="${y}" stroke="rgba(255,255,255,0.05)" stroke-width="1"/><text x="${PL-4}" y="${y}" text-anchor="end" dominant-baseline="middle" font-size="8" fill="var(--text4)">${t>=0?'+':''}${t.toFixed(1)}%</text>`;});
  const zY=yp(0).toFixed(1);
  const areaPath=`M ${PL},${zY} ${tv.map((v,i)=>`L ${xp(i,tv.length).toFixed(1)},${yp(v).toFixed(1)}`).join(' ')} L ${(PL+cW).toFixed(1)},${zY} Z`;
  const li=tv.length-1,lx=xp(li,tv.length).toFixed(1),ly=yp(tv[li]).toFixed(1);
  const svPts=sv.length>1?`<polyline points="${pts(sv)}" fill="none" stroke="var(--violet)" stroke-width="1.5" stroke-opacity="0.7" stroke-dasharray="3,2"/>`:'';
  const mvPts=mv.length>1?`<polyline points="${pts(mv)}" fill="none" stroke="var(--blue)" stroke-width="1.5" stroke-opacity="0.7" stroke-dasharray="3,2"/>`:'';
  return `<svg class="chart" viewBox="0 0 ${W} ${H}">
    <defs><linearGradient id="ag" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="var(--green)" stop-opacity="0.25"/><stop offset="100%" stop-color="var(--green)" stop-opacity="0"/></linearGradient></defs>
    ${yAxis}
    <line x1="${PL}" y1="${zY}" x2="${W-PR}" y2="${zY}" stroke="rgba(255,255,255,0.12)" stroke-width="1" stroke-dasharray="3,3"/>
    <path d="${areaPath}" fill="url(#ag)"/>
    ${svPts}${mvPts}
    <polyline points="${pts(tv)}" fill="none" stroke="var(--green)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="${lx}" cy="${ly}" r="4" fill="var(--green)"/>
  </svg>`;
}

// ─── NAV / Totale Chart ──────────────────────────────────
function buildEurChart(perf, key, strokeColor) {
  const W=320,H=130,PL=52,PR=10,PT=12,PB=8;
  const vals=perf.map(p=>p[key]||0).filter(v=>v>0);
  if(!vals.length) return '<div class="empty">Dati non disponibili</div>';
  const minV=Math.min(...vals)*0.995,maxV=Math.max(...vals)*1.005,rng=maxV-minV||1;
  const cW=W-PL-PR,cH=H-PT-PB;
  function xp(i,len){return PL+(i/Math.max(len-1,1))*cW;}
  function yp(v){return PT+cH-((v-minV)/rng)*cH;}
  function pts(arr){return arr.map((v,i)=>`${xp(i,arr.length).toFixed(1)},${yp(v).toFixed(1)}`).join(' ');}
  const ticks=4,tickArr=Array.from({length:ticks},(_,i)=>minV+(rng/(ticks-1))*i);
  let yAxis='';
  tickArr.forEach(t=>{const y=yp(t).toFixed(1);const lbl=t>=10000?`${(t/1000).toFixed(0)}k`:eur(t,0).replace('€','').replace(/\s/g,'').trim();yAxis+=`<line x1="${PL}" y1="${y}" x2="${W-PR}" y2="${y}" stroke="rgba(255,255,255,0.05)" stroke-width="1"/><text x="${PL-4}" y="${y}" text-anchor="end" dominant-baseline="middle" font-size="8" fill="var(--text4)">€${lbl}</text>`;});
  const li=vals.length-1,lx=xp(li,vals.length).toFixed(1),ly=yp(vals[li]).toFixed(1);
  const bottomY=(PT+cH).toFixed(1);
  const areaPath=`M ${PL},${bottomY} ${vals.map((v,i)=>`L ${xp(i,vals.length).toFixed(1)},${yp(v).toFixed(1)}`).join(' ')} L ${(PL+cW).toFixed(1)},${bottomY} Z`;
  return `<svg class="chart" viewBox="0 0 ${W} ${H}">
    <defs><linearGradient id="eg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${strokeColor}" stop-opacity="0.25"/><stop offset="100%" stop-color="${strokeColor}" stop-opacity="0"/></linearGradient></defs>
    ${yAxis}
    <path d="${areaPath}" fill="url(#eg)"/>
    <polyline points="${pts(vals)}" fill="none" stroke="${strokeColor}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="${lx}" cy="${ly}" r="4" fill="${strokeColor}"/>
  </svg>`;
}

// ─── Allocation Chart (area stacked) ────────────────────
function buildAllocChart(perf) {
  const W=320,H=130,PL=28,PR=10,PT=8,PB=8;
  const cW=W-PL-PR,cH=H-PT-PB;
  const valid=perf.filter(p=>p.pctAzioni!==null);
  if(!valid.length) return '<div class="empty">Dati allocazione non disponibili</div>';
  const colors=['var(--violet)','var(--blue)','var(--green)','var(--amber)'];
  const keys=['pctAzioni','pctEtf','pctCash','pctCrypto'];
  function xp(i){return PL+(i/Math.max(valid.length-1,1))*cW;}
  function yp(v){return PT+cH-(v/100)*cH;}
  let yAxis='';
  [0,25,50,75,100].forEach(t=>{const y=yp(t).toFixed(1);yAxis+=`<line x1="${PL}" y1="${y}" x2="${W-PR}" y2="${y}" stroke="rgba(255,255,255,0.06)" stroke-width="1"/><text x="${PL-4}" y="${y}" text-anchor="end" dominant-baseline="middle" font-size="8" fill="var(--text4)">${t}%</text>`;});
  let lines='';
  keys.forEach((key,ki)=>{
    const pts=valid.map((p,i)=>`${xp(i).toFixed(1)},${yp(rawPct(p[key]||0)).toFixed(1)}`).join(' ');
    lines+=`<polyline points="${pts}" fill="none" stroke="${colors[ki]}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" stroke-opacity="0.85"/>`;
    const li=valid.length-1;
    lines+=`<circle cx="${xp(li).toFixed(1)}" cy="${yp(rawPct(valid[li][key]||0)).toFixed(1)}" r="3" fill="${colors[ki]}"/>`;
  });
  return `<svg class="chart" viewBox="0 0 ${W} ${H}">${yAxis}${lines}</svg>`;
}

// ═══════ POSIZIONI ═══════
function posizioni() {
  const pos=DATA.posizioni||[];
  if(!pos.length) return '<div class="empty">Nessuna posizione aperta.</div>';
  const sorted=[...pos].sort((a,b)=>{
    let va=a[POS_SORT.col],vb=b[POS_SORT.col];
    if(typeof va==='string'){va=va.toLowerCase();vb=vb.toLowerCase();}
    va=va||0;vb=vb||0;
    return POS_SORT.dir*(va>vb?1:va<vb?-1:0);
  });
  const tot=sorted.reduce((s,p)=>s+(p.mv||0),0);
  function th(label,colKey){
    const active=POS_SORT.col===colKey,arrow=active?(POS_SORT.dir===1?'↑':'↓'):'';
    return `<th class="${active?'sort-active':''}" style="text-align:${colKey==='ticker'?'left':'right'}" onclick="sortPos('${colKey}')">${label}${arrow?` ${arrow}`:''}</th>`;
  }
  const rows=sorted.map(p=>{
    const c=AC_COLOR[p.ac]||'#888',bg=AC_BG[p.ac]||'#1e293b';
    const pp=rawPct(p.pnlPct),pc=pp>=0?'var(--green)':'var(--red)';
    const bw=tot>0?Math.min((p.mv/tot)*100,100):0;
    const isOpen=EXPANDED_POS===p.ticker;
    const detailRow=isOpen?`<tr class="pos-detail-row"><td colspan="3" style="padding:0 0 8px">
      <div style="background:rgba(64,144,255,0.07);border:1px solid rgba(64,144,255,0.2);border-radius:var(--radius-sm);padding:14px 16px;animation:fadeIn 0.2s ease">
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px 16px;margin-bottom:12px">
          <div><div style="font-size:9px;color:var(--text3);font-weight:700;text-transform:uppercase;letter-spacing:0.6px;margin-bottom:3px">Market Value</div><div style="font-size:15px;font-weight:700;font-family:var(--mono)">${eur(p.mv)}</div></div>
          <div><div style="font-size:9px;color:var(--text3);font-weight:700;text-transform:uppercase;letter-spacing:0.6px;margin-bottom:3px">P&L €</div><div style="font-size:15px;font-weight:700;font-family:var(--mono);color:${pc}">${pp>=0?'+':''}${eur(p.pnlEur)}</div></div>
          <div><div style="font-size:9px;color:var(--text3);font-weight:700;text-transform:uppercase;letter-spacing:0.6px;margin-bottom:3px">Peso ptf</div><div style="font-size:15px;font-weight:700;font-family:var(--mono)">${bw.toFixed(1)}%</div></div>
          <div><div style="font-size:9px;color:var(--text3);font-weight:700;text-transform:uppercase;letter-spacing:0.6px;margin-bottom:3px">Prezzo</div><div style="font-size:15px;font-weight:700;font-family:var(--mono)">${eur(p.price,2)}</div></div>
          <div><div style="font-size:9px;color:var(--text3);font-weight:700;text-transform:uppercase;letter-spacing:0.6px;margin-bottom:3px">Valuta</div><div style="font-size:15px;font-weight:700">${p.currency}</div></div>
          <div><div style="font-size:9px;color:var(--text3);font-weight:700;text-transform:uppercase;letter-spacing:0.6px;margin-bottom:3px">Asset Class</div><div style="margin-top:2px"><span class="badge" style="background:${bg};color:${c};font-size:10px;padding:3px 8px">${p.ac}</span></div></div>
        </div>
        <div style="height:5px;background:var(--surface3);border-radius:3px"><div style="height:100%;width:${bw.toFixed(1)}%;background:${c};border-radius:3px;transition:width 0.6s"></div></div>
      </div></td></tr>`:'';
    return `<tr onclick="togglePos('${p.ticker}')" style="cursor:pointer">
      <td><div style="display:flex;align-items:center;gap:10px">
        <div style="width:36px;height:36px;border-radius:9px;background:${bg};color:${c};display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:800;flex-shrink:0;font-family:var(--mono)">${p.ticker.split('.')[0].slice(0,3)}</div>
        <div style="min-width:0"><div style="font-size:13px;font-weight:700;color:var(--text)">${p.ticker}</div><div style="font-size:10px;color:var(--text3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:110px">${p.nome}</div></div>
      </div></td>
      <td class="num">${eur(p.mv)}</td>
      <td class="pct" style="color:${pc}">${pp>=0?'+':''}${pp.toFixed(2)}%</td>
    </tr>${detailRow}`;
  }).join('');
  return `<div class="card"><div class="section-title">◆ ${pos.length} Posizioni · ${eur(tot)} gestito</div>
    <table class="trx-table"><thead><tr>${th('Titolo','ticker')}${th('Valore','mv')}${th('P&L %','pnlPct')}</tr></thead><tbody>${rows}</tbody></table>
  </div>`;
}
function togglePos(ticker){EXPANDED_POS=EXPANDED_POS===ticker?null:ticker;renderTab('posizioni');}
function sortPos(col){if(POS_SORT.col===col)POS_SORT.dir*=-1;else{POS_SORT.col=col;POS_SORT.dir=-1;}renderTab('posizioni');}

// ═══════ MANDATE — sezioni collassabili ═══════
function mandate() {
  const m=DATA.mandate||[];
  if(!m.length) return '<div class="empty">Nessun dato mandate.</div>';
  const sColors={'L1 — Asset Class':'#4090ff','L2 — Geografia':'#18d98b','L3 — Settori':'#9b6dff','L4 — Valuta':'#ffb340'};
  let html='';
  Object.entries(MANDATE_SECTIONS).forEach(([sectionName,labels])=>{
    const rows=m.filter(row=>labels.includes(row.label));
    if(!rows.length) return;
    const isOpen=MANDATE_OPEN[sectionName];
    const ok=rows.filter(r=>r.status==='OK').length,total=rows.length;
    const allOk=ok===total,sColor=sColors[sectionName]||'var(--blue)';
    html+=`<div style="margin-bottom:10px">
      <div onclick="toggleMandate('${sectionName}')" style="display:flex;justify-content:space-between;align-items:center;padding:13px 16px;background:var(--surface);border:1px solid var(--border);border-radius:${isOpen?'var(--radius-sm) var(--radius-sm) 0 0':'var(--radius-sm)'};cursor:pointer">
        <div style="display:flex;align-items:center;gap:10px">
          <div style="width:3px;height:20px;background:${sColor};border-radius:2px"></div>
          <span style="font-size:13px;font-weight:700;color:var(--text)">${sectionName}</span>
        </div>
        <div style="display:flex;align-items:center;gap:10px">
          <span style="font-size:11px;color:${allOk?'var(--green)':'var(--amber)'};font-weight:600">${ok}/${total} OK</span>
          <span style="color:var(--text3);font-size:14px;transform:rotate(${isOpen?180:0}deg);display:inline-block;transition:transform 0.2s">▾</span>
        </div>
      </div>
      ${isOpen?`<div style="border:1px solid var(--border);border-top:none;border-radius:0 0 var(--radius-sm) var(--radius-sm);overflow:hidden">
        ${rows.map((row,i)=>buildMandateRow(row,i,rows.length)).join('')}
      </div>`:''}
    </div>`;
  });
  return html;
}

function buildMandateRow(row,i,total) {
  const cur=typeof row.current==='number'?row.current:0;
  const tgt=typeof row.target==='number'?row.target:0;
  const min=typeof row.min==='number'?row.min:0;
  const max=typeof row.max==='number'?row.max:1;
  const drift=cur-tgt,bw=Math.min(cur*100,100),tw=Math.min(tgt*100,100);
  const minW=Math.min(min*100,100),maxW=Math.min(max*100,100);
  const sc=row.status==='OK'?'var(--green)':row.status&&row.status.includes('SOTTO')?'var(--red)':'var(--amber)';
  const scBg=row.status==='OK'?'rgba(24,217,139,0.12)':row.status&&row.status.includes('SOTTO')?'rgba(255,77,106,0.12)':'rgba(255,179,64,0.12)';
  const fc=AC_COLOR[row.label]||'var(--blue)';
  const ds=drift>=0?`+${(drift*100).toFixed(1)}%`:`${(drift*100).toFixed(1)}%`;
  const dc=Math.abs(drift)>0.05?(drift>0?'var(--amber)':'var(--blue)'):'var(--text3)';
  const isLast=i===total-1;
  return `<div style="padding:14px 16px;${!isLast?'border-bottom:1px solid var(--border)':''}">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
      <span style="font-size:13px;font-weight:700;color:var(--text)">${row.label}</span>
      <span style="font-size:10px;font-weight:700;padding:3px 9px;border-radius:20px;background:${scBg};color:${sc}">${row.status||'OK'}</span>
    </div>
    <div style="height:8px;background:var(--surface2);border-radius:4px;position:relative;overflow:hidden;margin-bottom:8px">
      <div style="position:absolute;left:${minW.toFixed(1)}%;width:${(maxW-minW).toFixed(1)}%;height:100%;background:rgba(255,255,255,0.07)"></div>
      <div style="height:100%;width:${bw.toFixed(1)}%;background:${fc};border-radius:4px;transition:width 0.8s"></div>
      <div style="position:absolute;top:-2px;bottom:-2px;left:${tw.toFixed(1)}%;width:3px;background:rgba(255,255,255,0.8);border-radius:2px"></div>
    </div>
    <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text3)">
      <span>Attuale: <b style="color:var(--text2)">${(cur*100).toFixed(1)}%</b></span>
      <span>Target: <b style="color:var(--text2)">${(tgt*100).toFixed(0)}%</b></span>
      <span style="color:${dc}">Drift: <b>${ds}</b></span>
    </div>
    <div style="display:flex;justify-content:space-between;font-size:9px;color:var(--text4);margin-top:4px">
      <span>Min ${(min*100).toFixed(0)}%</span><span>Max ${(max*100).toFixed(0)}%</span>
    </div>
  </div>`;
}
function toggleMandate(name){MANDATE_OPEN[name]=!MANDATE_OPEN[name];renderTab('mandate');}

// ═══════ TRANSACTIONS ═══════
function transactions() {
  const trx=DATA.transactions||[];
  if(!trx.length) return '<div class="empty">Nessuna transazione trovata.</div>';
  const totAbs=trx.reduce((s,t)=>s+Math.abs(t.netto||0),0);
  const sorted=[...trx].sort((a,b)=>{
    let va=a[TRX_SORT.col]||0,vb=b[TRX_SORT.col]||0;
    if(typeof va==='string'){va=va.toLowerCase();vb=vb.toLowerCase();}
    return TRX_SORT.dir*(va>vb?1:va<vb?-1:0);
  });
  function th(label,colKey){
    const active=TRX_SORT.col===colKey,arrow=active?(TRX_SORT.dir===1?'↑':'↓'):'';
    return `<th class="${active?'sort-active':''}" style="text-align:${colKey==='ticker'?'left':'right'}" onclick="sortTrx('${colKey}')">${label}${arrow?` ${arrow}`:''}</th>`;
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
  return `<div class="card"><div class="section-title">≡ Ultime 50 transazioni</div>
    <table class="trx-table"><thead><tr>${th('Titolo','ticker')}${th('Importo','netto')}${th('%','pct')}</tr></thead><tbody>${rows}</tbody></table>
  </div>`;
}
function sortTrx(col){if(TRX_SORT.col===col)TRX_SORT.dir*=-1;else{TRX_SORT.col=col;TRX_SORT.dir=-1;}renderTab('transactions');}

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
function openForm(){document.getElementById('modal-overlay').classList.add('open');document.getElementById('modal-form').classList.add('open');document.getElementById('f-ticker').focus();}
function closeForm(){document.getElementById('modal-overlay').classList.remove('open');document.getElementById('modal-form').classList.remove('open');}
function setTipo(tipo,btn){FORM_TIPO=tipo;document.querySelectorAll('.radio-btn').forEach(b=>b.classList.remove('active'));btn.classList.add('active');updateFormSummary();}
function updateFormSummary(){
  const qty=parseFloat(document.getElementById('f-qty').value)||0,price=parseFloat(document.getElementById('f-price').value)||0,comm=parseFloat(document.getElementById('f-comm').value)||0;
  const ticker=document.getElementById('f-ticker').value.toUpperCase()||'—';
  if(!qty||!price){document.getElementById('form-summary').classList.remove('visible');return;}
  const totale=qty*price,netto=FORM_TIPO==='SELL'?totale-comm:-(totale+comm);
  document.getElementById('form-summary').classList.add('visible');
  document.getElementById('form-summary').innerHTML=`${FORM_TIPO} ${qty} × ${ticker} @ €${price.toFixed(2)}\nTotale: ${eur(totale,2)}  Comm: ${eur(comm,2)}  Netto: ${eur(Math.abs(netto),2)}`;
}
async function submitForm(){
  const ticker=document.getElementById('f-ticker').value.toUpperCase().trim(),nome=document.getElementById('f-nome').value.trim();
  const ac=document.getElementById('f-ac').value,qty=parseFloat(document.getElementById('f-qty').value);
  const price=parseFloat(document.getElementById('f-price').value),comm=parseFloat(document.getElementById('f-comm').value)||0;
  const date=document.getElementById('f-date').value,note=document.getElementById('f-note').value.trim();
  if(!ticker||!qty||!price||!date){alert('Compila Ticker, Quantità, Prezzo e Data');return;}
  const btn=document.getElementById('submit-btn');
  btn.classList.add('loading');btn.textContent='Salvataggio...';
  const totale=qty*price,netto=FORM_TIPO==='SELL'?totale-comm:-(totale+comm);
  try {
    const res=await fetch(`${SCRIPT_URL}?action=addTransaction`,{method:'POST',mode:'cors',headers:{'Content-Type':'application/json'},body:JSON.stringify({ticker,nome,ac,tipo:FORM_TIPO,qty,price,comm,totale,netto,date,note})});
    const d=await res.json();
    if(d.error) throw new Error(d.error);
    btn.classList.remove('loading');btn.classList.add('success');btn.textContent='✓ Salvato!';
    setTimeout(()=>{closeForm();btn.classList.remove('success');btn.textContent='Conferma operazione';loadData();},1200);
  } catch(e){
    btn.classList.remove('loading');btn.classList.add('error');btn.textContent='✕ Errore';
    setTimeout(()=>{btn.classList.remove('error');btn.textContent='Conferma operazione';},2000);
  }
}

// ═══════════════════════════════════════════════════════════
// NEWS SECTION — Finnhub API + Sentiment Bars
// ═══════════════════════════════════════════════════════════

const FINNHUB_KEY = 'd81okapr01qrojfci26gd81okapr01qrojfci270';

// Mapping ticker portafoglio → simbolo Finnhub
const NEWS_TICKERS = {
  'AMZN':    { sym: 'AMZN',  label: 'Amazon',   type: 'stock' },
  'SPOT':    { sym: 'SPOT',  label: 'Spotify',  type: 'stock' },
  'FISV':    { sym: 'FISV',  label: 'Fiserv',   type: 'stock' },
  'GRAB':    { sym: 'GRAB',  label: 'Grab',     type: 'stock' },
  'BABA':    { sym: 'BABA',  label: 'Alibaba',  type: 'stock' },
  'SWDA.MI': { sym: 'IWDA',  label: 'MSCI World', type: 'etf' },
  'AEME.PA': { sym: 'EEM',   label: 'Emerging', type: 'etf' },
  'SGLD.MI': { sym: 'GLD',   label: 'Gold ETC', type: 'etf' },
  'VDIV':    { sym: 'VDIV',  label: 'Dividendi EU', type: 'etf' },
  'LGCW':    { sym: 'PHO',   label: 'Water ETF', type: 'etf' },
  'XRP':     { sym: 'BINANCE:XRPUSDT', label: 'XRP', type: 'crypto' },
};

// Macro categories
const MACRO_CATEGORIES = ['general','forex','merger'];

let NEWS_TAB = 'macro'; // 'macro' | 'portfolio'
let NEWS_TICKER = null; // ticker selezionato
let NEWS_CACHE = {}; // cache per evitare chiamate duplicate
let NEWS_OPEN = null; // news espansa

function news() {
  return `
  <div style="display:flex;gap:0;margin-bottom:14px;background:var(--surface2);border-radius:var(--radius-sm);padding:3px">
    <button class="perf-switch-btn ${NEWS_TAB==='macro'?'active':''}" onclick="setNewsTab('macro')">🌍 Macro</button>
    <button class="perf-switch-btn ${NEWS_TAB==='portfolio'?'active':''}" onclick="setNewsTab('portfolio')">📊 Portfolio</button>
  </div>
  <div id="news-content">
    <div class="loading" style="height:40vh"><div class="spinner"></div><span>Caricamento news...</span></div>
  </div>`;
}

function setNewsTab(tab) {
  NEWS_TAB = tab;
  NEWS_TICKER = null;
  NEWS_OPEN = null;
  renderTab('news');
  // Carica subito dopo il render
  setTimeout(() => loadNews(), 50);
}

function selectNewsTicker(ticker) {
  NEWS_TICKER = ticker;
  NEWS_OPEN = null;
  loadNews();
}

async function loadNews() {
  const el = document.getElementById('news-content');
  if (!el) return;

  if (NEWS_TAB === 'macro') {
    el.innerHTML = buildNewsShell(null);
    await fetchMacroNews();
  } else {
    el.innerHTML = buildPortfolioShell();
    if (NEWS_TICKER) {
      await fetchTickerNews(NEWS_TICKER);
    } else {
      document.getElementById('news-list').innerHTML =
        '<div class="empty" style="padding:32px 0">Seleziona un titolo per vedere le news</div>';
    }
  }
}

function buildNewsShell(ticker) {
  return `<div id="news-list"><div class="loading" style="height:30vh"><div class="spinner"></div><span>Caricamento...</span></div></div>`;
}

function buildPortfolioShell() {
  // Pills dei ticker in portafoglio
  const pos = DATA.posizioni || [];
  const tickers = pos.map(p => p.ticker).filter(t => NEWS_TICKERS[t]);

  const pills = tickers.map(t => {
    const info = NEWS_TICKERS[t];
    const active = NEWS_TICKER === t;
    return `<button onclick="selectNewsTicker('${t}')" style="
      padding:6px 12px;border-radius:20px;border:1px solid ${active?'var(--blue)':'var(--border)'};
      background:${active?'var(--blue-bg)':'var(--surface2)'};color:${active?'var(--blue)':'var(--text2)'};
      font-size:11px;font-weight:600;cursor:pointer;white-space:nowrap;font-family:var(--font)
    ">${info.label}</button>`;
  }).join('');

  return `
  <div style="display:flex;gap:8px;overflow-x:auto;padding-bottom:10px;margin-bottom:14px;scrollbar-width:none">
    ${pills}
  </div>
  <div id="news-list">
    <div class="empty" style="padding:32px 0">Seleziona un titolo per vedere le news</div>
  </div>`;
}

async function fetchMacroNews() {
  const cacheKey = 'macro';
  const el = document.getElementById('news-list');
  if (!el) return;

  try {
    // Controlla cache (5 minuti)
    if (NEWS_CACHE[cacheKey] && Date.now() - NEWS_CACHE[cacheKey].ts < 300000) {
      renderNewsList(NEWS_CACHE[cacheKey].data, el);
      return;
    }

    const from = new Date(Date.now() - 86400000 * 3).toISOString().split('T')[0];
    const to = new Date().toISOString().split('T')[0];
    const url = `https://finnhub.io/api/v1/news?category=general&minId=0&token=${FINNHUB_KEY}`;

    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    // Filtra per qualità: solo fonti autorevoli
    const quality = data.filter(n =>
      n.headline && n.headline.length > 20 &&
      ['Reuters','Bloomberg','CNBC','Financial Times','WSJ','FT','MarketWatch','Barron\'s'].some(s =>
        (n.source||'').toLowerCase().includes(s.toLowerCase())
      )
    ).slice(0, 20);

    const items = quality.length > 0 ? quality : data.slice(0, 20);
    NEWS_CACHE[cacheKey] = { data: items, ts: Date.now() };
    renderNewsList(items, el);
  } catch(e) {
    el.innerHTML = `<div class="error-banner">Errore caricamento news: ${e.message}</div>`;
  }
}

async function fetchTickerNews(ticker) {
  const info = NEWS_TICKERS[ticker];
  if (!info) return;
  const el = document.getElementById('news-list');
  if (!el) return;

  el.innerHTML = '<div class="loading" style="height:20vh"><div class="spinner"></div></div>';

  const cacheKey = `ticker_${ticker}`;
  try {
    if (NEWS_CACHE[cacheKey] && Date.now() - NEWS_CACHE[cacheKey].ts < 300000) {
      renderNewsList(NEWS_CACHE[cacheKey].data, el);
      return;
    }

    const from = new Date(Date.now() - 86400000 * 7).toISOString().split('T')[0];
    const to = new Date().toISOString().split('T')[0];

    let url;
    if (info.type === 'crypto') {
      url = `https://finnhub.io/api/v1/news?category=crypto&token=${FINNHUB_KEY}`;
    } else {
      url = `https://finnhub.io/api/v1/company-news?symbol=${info.sym}&from=${from}&to=${to}&token=${FINNHUB_KEY}`;
    }

    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const items = data.slice(0, 20);
    NEWS_CACHE[cacheKey] = { data: items, ts: Date.now() };
    renderNewsList(items, el);
  } catch(e) {
    el.innerHTML = `<div class="error-banner">Errore: ${e.message}</div>`;
  }
}

function renderNewsList(items, el) {
  if (!items || !items.length) {
    el.innerHTML = '<div class="empty">Nessuna news disponibile</div>';
    return;
  }

  const html = items.map((n, i) => {
    const sentiment = getSentiment(n);
    const timeAgo = getTimeAgo(n.datetime);
    const isOpen = NEWS_OPEN === i;
    const summary = n.summary || n.headline || '';
    const summaryClean = summary.length > 300 ? summary.slice(0, 300) + '...' : summary;

    return `<div class="news-card-app ${isOpen?'open':''}" onclick="toggleNews(${i})">
      <div class="news-meta-row">
        <span class="news-source-badge">${n.source || '—'}</span>
        <span class="news-time-badge">${timeAgo}</span>
        <div style="margin-left:auto">${buildSentimentBars(sentiment)}</div>
      </div>
      <div class="news-headline">${n.headline || ''}</div>
      ${isOpen ? `<div class="news-expand-box">
        ${summaryClean ? `<p style="font-size:12px;color:var(--text2);line-height:1.65;margin-bottom:10px">${summaryClean}</p>` : ''}
        <a href="${n.url||'#'}" target="_blank" rel="noopener" onclick="event.stopPropagation()" style="font-size:11px;color:var(--blue);font-weight:600;text-decoration:none">Leggi articolo completo →</a>
      </div>` : ''}
    </div>`;
  }).join('');

  el.innerHTML = html;
}

function toggleNews(i) {
  NEWS_OPEN = NEWS_OPEN === i ? null : i;
  const el = document.getElementById('news-list');
  if (!el) return;
  // Ricarica solo la lista senza refetch
  const cacheKey = NEWS_TAB === 'macro' ? 'macro' : `ticker_${NEWS_TICKER}`;
  if (NEWS_CACHE[cacheKey]) {
    renderNewsList(NEWS_CACHE[cacheKey].data, el);
  }
}

function getSentiment(news) {
  // Finnhub non include sempre sentiment nei company-news
  // Usiamo il sentiment field se disponibile, altrimenti keyword-based
  if (typeof news.sentiment === 'number') return news.sentiment;

  // Keyword scoring semplice sul titolo
  const text = (news.headline || '').toLowerCase();
  let score = 0;
  const pos = ['beat','surge','jump','rise','gain','growth','profit','record','strong','up','high','buy','rally'];
  const neg = ['miss','fall','drop','decline','loss','weak','down','cut','risk','warn','crash','sell','fear'];
  pos.forEach(w => { if (text.includes(w)) score += 0.2; });
  neg.forEach(w => { if (text.includes(w)) score -= 0.2; });
  return Math.max(-1, Math.min(1, score));
}

function buildSentimentBars(score) {
  // Determina classe e colore basati sullo score
  let cls, color, label;
  if (score <= -0.6)      { cls='sent-vn';  color='#ff2d55'; label=''; }
  else if (score <= -0.2) { cls='sent-neg'; color='#ff6b81'; label=''; }
  else if (score < -0.05) { cls='sent-ln';  color='#ff9f43'; label=''; }
  else if (score <= 0.05) { cls='sent-neu'; color='#7a9ac0'; label=''; }
  else if (score < 0.2)   { cls='sent-lp';  color='#26de81'; label=''; }
  else if (score < 0.6)   { cls='sent-pos'; color='#20bf6b'; label=''; }
  else                    { cls='sent-vp';  color='#00d2a0'; label=''; }

  // Quante barre illuminare
  const lit = score <= -0.6 ? 5 : score <= -0.2 ? 3 : score < -0.05 ? 1 :
              score <= 0.05 ? 0 : score < 0.2 ? 1 : score < 0.6 ? 3 : 5;

  const bars = [4,7,10,13,16].map((h,i) => {
    const on = (score < 0 && i < lit) ||
               (score >= 0 && i < lit) ||
               (score <= 0.05 && score >= -0.05);
    const opacity = (score <= 0.05 && score >= -0.05) ? 0.3 : (on ? 1 : 0.15);
    return `<span style="
      display:inline-block;width:4px;height:${h}px;border-radius:1px;
      background:${on || (score<=0.05&&score>=-0.05) ? color : '#7a9ac0'};
      opacity:${opacity};vertical-align:bottom;margin:0 1px
    "></span>`;
  }).join('');

  return `<div style="display:inline-flex;align-items:flex-end;height:18px">${bars}</div>`;
}

function getTimeAgo(timestamp) {
  if (!timestamp) return '';
  const diff = Date.now() - timestamp * 1000;
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m fa`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h fa`;
  return `${Math.floor(hrs/24)}g fa`;
}
