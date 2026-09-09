// settings-assets.js — sezione "Previdenza e altri asset".
// Censimento degli asset non quotati, proprietà, rate ricorrenti e conguagli.

let AST_CACHE = null;        // { assets, rules }
let AST_FORM = null;         // asset in modifica, o {} per uno nuovo
let AST_MOVIMENTO = null;    // { assetId, nome, saldo }

const AST_TIPI = [
  ['pension',     'Fondo pensione'],
  ['tfr',         'TFR'],
  ['cash',        'Liquidità'],
  ['real_estate', 'Immobile'],
  ['insurance',   'Polizza'],
  ['other',       'Altro'],
];

registraSezione('previdenza', {
  area: 'investimenti',
  ordine: 3,
  titolo: 'Previdenza e altri asset',
  descrizione: 'TFR, fondi pensione, liquidità',
  badge: () => {
    if (!AST_CACHE) return null;
    const senzaRata = AST_CACHE.assets.filter(a =>
      (a.asset_type === 'pension' || a.asset_type === 'tfr')
      && !AST_CACHE.rules.some(r => r.asset_id === a.asset_id && r.active));
    if (senzaRata.length) {
      return { tipo: 'warn', testo: senzaRata.length === 1
        ? 'un fondo senza versamento'
        : `${senzaRata.length} fondi senza versamento` };
    }
    return null;
  },
  render: () => _renderAsset(),
});

function _renderAsset() {
  if (!AST_CACHE) {
    _caricaAsset();
    return setHeader('Previdenza e altri asset') +
      '<div class="loading" style="height:30vh"><div class="spinner"></div></div>';
  }

  const { assets, rules } = AST_CACHE;

  if (!assets.length) {
    return setHeader('Previdenza e altri asset',
      'Quello che possiedi fuori dal portafoglio operativo') + `
      <div class="set-empty">
        <p>Non hai ancora censito nessun asset.</p>
        <button class="set-btn" onclick="nuovoAsset()">Aggiungi il primo</button>
      </div>`;
  }

  const schede = assets.map(a => _schedaAsset(a, rules)).join('');
  return setHeader('Previdenza e altri asset',
    'Quello che possiedi fuori dal portafoglio operativo')
    + schede
    + `<button class="ast-add" onclick="nuovoAsset()">+ Aggiungi un asset</button>`
    + _notaEsposizione();
}

function _schedaAsset(a, rules) {
  const rata = rules.find(r => r.asset_id === a.asset_id && r.active);
  const eq = Number(a.equity_share) || 0;

  const flag = [];
  if (a.actionable) flag.push(['on', 'movimentabile']);
  else flag.push(['', 'non movimentabile']);
  if (eq > 0) flag.push(['on', `${Math.round(eq * 100)}% azionario`]);
  else if (a.asset_type !== 'cash') flag.push(['', 'nessuna quota azionaria']);

  const perFreq = { monthly: 'mese', quarterly: 'trimestre', yearly: 'anno' };
  const rigaRata = rata
    ? `<span>Versamento</span><b>${Number(rata.amount_eur).toLocaleString('it-IT')} €/${perFreq[rata.frequency] || 'mese'}</b>`
    : `<span>Nessun versamento ricorrente</span><b>—</b>`;

  return `
  <div class="ast-card">
    <div class="ast-top">
      <div class="ast-n">${a.name}</div>
      <div class="ast-v">${Number(a.balance_eur).toLocaleString('it-IT',
        { minimumFractionDigits: 0, maximumFractionDigits: 0 })} €</div>
    </div>
    <div class="ast-flags">
      ${flag.map(([on, t]) => `<span class="ast-flag ${on}">${t}</span>`).join('')}
    </div>
    <div class="ast-b">${rigaRata}</div>
    <div class="ast-act">
      <button class="ast-link" onclick="modificaAsset('${a.asset_id}')">Impostazioni</button>
      <button class="ast-link" onclick="nuovoMovimento('${a.asset_id}')">Aggiorna saldo</button>
    </div>
  </div>`;
}

function _notaEsposizione() {
  const o = DATA.overview || {};
  const eq = Number(o.equityEur) || 0;
  const aum = Number(o.navAum) || 0;
  const op = Number(o.navGestito) || 0;
  if (!eq || !aum) return '';

  const pAum = Math.round(eq / aum * 100);
  const pOp = Math.round(eq / op * 100);
  if (pAum === pOp) return '';

  return `<div class="set-note">
    <b>Esposizione azionaria reale ${pAum}%.</b> Contando anche la quota azionaria
    degli asset previdenziali. Guardando solo il portafoglio operativo sembrerebbe
    il ${pOp}%: parte dell'esposizione non è movimentabile.
  </div>`;
}

async function _caricaAsset() {
  try {
    const [saldi, regole] = await Promise.all([
      sb.from('v_asset_balances').select('*').order('balance_eur', { ascending: false }),
      sb.from('recurring_rules').select('*'),
    ]);
    if (saldi.error) throw saldi.error;
    AST_CACHE = { assets: saldi.data || [], rules: regole.data || [] };
    renderTab('settings');
  } catch (e) {
    console.error('Lettura asset:', e.message || e);
  }
}

// ═══════════════════════════════════════════════════════════
// FORM ASSET
// ═══════════════════════════════════════════════════════════

function nuovoAsset() {
  AST_FORM = { name: '', asset_type: 'pension', in_aum: true, in_twr: false,
               actionable: false, equity_share: 0, saldo: '', rata: '', frequency: 'monthly' };
  _mostraFormAsset();
}

function modificaAsset(id) {
  const a = AST_CACHE.assets.find(x => x.asset_id === id);
  if (!a) return;
  const r = AST_CACHE.rules.find(x => x.asset_id === id && x.active);
  AST_FORM = {
    id,
    name: a.name,
    asset_type: a.asset_type,
    in_aum: a.in_aum,
    in_twr: a.in_twr,
    actionable: a.actionable,
    equity_share: Number(a.equity_share) || 0,
    rata: r ? String(r.amount_eur) : '',
    frequency: r ? r.frequency : 'monthly',
    ruleId: r ? r.id : null,
  };
  _mostraFormAsset();
}

function _mostraFormAsset() {
  let el = document.getElementById('edit-popup');
  if (!el) { el = document.createElement('div'); el.id = 'edit-popup'; document.body.appendChild(el); }

  const f = AST_FORM;
  const nuovo = !f.id;

  const tipi = AST_TIPI.map(([v, l]) =>
    `<option value="${v}" ${f.asset_type === v ? 'selected' : ''}>${l}</option>`).join('');

  el.innerHTML = `
    <div class="ep-back" onclick="chiudiFormAsset()"></div>
    <div class="ep-box">
      <div class="ep-q">${nuovo ? 'Nuovo asset' : f.name}</div>

      <div class="ast-f">
        <label>Nome</label>
        <input type="text" id="af-nome" value="${f.name}" placeholder="es. Fondo Pensione Amundi">
      </div>

      <div class="ast-f">
        <label>Tipo</label>
        <select id="af-tipo" onchange="_astPreset(this.value)">${tipi}</select>
      </div>

      ${nuovo ? `
      <div class="ast-f">
        <label>Saldo attuale €</label>
        <input type="text" inputmode="decimal" id="af-saldo" value="${f.saldo}"
          placeholder="es. 9721.98">
      </div>` : ''}

      <div class="ast-f">
        <label>Quota azionaria: <b id="af-eqv">${Math.round(f.equity_share * 100)}%</b></label>
        <input type="range" id="af-eq" min="0" max="100" step="5"
          value="${Math.round(f.equity_share * 100)}"
          oninput="document.getElementById('af-eqv').textContent=this.value+'%'">
        <div class="ast-hint">Per un fondo pensione, la quota azionaria della linea scelta.</div>
      </div>

      <div class="ast-sw">
        <div><b>Conta nel patrimonio</b>
          <small>Entra nel totale e nel calcolo dell'esposizione</small></div>
        <div class="ast-toggle ${f.in_aum ? 'on' : ''}" onclick="_astTog('in_aum',this)"></div>
      </div>
      <div class="ast-sw">
        <div><b>Movimentabile</b>
          <small>Puoi comprarlo o venderlo per ribilanciare</small></div>
        <div class="ast-toggle ${f.actionable ? 'on' : ''}" onclick="_astTog('actionable',this)"></div>
      </div>
      <div class="ast-sw">
        <div><b>Entra nel rendimento</b>
          <small>La sua performance incide sul TWR del portafoglio</small></div>
        <div class="ast-toggle ${f.in_twr ? 'on' : ''}" onclick="_astTog('in_twr',this)"></div>
      </div>

      <div class="ast-f" style="margin-top:14px">
        <label>Versamento ricorrente €</label>
        <div style="display:flex;gap:8px">
          <input type="text" inputmode="decimal" id="af-rata" value="${f.rata}"
            placeholder="lascia vuoto se non c'è" style="flex:1">
          <select id="af-freq" style="width:120px">
            <option value="monthly" ${f.frequency === 'monthly' ? 'selected' : ''}>al mese</option>
            <option value="quarterly" ${f.frequency === 'quarterly' ? 'selected' : ''}>a trimestre</option>
            <option value="yearly" ${f.frequency === 'yearly' ? 'selected' : ''}>all'anno</option>
          </select>
        </div>
        <div class="ast-hint">Meglio una stima per difetto: i conguagli si aggiungono dopo.</div>
      </div>

      <div class="ep-foot">
        ${nuovo ? '' : `<button class="ep-link" style="color:var(--red)"
          onclick="eliminaAsset('${f.id}')">Elimina</button>`}
        <button class="ep-link" onclick="chiudiFormAsset()">Annulla</button>
        <button class="ep-btn" id="af-salva" onclick="salvaAsset()">Salva</button>
      </div>
    </div>`;
}

// Preimposta le proprietà in base al tipo scelto
function _astPreset(tipo) {
  AST_FORM.asset_type = tipo;
  if (tipo === 'tfr') {
    Object.assign(AST_FORM, { in_aum: true, in_twr: false, actionable: false, equity_share: 0 });
  } else if (tipo === 'pension') {
    Object.assign(AST_FORM, { in_aum: true, in_twr: false, actionable: false });
  } else if (tipo === 'cash') {
    Object.assign(AST_FORM, { in_aum: true, in_twr: true, actionable: true, equity_share: 0 });
  } else if (tipo === 'real_estate') {
    Object.assign(AST_FORM, { in_aum: true, in_twr: false, actionable: false, equity_share: 0 });
  }
  AST_FORM.name = document.getElementById('af-nome').value;
  _mostraFormAsset();
}

function _astTog(campo, el) {
  AST_FORM[campo] = !AST_FORM[campo];
  el.classList.toggle('on');
}

function chiudiFormAsset() {
  const el = document.getElementById('edit-popup');
  if (el) el.remove();
  AST_FORM = null;
}

async function salvaAsset() {
  const btn = document.getElementById('af-salva');
  btn.disabled = true;
  btn.textContent = 'Salvo...';

  const f = AST_FORM;
  const nome = document.getElementById('af-nome').value.trim();
  const tipo = document.getElementById('af-tipo').value;
  const eq = Number(document.getElementById('af-eq').value) / 100;
  const rata = normalizzaImporto(document.getElementById('af-rata').value);
  const freq = document.getElementById('af-freq').value;

  if (!nome) {
    btn.disabled = false; btn.textContent = 'Serve un nome';
    setTimeout(() => { btn.textContent = 'Salva'; }, 1800);
    return;
  }

  try {
    const { data: sess } = await sb.auth.getSession();
    const uid = sess?.session?.user?.id;

    let assetId = f.id;

    if (assetId) {
      const { error } = await sb.from('assets').update({
        name: nome, asset_type: tipo, equity_share: eq,
        in_aum: f.in_aum, in_twr: f.in_twr, actionable: f.actionable,
      }).eq('id', assetId);
      if (error) throw error;
    } else {
      const { data, error } = await sb.from('assets').insert({
        user_id: uid, name: nome, asset_type: tipo, equity_share: eq,
        in_aum: f.in_aum, in_twr: f.in_twr, actionable: f.actionable,
      }).select('id').single();
      if (error) throw error;
      assetId = data.id;

      const saldo = normalizzaImporto(document.getElementById('af-saldo').value);
      if (isFinite(saldo) && saldo !== 0) {
        await sb.from('asset_movements').insert({
          user_id: uid, asset_id: assetId,
          movement_date: new Date().toISOString().split('T')[0],
          amount_eur: saldo, kind: 'opening', note: 'Saldo iniziale',
        });
      }
    }

    // rata ricorrente
    if (isFinite(rata) && rata > 0) {
      const riga = {
        user_id: uid, asset_id: assetId, amount_eur: rata,
        frequency: freq, day_of_month: 1,
        start_date: new Date().toISOString().split('T')[0],
        last_run_date: new Date().toISOString().split('T')[0],
        active: true,
      };
      if (f.ruleId) {
        await sb.from('recurring_rules')
          .update({ amount_eur: rata, frequency: freq, active: true })
          .eq('id', f.ruleId);
      } else {
        await sb.from('recurring_rules').insert(riga);
      }
    } else if (f.ruleId) {
      await sb.from('recurring_rules').update({ active: false }).eq('id', f.ruleId);
    }

    chiudiFormAsset();
    AST_CACHE = null;
    await loadData();
    renderTab('settings');

  } catch (e) {
    console.error('Salvataggio asset:', e.message || e);
    btn.disabled = false;
    btn.textContent = 'Riprova';
  }
}

async function eliminaAsset(id) {
  const a = AST_CACHE.assets.find(x => x.asset_id === id);
  if (!confirm(`Eliminare "${a ? a.name : 'questo asset'}" e tutti i suoi movimenti?`)) return;
  try {
    await sb.from('assets').delete().eq('id', id);
    chiudiFormAsset();
    AST_CACHE = null;
    await loadData();
    renderTab('settings');
  } catch (e) {
    console.error('Eliminazione asset:', e.message || e);
  }
}

// ═══════════════════════════════════════════════════════════
// AGGIORNAMENTO SALDO
// ═══════════════════════════════════════════════════════════

function nuovoMovimento(id) {
  const a = AST_CACHE.assets.find(x => x.asset_id === id);
  if (!a) return;
  AST_MOVIMENTO = { assetId: id, nome: a.name, saldo: Number(a.balance_eur) || 0, tipo: 'return' };
  _mostraFormMovimento();
}

function _mostraFormMovimento() {
  let el = document.getElementById('edit-popup');
  if (!el) { el = document.createElement('div'); el.id = 'edit-popup'; document.body.appendChild(el); }

  const m = AST_MOVIMENTO;
  el.innerHTML = `
    <div class="ep-back" onclick="chiudiFormMovimento()"></div>
    <div class="ep-box">
      <div class="ep-q">Aggiorna ${m.nome}</div>
      <div class="ep-hint">Il saldo calcolato è
        <b>${m.saldo.toLocaleString('it-IT', { minimumFractionDigits: 2 })} €</b>.
        Inserisci quello reale: la differenza viene registrata come movimento.</div>

      <div class="ast-f">
        <label>Saldo reale €</label>
        <input type="text" inputmode="decimal" id="am-saldo"
          placeholder="es. 10250.00" oninput="_amDiff()">
        <div class="ast-hint" id="am-diff"></div>
      </div>

      <div class="ast-f">
        <label>La differenza è</label>
        <div class="ast-seg">
          <div class="ast-sg on" onclick="_amTipo('return',this)">Rendimento</div>
          <div class="ast-sg" onclick="_amTipo('correction',this)">Versamento</div>
        </div>
        <div class="ast-hint">Se le rate reali sono diverse da quelle impostate, parte
          della differenza è versamento. In dubbio, lascia rendimento.</div>
      </div>

      <div class="ep-foot">
        <button class="ep-link" onclick="chiudiFormMovimento()">Annulla</button>
        <button class="ep-btn" id="am-salva" onclick="salvaMovimento()">Registra</button>
      </div>
    </div>`;
}

function _amDiff() {
  const reale = normalizzaImporto(document.getElementById('am-saldo').value);
  const el = document.getElementById('am-diff');
  if (!isFinite(reale)) { el.textContent = ''; return; }
  const d = reale - AST_MOVIMENTO.saldo;
  const segno = d >= 0 ? '+' : '';
  el.innerHTML = `Differenza: <b style="color:${d >= 0 ? 'var(--green)' : 'var(--red)'}">
    ${segno}${d.toLocaleString('it-IT', { minimumFractionDigits: 2 })} €</b>`;
}

function _amTipo(tipo, el) {
  AST_MOVIMENTO.tipo = tipo;
  document.querySelectorAll('.ast-sg').forEach(x => x.classList.remove('on'));
  el.classList.add('on');
}

async function salvaMovimento() {
  const btn = document.getElementById('am-salva');
  const reale = normalizzaImporto(document.getElementById('am-saldo').value);
  if (!isFinite(reale)) {
    btn.textContent = 'Importo non valido';
    setTimeout(() => { btn.textContent = 'Registra'; }, 1800);
    return;
  }

  const diff = reale - AST_MOVIMENTO.saldo;
  if (Math.abs(diff) < 0.01) { chiudiFormMovimento(); return; }

  btn.disabled = true;
  btn.textContent = 'Salvo...';

  try {
    const { data: sess } = await sb.auth.getSession();
    const { error } = await sb.from('asset_movements').insert({
      user_id: sess?.session?.user?.id,
      asset_id: AST_MOVIMENTO.assetId,
      movement_date: new Date().toISOString().split('T')[0],
      amount_eur: diff,
      kind: AST_MOVIMENTO.tipo,
      note: 'Allineamento al saldo reale',
    });
    if (error) throw error;

    chiudiFormMovimento();
    AST_CACHE = null;
    await loadData();
    renderTab('settings');
  } catch (e) {
    console.error('Registrazione movimento:', e.message || e);
    btn.disabled = false;
    btn.textContent = 'Riprova';
  }
}

function chiudiFormMovimento() {
  const el = document.getElementById('edit-popup');
  if (el) el.remove();
  AST_MOVIMENTO = null;
}
