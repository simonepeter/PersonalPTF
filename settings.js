// settings.js — tab Impostazioni: modifica target categorie e asset class.
// Va caricato DOPO data.js.

let SETTINGS_DRAFT = null;
let SETTINGS_SAVING = false;

// ─── Aggiunge la tab alla mappa di renderTab ───
const _renderTabBase = renderTab;
renderTab = function (tab) {
  if (tab === 'settings') {
    document.getElementById('page-content').innerHTML = settings();
    return;
  }
  return _renderTabBase(tab);
};

function settings() {
  if (!DATA) return '<div class="empty">Carica prima i dati.</div>';

  const cat = (DATA.mandateCategorie || []);
  const ass = (DATA.mandateAssetClass || []);

  const sommaCat = cat.reduce((s, r) => s + Number(r.target_weight || 0), 0);
  const sommaAss = ass.reduce((s, r) => s + Number(r.target_weight || 0), 0);

  return `
  <div class="card" style="margin-bottom:12px">
    <div class="section-title">⚙️ Target per categoria</div>
    <div style="font-size:11px;color:var(--text3);margin-bottom:12px">
      Vincolo primario: definisce il processo di investimento.
    </div>
    ${cat.map(r => _rowEditor('cat', r)).join('')}
    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px;padding-top:10px;border-top:1px solid var(--border)">
      <span style="font-size:11px;color:${Math.abs(sommaCat - 100) < 0.01 ? 'var(--text3)' : 'var(--amber)'}">
        Somma target: <b>${sommaCat.toFixed(0)}%</b>${Math.abs(sommaCat - 100) < 0.01 ? '' : ' — dovrebbe fare 100%'}
      </span>
      <button onclick="saveSettings('cat')" id="save-cat"
        style="background:var(--blue-bg);color:var(--blue);border:1px solid rgba(64,144,255,0.3);border-radius:var(--radius-xs);padding:8px 16px;cursor:pointer;font-size:12px;font-weight:700;font-family:var(--font)">
        Salva
      </button>
    </div>
  </div>

  <div class="card">
    <div class="section-title">📊 Target per asset class</div>
    <div style="font-size:11px;color:var(--text3);margin-bottom:12px">
      Lettura descrittiva dell'esposizione: bande larghe, non un vincolo operativo.
    </div>
    ${ass.map(r => _rowEditor('ass', r)).join('')}
    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px;padding-top:10px;border-top:1px solid var(--border)">
      <span style="font-size:11px;color:${Math.abs(sommaAss - 100) < 0.01 ? 'var(--text3)' : 'var(--amber)'}">
        Somma target: <b>${sommaAss.toFixed(0)}%</b>${Math.abs(sommaAss - 100) < 0.01 ? '' : ' — dovrebbe fare 100%'}
      </span>
      <button onclick="saveSettings('ass')" id="save-ass"
        style="background:var(--blue-bg);color:var(--blue);border:1px solid rgba(64,144,255,0.3);border-radius:var(--radius-xs);padding:8px 16px;cursor:pointer;font-size:12px;font-weight:700;font-family:var(--font)">
        Salva
      </button>
    </div>
  </div>

  <div style="font-size:10px;color:var(--text4);margin-top:14px;padding:0 4px">
    Le modifiche ai target categoria vengono storicizzate: il valore precedente resta
    consultabile con la sua data di validità.
  </div>`;
}

function _rowEditor(kind, r) {
  const key = kind === 'cat' ? r.category : r.asset_class;
  const label = kind === 'cat'
    ? ({ core: 'Core', satellite: 'Satellite', stocks: 'Stocks', speculative: 'Speculative' }[r.category] || r.category)
    : r.asset_class;

  const inp = (campo, val) => `
    <input type="number" step="1" min="0" max="100"
      id="set-${kind}-${key}-${campo}" value="${Number(val) || 0}"
      style="width:100%;background:var(--surface2);border:1px solid var(--border2);border-radius:var(--radius-xs);
             color:var(--text);font-family:var(--mono);font-size:13px;padding:7px 8px;outline:none;text-align:center">`;

  return `
  <div style="padding:12px 0;border-bottom:1px solid var(--border)">
    <div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:8px">${label}</div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">
      <div>
        <div style="font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">Min %</div>
        ${inp('min', r.min_weight)}
      </div>
      <div>
        <div style="font-size:9px;color:var(--blue);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">Target %</div>
        ${inp('target', r.target_weight)}
      </div>
      <div>
        <div style="font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">Max %</div>
        ${inp('max', r.max_weight)}
      </div>
    </div>
  </div>`;
}

function _readRow(kind, key) {
  const g = campo => parseFloat(document.getElementById(`set-${kind}-${key}-${campo}`).value) || 0;
  return { min: g('min'), target: g('target'), max: g('max') };
}

async function saveSettings(kind) {
  if (SETTINGS_SAVING) return;

  const rows = kind === 'cat' ? (DATA.mandateCategorie || []) : (DATA.mandateAssetClass || []);
  const btn = document.getElementById(kind === 'cat' ? 'save-cat' : 'save-ass');

  // validazione: banda coerente e somma target a 100
  const letti = rows.map(r => {
    const key = kind === 'cat' ? r.category : r.asset_class;
    return { key, riga: r, ...(_readRow(kind, key)) };
  });

  for (const l of letti) {
    if (l.min > l.target || l.target > l.max) {
      btn.textContent = '✕ Banda incoerente';
      setTimeout(() => { btn.textContent = 'Salva'; }, 2200);
      return;
    }
  }

  const somma = letti.reduce((s, l) => s + l.target, 0);
  if (Math.abs(somma - 100) > 0.01) {
    btn.textContent = `✕ Somma ${somma.toFixed(0)}%`;
    setTimeout(() => { btn.textContent = 'Salva'; }, 2200);
    return;
  }

  SETTINGS_SAVING = true;
  btn.textContent = 'Salvataggio...';

  try {
    if (kind === 'cat') {
      // storicizzazione: chiude la riga corrente e ne inserisce una nuova
      for (const l of letti) {
        const cambiato = l.min !== Number(l.riga.min_weight)
          || l.target !== Number(l.riga.target_weight)
          || l.max !== Number(l.riga.max_weight);
        if (!cambiato) continue;

        const { error: e1 } = await sb.from('category_targets')
          .update({ valid_to: new Date().toISOString() })
          .eq('id', l.riga.id);
        if (e1) throw e1;

        const { error: e2 } = await sb.from('category_targets').insert({
          category: l.key,
          target_weight: l.target,
          min_weight: l.min,
          max_weight: l.max,
        });
        if (e2) throw e2;
      }
    } else {
      for (const l of letti) {
        const { error } = await sb.from('mandate')
          .update({
            target_weight: l.target,
            min_weight: l.min,
            max_weight: l.max,
            updated_at: new Date().toISOString(),
          })
          .eq('id', l.riga.id);
        if (error) throw error;
      }
    }

    btn.textContent = '✓ Salvato';
    await loadData();
    setTimeout(() => { renderTab('settings'); }, 400);

  } catch (e) {
    btn.textContent = '✕ Errore';
    console.error('Salvataggio impostazioni:', e.message || e);
    setTimeout(() => { btn.textContent = 'Salva'; }, 2200);
  }

  SETTINGS_SAVING = false;
}

// ─── Aggiornamento prezzi on-demand ───
async function refreshPrices(btn) {
  if (!btn) btn = document.getElementById('refresh-prices-btn');
  const testo = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = '⏳'; }

  try {
    const res = await fetch('/api/prices');
    const d = await res.json();
    if (d.error) throw new Error(d.error);

    if (btn) btn.textContent = `✓ ${d.aggiornati}`;
    await loadData();
    setTimeout(() => {
      if (btn) { btn.textContent = testo || '↻'; btn.disabled = false; }
    }, 1500);

  } catch (e) {
    if (btn) btn.textContent = '✕';
    console.error('Aggiornamento prezzi:', e.message || e);
    setTimeout(() => {
      if (btn) { btn.textContent = testo || '↻'; btn.disabled = false; }
    }, 2000);
  }
}
