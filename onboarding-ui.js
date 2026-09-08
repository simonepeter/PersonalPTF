// onboarding-ui.js — schermate dell'onboarding e navigazione.
// Usa profile-logic.js (visibilità, profilo) e profile-store.js (persistenza).
// Va caricato DOPO entrambi.

let OB = {
  attivo: false,
  fase: 'intro',        // intro | setup | profile | fine
  questions: [],
  answers: {},
  indice: 0,
  percorso: 'completo', // completo | minimo
  salvando: false,
};

// ═══════════════════════════════════════════════════════════
// AVVIO
// ═══════════════════════════════════════════════════════════

async function checkOnboarding() {
  try {
    const stato = await onboardingStatus();
    OB.questions = stato.questions;
    OB.answers = stato.answers;

    if (!stato.setupCompletato) { startOnboarding('intro'); return false; }
    return true;                          // setup fatto: l'app può partire
  } catch (e) {
    console.error('Controllo onboarding:', e.message || e);
    return true;                          // in caso di errore non blocchiamo l'app
  }
}

function startOnboarding(fase = 'intro') {
  OB.attivo = true;
  OB.fase = fase;
  OB.indice = (fase === 'intro') ? 0 : primaSenzaRisposta(fase);
  document.getElementById('app').style.display = 'none';
  renderOnboarding();
}

function endOnboarding() {
  OB.attivo = false;
  const el = document.getElementById('onboarding-screen');
  if (el) el.remove();
  document.getElementById('app').style.display = '';
  loadData();
}

// Riprende il profilo dalla prima domanda senza risposta.
async function resumeProfile() {
  const stato = await onboardingStatus();
  OB.questions = stato.questions;
  OB.answers = stato.answers;
  OB.percorso = 'completo';
  OB.attivo = true;
  OB.fase = 'profile';
  OB.indice = primaSenzaRisposta('profile');
  document.getElementById('app').style.display = 'none';
  renderOnboarding();
}

// Indice della prima domanda visibile ancora senza risposta.
// Se sono tutte risposte, torna all'ultima.
function primaSenzaRisposta(fase) {
  const lista = visibleQuestions(OB.questions, OB.answers, fase);
  const i = lista.findIndex(q => {
    const a = OB.answers[q.code];
    return a === undefined || a === null || a === ''
      || (Array.isArray(a) && a.length === 0);
  });
  return i >= 0 ? i : Math.max(0, lista.length - 1);
}

// ═══════════════════════════════════════════════════════════
// DOMANDE DELLA FASE CORRENTE
// ═══════════════════════════════════════════════════════════

function domandeCorrenti() {
  return visibleQuestions(OB.questions, OB.answers, OB.fase);
}

// ═══════════════════════════════════════════════════════════
// RENDERING
// ═══════════════════════════════════════════════════════════

function renderOnboarding() {
  let el = document.getElementById('onboarding-screen');
  if (!el) {
    el = document.createElement('div');
    el.id = 'onboarding-screen';
    el.className = 'ob-screen';
    document.body.appendChild(el);
  }

  if (OB.fase === 'intro')      el.innerHTML = obIntro();
  else if (OB.fase === 'fine')  el.innerHTML = obFine();
  else                          el.innerHTML = obDomanda();
}

function obIntro() {
  return `
  <div class="ob-body">
    <div class="ob-mark">P</div>
    <div class="ob-lead">Prima di iniziare, due minuti su di te.</div>
    <p class="ob-para">Servono quattro risposte per far funzionare l'app. Poi, se vuoi,
      ci sono altre domande che permettono agli assistenti di darti consigli su misura
      invece che generici.</p>
    <div class="ob-cards">
      <div class="ob-card pri" onclick="obScegli('completo')">
        <b>Facciamo tutto adesso</b>
        <span>Setup e profilo completo. Gli assistenti saranno operativi da subito.</span>
        <div class="ob-meta">circa 6 minuti</div>
      </div>
      <div class="ob-card" onclick="obScegli('minimo')">
        <b>Solo l'essenziale</b>
        <span>Quattro domande e sei dentro. Il profilo lo completi quando vuoi.</span>
        <div class="ob-meta">circa 1 minuto</div>
      </div>
    </div>
    <div class="ob-spacer"></div>
    <p class="ob-para ob-small">Puoi cambiare ogni risposta in seguito dalle impostazioni.</p>
  </div>`;
}

function obDomanda() {
  const lista = domandeCorrenti();
  if (!lista.length) { obAvanti(); return ''; }

  const q = lista[Math.min(OB.indice, lista.length - 1)];
  const tot = lista.length;
  const n = OB.indice + 1;
  const val = OB.answers[q.code];

  const etichettaFase = OB.fase === 'setup' ? 'Setup' : 'Profilo';
  const segmenti = 4;
  const pieni = Math.floor((n - 1) / tot * segmenti);
  const prog = Array.from({ length: segmenti }, (_, i) =>
    `<div class="ob-seg ${i < pieni ? 'on' : i === pieni ? 'half' : ''}"></div>`).join('');

  let corpo;
  if (q.input_type === 'form' && q.code === 'F1b') {
    corpo = obFormMinus();
  } else {
    const opts = (q.options || []).map(o => {
      const sel = q.input_type === 'multi'
        ? Array.isArray(val) && val.includes(o.value)
        : val === o.value;
      return `<div class="ob-opt ${sel ? 'sel' : ''}"
        onclick="obRispondi('${q.code}','${o.value}','${q.input_type}')">${o.label}</div>`;
    }).join('');
    corpo = `<div class="ob-opts">${opts}</div>`;
  }

  const stato = obStatoRisposta(q, val);

  const secondario = OB.fase === 'profile'
    ? `<button class="ob-link" onclick="obRimanda()">Riprendo dopo</button>`
    : (OB.indice > 0
        ? `<button class="ob-link" onclick="obIndietro()">Indietro</button>`
        : `<span></span>`);

  return `
  <div class="ob-body">
    <div class="ob-prog">${prog}</div>
    <div class="ob-step">${etichettaFase} · ${n} di ${tot}</div>
    <div class="ob-q">${q.text}</div>
    ${q.hint ? `<p class="ob-hint">${q.hint}</p>` : ''}
    ${corpo}
    ${obNota(q, val)}
    <div class="ob-spacer"></div>
    ${stato.ok ? '' : `<p class="ob-blocco">${stato.motivo}</p>`}
    <div class="ob-foot">
      ${secondario}
      <button class="ob-btn" ${stato.ok ? '' : 'disabled'} onclick="obAvanti()">
        ${n === tot ? 'Concludi' : 'Avanti'}
      </button>
    </div>
  </div>`;
}

// Si può proseguire? E se no, perché.
function obStatoRisposta(q, val) {
  if (q.input_type === 'form' && q.code === 'F1b') {
    const righe = (OB.minus || []).filter(t =>
      String(t.anno).trim() !== '' || String(t.importo).trim() !== '');

    if (!righe.length) {
      return { ok: true };                    // nessuna riga: rimandabile
    }

    const annoOggi = new Date().getFullYear();
    const incomplete = righe.filter(t =>
      !(parseInt(t.anno, 10) >= 2000 && parseInt(t.anno, 10) <= annoOggi)
      || !(normalizzaImporto(t.importo) > 0));

    if (incomplete.length) {
      return { ok: false,
        motivo: `Completa anno e importo di ${incomplete.length === 1
          ? 'una riga' : 'alcune righe'}, oppure rimuovile con la ✕.` };
    }
    return { ok: true };
  }

  if (q.input_type === 'multi') {
    return Array.isArray(val) && val.length
      ? { ok: true }
      : { ok: false, motivo: 'Scegli almeno una voce.' };
  }

  return (val !== undefined && val !== null && val !== '')
    ? { ok: true }
    : { ok: false, motivo: 'Scegli una risposta per continuare.' };
}

// Nota contestuale sotto una domanda.
// La composizione della previdenza non si decide più qui: è una
// proprietà del singolo asset, impostata al censimento.
function obNota() { return ''; }

// Form minusvalenze (F1b)
function obFormMinus() {
  const annoOggi = new Date().getFullYear();

  const elenco = OB.minus && OB.minus.length ? OB.minus : [{ anno: '', importo: '' }];
  const righe = elenco.map((t, i) => {
    const anno = parseInt(t.anno, 10);
    const scadenza = (anno >= 2000 && anno <= annoOggi)
      ? `<div class="ob-minus-info">Utilizzabile fino al 31 dicembre ${anno + 4}</div>`
      : '';
    return `
    <div class="ob-minus-item">
      <div class="ob-minus-row">
        <input type="number" inputmode="numeric" placeholder="Anno"
          min="2000" max="${annoOggi}" value="${t.anno}"
          onchange="obMinusSet(${i},'anno',this.value)">
        <input type="text" inputmode="decimal" placeholder="Importo, es. 1250.00"
          value="${t.importo}"
          onchange="obMinusSet(${i},'importo',this.value)">
        <button class="ob-x" onclick="obMinusRimuovi(${i})" title="Rimuovi">✕</button>
      </div>
      ${scadenza}
    </div>`;
  }).join('');

  return `<div class="ob-minus">
    ${righe}
    <button class="ob-link ob-add" onclick="obMinusAggiungi()">+ Aggiungi una tranche</button>
    <p class="ob-minus-hint">Anno in cui la minusvalenza si è formata, non quello di scadenza:
      la calcoliamo noi. Importo in euro, con il punto per i decimali.</p>
  </div>`;
}

// Accetta sia 1.250,50 sia 1250.50 e restituisce un numero.
function normalizzaImporto(raw) {
  if (raw === null || raw === undefined) return NaN;
  let s = String(raw).trim().replace(/[€\s]/g, '');
  if (!s) return NaN;

  const virgola = s.lastIndexOf(',');
  const punto = s.lastIndexOf('.');

  if (virgola > punto) {
    // formato italiano: 1.250,50
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (punto > virgola) {
    // formato inglese: 1,250.50
    s = s.replace(/,/g, '');
  } else if (virgola >= 0) {
    s = s.replace(',', '.');
  }
  return Number(s);
}

function obFine() {
  const p = OB.profiloCalcolato || {};
  const r = (label, valore) => valore
    ? `<div class="ob-row"><span>${label}</span><b>${valore}</b></div>` : '';

  const ORIZ = { 1: 'entro 2 anni', 4: '3–5 anni', 7: '5–10 anni', 15: 'oltre 10 anni' };
  const BUF = { 1: 'meno di 3 mesi', 4: '3–6 mesi', 9: '6–12 mesi', 18: 'oltre 12 mesi' };
  const REAZ = { buy_more: 'aumenta i versamenti', hold: 'mantiene il piano',
                 reduce: 'riduce l\'esposizione', exit: 'esce dalle posizioni' };
  const PENS = { part_of_wealth: 'nel patrimonio', separate: 'esclusa dai calcoli',
                 info_only: 'solo informativa' };

  const parziale = (p.completeness || 0) < 1;

  return `
  <div class="ob-body">
    <span class="ob-pill">${parziale ? 'Profilo parziale' : 'Profilo completo'}</span>
    <div class="ob-lead">${obNomeProfilo(p)}</div>
    <p class="ob-para">Da qui in avanti gli assistenti ragionano con questi parametri.
      Puoi cambiarli quando vuoi dalle impostazioni.</p>
    ${r('Orizzonte', ORIZ[p.horizon_years])}
    ${r('Riserva di liquidità', BUF[p.emergency_months])}
    ${r('Nei cali', REAZ[p.loss_reaction])}
    ${r('Versamenti', p.monthly_flow_eur ? p.monthly_flow_eur + ' €/mese' : '')}
    ${r('Previdenza', PENS[p.pension_treatment])}
    ${OB.avvisoFisco || ''}
    <div class="ob-spacer"></div>
    <div class="ob-foot">
      ${parziale
        ? `<button class="ob-link" onclick="startOnboarding('profile')">Completa il profilo</button>`
        : `<span></span>`}
      <button class="ob-btn" onclick="endOnboarding()">Vai al portafoglio</button>
    </div>
  </div>`;
}

// Nome sintetico del profilo: appiglio mnemonico, non una classificazione
function obNomeProfilo(p) {
  if (!p.horizon_years) return 'Profilo da completare';
  const lungo = p.horizon_years >= 10;
  const paziente = p.loss_reaction === 'hold' || p.loss_reaction === 'buy_more';

  if (lungo && paziente)  return 'Accumulatore paziente';
  if (lungo && !paziente) return 'Orizzonte lungo, mano nervosa';
  if (!lungo && paziente) return 'Prudente per necessità, non per indole';
  return 'Orizzonte corto, bassa tolleranza';
}

// ═══════════════════════════════════════════════════════════
// AZIONI
// ═══════════════════════════════════════════════════════════

function obScegli(percorso) {
  OB.percorso = percorso;
  OB.fase = 'setup';
  OB.indice = primaSenzaRisposta('setup');
  renderOnboarding();
}

async function obRispondi(code, value, tipo) {
  if (tipo === 'multi') {
    const attuale = Array.isArray(OB.answers[code]) ? [...OB.answers[code]] : [];
    const i = attuale.indexOf(value);
    if (i >= 0) attuale.splice(i, 1); else attuale.push(value);
    OB.answers[code] = attuale;
  } else {
    OB.answers[code] = value;
  }
  renderOnboarding();
}

function obIndietro() {
  if (OB.indice > 0) { OB.indice--; renderOnboarding(); }
}

async function obRimanda() {
  await obSalvaTutto();
  OB.profiloCalcolato = deriveProfile(OB.answers, OB.questions);
  OB.fase = 'fine';
  renderOnboarding();
}

async function obAvanti() {
  if (OB.salvando) return;

  const lista = domandeCorrenti();
  const q = lista[OB.indice];

  if (q) {
    OB.salvando = true;
    try {
      await saveAnswer(q.code, OB.answers[q.code], q.input_type);
      if (q.code === 'A3' && OB.answers.A3 === 'standard') await applyStandardMandate();
      if (q.code === 'F1b' && OB.minus) {
        const valide = OB.minus
          .map(t => ({ anno: parseInt(t.anno, 10), importo: normalizzaImporto(t.importo) }))
          .filter(t => t.anno >= 2000 && isFinite(t.importo) && t.importo > 0);
        await saveTaxCredits(valide);
      }
    } catch (e) {
      console.error('Salvataggio risposta:', e.message || e);
    }
    OB.salvando = false;
  }

  // la lista può essere cambiata: una risposta può aver reso visibili altre domande
  const nuova = domandeCorrenti();

  if (OB.indice + 1 < nuova.length) {
    OB.indice++;
    renderOnboarding();
    return;
  }

  // fase conclusa
  if (OB.fase === 'setup') {
    if (OB.percorso === 'minimo') { await obConcludi(); return; }
    OB.fase = 'profile';
    OB.indice = 0;
    renderOnboarding();
    return;
  }

  await obConcludi();
}

async function obConcludi() {
  OB.profiloCalcolato = deriveProfile(OB.answers, OB.questions);
  try {
    await saveProfile(OB.profiloCalcolato);
  } catch (e) {
    console.error('Salvataggio profilo:', e.message || e);
  }
  OB.avvisoFisco = await obControlloFisco();
  OB.fase = 'fine';
  renderOnboarding();
}

// Avviso su minusvalenze in scadenza, mostrato alla fine
async function obControlloFisco() {
  try {
    const { data } = await sb.from('v_tax_credits')
      .select('residuo_eur, giorni_alla_scadenza')
      .order('giorni_alla_scadenza');
    if (!data || !data.length) return '';
    const primo = data[0];
    if (Number(primo.giorni_alla_scadenza) > 180) return '';

    return `<div class="ob-warn">
      <b>Da sistemare entro il 31 dicembre.</b> Hai minusvalenze che scadono a fine anno.
      Solo le azioni singole possono compensarle, non gli ETF. Il Portfolio Manager
      te lo ricorderà quando proponi operazioni.
    </div>`;
  } catch (e) {
    return '';
  }
}

// ─── form minusvalenze ───
function obMinusAggiungi() {
  OB.minus = (OB.minus || []).concat([{ anno: '', importo: '' }]);
  renderOnboarding();
}
function obMinusRimuovi(i) {
  OB.minus = (OB.minus || []).filter((_, j) => j !== i);
  if (!OB.minus.length) OB.minus = [{ anno: '', importo: '' }];
  renderOnboarding();
}
function obMinusSet(i, campo, valore) {
  if (!OB.minus) OB.minus = [{ anno: '', importo: '' }];
  OB.minus[i][campo] = valore;
}
