// settings-nav.js — primo livello delle impostazioni e router fra sezioni.
// Ogni sezione vive nel suo modulo e si registra qui.

let SET_SEZIONE = null;          // null = elenco; altrimenti id sezione

// Registro delle sezioni. Ogni modulo aggiunge la sua voce.
const SET_SEZIONI = {};

function registraSezione(id, def) {
  SET_SEZIONI[id] = def;         // { area, titolo, descrizione, badge?, render }
}

// ─── Router: sostituisce il settings() di settings.js ───
function settings() {
  if (!DATA) return '<div class="empty">Carica prima i dati.</div>';

  if (SET_SEZIONE && SET_SEZIONI[SET_SEZIONE]) {
    return SET_SEZIONI[SET_SEZIONE].render();
  }
  return _elencoImpostazioni();
}

function apriSezione(id) {
  SET_SEZIONE = id;
  document.getElementById('content').scrollTop = 0;
  renderTab('settings');
}

function chiudiSezione() {
  SET_SEZIONE = null;
  document.getElementById('content').scrollTop = 0;
  renderTab('settings');
}

// Intestazione comune a tutte le sezioni interne
function setHeader(titolo, descrizione) {
  return `
    <div class="set-back" onclick="chiudiSezione()">‹ Impostazioni</div>
    <div class="set-h2">${titolo}</div>
    ${descrizione ? `<div class="set-h2d">${descrizione}</div>` : ''}`;
}

// ─── Elenco di primo livello ───
const SET_AREE = [
  ['profilo',      'PROFILO'],
  ['investimenti', 'INVESTIMENTI'],
  ['agenti',       'AGENTI E AVVISI'],
];

function _elencoImpostazioni() {
  return SET_AREE.map(([area, etichetta]) => {
    const voci = Object.entries(SET_SEZIONI)
      .filter(([, s]) => s.area === area)
      .sort((a, b) => (a[1].ordine || 99) - (b[1].ordine || 99));

    if (!voci.length) return '';

    const righe = voci.map(([id, s]) => {
      const b = typeof s.badge === 'function' ? s.badge() : null;
      return `
      <div class="set-row" onclick="apriSezione('${id}')">
        <div class="set-rw">
          <div class="set-rt">${s.titolo}</div>
          <div class="set-rd">${s.descrizione}</div>
          ${b ? `<span class="set-tag ${b.tipo}">${b.testo}</span>` : ''}
        </div>
        <div class="set-chev">›</div>
      </div>`;
    }).join('');

    return `<div class="set-area">${etichetta}</div>${righe}`;
  }).join('');
}
