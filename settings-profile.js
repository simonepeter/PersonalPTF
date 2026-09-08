// settings-profile.js — sezione "Profilo investitore".
// Mostra le risposte, la lettura derivata dove serve, e permette di modificarle.

let PROF_TUTTE = false;          // mostra anche le risposte secondarie
let PROF_CACHE = null;           // { questions, answers }

// Domande in evidenza, nell'ordine in cui vanno lette.
const PROF_PRINCIPALI = ['B2', 'B1', 'B4', 'C1', 'D3', 'A1'];

const PROF_GRUPPI = [
  { titolo: 'ORIZZONTE E LIQUIDITÀ', codici: ['B2', 'B1', 'B4', 'B3', 'B3b'] },
  { titolo: 'COMPORTAMENTO',          codici: ['C1', 'C2', 'C3', 'C4'] },
  { titolo: 'OBIETTIVI',              codici: ['D1', 'D2', 'D3'] },
  { titolo: 'ESPERIENZA',             codici: ['E1', 'E2', 'E3'] },
  { titolo: 'VERSAMENTI',             codici: ['A1', 'A2'] },
  { titolo: 'PREFERENZE',             codici: ['G1', 'G2', 'G3'] },
  { titolo: 'PREVIDENZA',             codici: ['H1', 'H4'] },
];

registraSezione('profilo-investitore', {
  area: 'profilo',
  ordine: 2,
  titolo: 'Profilo investitore',
  descrizione: 'Orizzonte, tolleranza, obiettivi',
  badge: () => {
    const p = DATA.profilo;
    if (!p) return { tipo: 'warn', testo: 'da definire' };
    const perc = Math.round(Number(p.completeness || 0) * 100);
    return perc >= 100
      ? { tipo: 'ok', testo: 'completo' }
      : { tipo: 'warn', testo: `${perc}% completo` };
  },
  render: () => _renderProfilo(),
});

function _renderProfilo() {
  const p = DATA.profilo;

  if (!p) {
    return setHeader('Profilo investitore') + `
      <div class="set-empty">
        <p>Non hai ancora definito il tuo profilo.</p>
        <button class="set-btn" onclick="resumeProfile()">Inizia</button>
      </div>`;
  }

  // carica domande e risposte alla prima apertura
  if (!PROF_CACHE) {
    Promise.all([fetchQuestions(), fetchAnswers()])
      .then(([questions, answers]) => {
        PROF_CACHE = { questions, answers };
        renderTab('settings');
      })
      .catch(e => console.error('Lettura profilo:', e.message || e));

    return setHeader('Profilo investitore') +
      '<div class="loading" style="height:30vh"><div class="spinner"></div></div>';
  }

  const { questions, answers } = PROF_CACHE;
  const perc = Math.round(Number(p.completeness || 0) * 100);
  const aggiornato = p.valid_from
    ? new Date(p.valid_from).toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })
    : '';

  const codiciMostrati = PROF_TUTTE
    ? PROF_GRUPPI.flatMap(g => g.codici)
    : PROF_PRINCIPALI;

  const gruppi = PROF_GRUPPI.map(g => {
    const righe = g.codici
      .filter(c => codiciMostrati.includes(c))
      .map(c => _rigaRisposta(c, questions, answers, p))
      .filter(Boolean)
      .join('');
    return righe ? `<div class="set-area">${g.titolo}</div>${righe}` : '';
  }).join('');

  const nascoste = PROF_GRUPPI.flatMap(g => g.codici).length - PROF_PRINCIPALI.length;

  return setHeader(
    'Profilo investitore',
    `${obNomeProfilo(p)}${aggiornato ? ' · aggiornato il ' + aggiornato : ''}`
  ) + gruppi + `

    <button class="set-more" onclick="PROF_TUTTE=${!PROF_TUTTE};renderTab('settings')">
      ${PROF_TUTTE ? 'Mostra solo le principali' : `Mostra le altre ${nascoste} risposte ›`}
    </button>

    ${perc < 100 ? `
      <div class="set-note">
        <b>Profilo al ${perc}%.</b> Le risposte mancanti riducono il contesto con cui
        lavorano gli assistenti.
        <button class="set-link" onclick="resumeProfile()">Completa ora</button>
      </div>` : ''}

    <div class="set-note">
      <b>Le modifiche restano tracciate.</b> Ogni cambio conserva la data e il valore
      precedente: serve a distinguere un ripensamento meditato da una reazione al mercato.
    </div>`;
}

function _rigaRisposta(codice, questions, answers, profilo) {
  const q = questions.find(x => x.code === codice);
  if (!q) return '';

  const val = answers[codice];
  const opzioni = q.options || [];

  let mostrato;
  if (Array.isArray(val)) {
    mostrato = val.map(v => (opzioni.find(o => o.value === v) || {}).label || v).join(', ');
  } else if (val !== undefined && val !== null && val !== '') {
    mostrato = (opzioni.find(o => o.value === val) || {}).label || val;
  } else {
    mostrato = '—';
  }

  const nota = _notaDerivata(codice, profilo);

  return `
  <div class="set-ans">
    <div class="set-ans-l">
      <div class="set-ans-q">${q.text}</div>
      <div class="set-ans-v ${mostrato === '—' ? 'vuoto' : ''}">${mostrato}</div>
      ${nota ? `<div class="set-ans-n ${nota.tipo}">${nota.testo}</div>` : ''}
    </div>
    <div class="set-ed" onclick="modificaRisposta('${codice}')">Modifica</div>
  </div>`;
}

// Lettura derivata: il dato grezzo da solo può fuorviare.
function _notaDerivata(codice, p) {
  if (codice === 'B1') {
    const r = p.liquidity_risk;
    if (r === 'high') return { tipo: 'amb',
      testo: 'Rischio elevato: riserva sottile insieme a reddito variabile o spese in programma' };
    if (r === 'medium') return { tipo: 'ok',
      testo: 'Rischio contenuto: il cuscinetto è sottile ma il reddito è stabile' };
    if (r === 'low') return { tipo: 'ok', testo: 'Riserva adeguata' };
  }

  if (codice === 'A1' && p.monthly_flow_eur) {
    const nav = (DATA.overview || {}).navGestito || 0;
    if (nav > 0) {
      const annuo = Number(p.monthly_flow_eur) * 12;
      const quota = Math.round(annuo / nav * 100);
      if (quota >= 30) return { tipo: 'ok',
        testo: `${annuo.toLocaleString('it-IT')} € l'anno, il ${quota}% del portafoglio: i versamenti pesano più delle oscillazioni` };
    }
  }

  return null;
}

// ═══════════════════════════════════════════════════════════
// POPUP DI MODIFICA DI UNA SINGOLA RISPOSTA
// ═══════════════════════════════════════════════════════════

let EDIT_CODICE = null;
let EDIT_VALORE = null;

function modificaRisposta(codice) {
  if (!PROF_CACHE) return;
  const q = PROF_CACHE.questions.find(x => x.code === codice);
  if (!q) return;

  EDIT_CODICE = codice;
  EDIT_VALORE = PROF_CACHE.answers[codice];
  _mostraPopup(q);
}

function _mostraPopup(q) {
  let el = document.getElementById('edit-popup');
  if (!el) {
    el = document.createElement('div');
    el.id = 'edit-popup';
    document.body.appendChild(el);
  }

  const multi = q.input_type === 'multi';
  const opzioni = (q.options || []).map(o => {
    const sel = multi
      ? Array.isArray(EDIT_VALORE) && EDIT_VALORE.includes(o.value)
      : EDIT_VALORE === o.value;
    return `<div class="ep-opt ${sel ? 'sel' : ''}"
      onclick="_scegliValore('${o.value}', ${multi})">${o.label}</div>`;
  }).join('');

  const cambiato = multi
    ? JSON.stringify(EDIT_VALORE || []) !== JSON.stringify(PROF_CACHE.answers[q.code] || [])
    : EDIT_VALORE !== PROF_CACHE.answers[q.code];

  el.innerHTML = `
    <div class="ep-back" onclick="chiudiPopup()"></div>
    <div class="ep-box">
      <div class="ep-q">${q.text}</div>
      ${q.hint ? `<div class="ep-hint">${q.hint}</div>` : ''}
      <div class="ep-opts">${opzioni}</div>
      <div class="ep-foot">
        <button class="ep-link" onclick="chiudiPopup()">Annulla</button>
        <button class="ep-btn" id="ep-salva" ${cambiato ? '' : 'disabled'}
          onclick="salvaRisposta()">Salva</button>
      </div>
    </div>`;
  el.classList.add('aperto');
}

function _scegliValore(valore, multi) {
  if (multi) {
    const attuale = Array.isArray(EDIT_VALORE) ? [...EDIT_VALORE] : [];
    const i = attuale.indexOf(valore);
    if (i >= 0) attuale.splice(i, 1); else attuale.push(valore);
    EDIT_VALORE = attuale;
  } else {
    EDIT_VALORE = valore;
  }
  const q = PROF_CACHE.questions.find(x => x.code === EDIT_CODICE);
  _mostraPopup(q);
}

function chiudiPopup() {
  const el = document.getElementById('edit-popup');
  if (el) el.remove();
  EDIT_CODICE = null;
  EDIT_VALORE = null;
}

async function salvaRisposta() {
  const btn = document.getElementById('ep-salva');
  if (!btn || btn.disabled) return;

  const q = PROF_CACHE.questions.find(x => x.code === EDIT_CODICE);
  btn.disabled = true;
  btn.textContent = 'Salvo...';

  try {
    await saveAnswer(EDIT_CODICE, EDIT_VALORE, q.input_type, 'settings');

    // ricalcola il profilo con la risposta aggiornata
    const answers = await fetchAnswers();
    const questions = PROF_CACHE.questions;
    const profilo = deriveProfile(answers, questions);
    await saveProfile(profilo, `Modifica di ${EDIT_CODICE} dalle impostazioni`);

    PROF_CACHE = { questions, answers };
    chiudiPopup();
    await loadData();
    renderTab('settings');

  } catch (e) {
    console.error('Salvataggio risposta:', e.message || e);
    btn.disabled = false;
    btn.textContent = 'Riprova';
  }
}
