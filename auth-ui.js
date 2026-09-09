// auth-ui.js — schermate di autenticazione.
// Vista unica con più stati: login, registrazione, recupero, nuova password.
// La logica di sessione resta in auth.js.

// Registrazione pubblica: falso finché l'app non è aperta ad altri utenti.
const REGISTRAZIONE_APERTA = false;

let AUTH_VISTA = 'login';   // login | registra | recupera | inviata | nuova-password
let AUTH_BUSY = false;
let AUTH_MSG = null;        // { tipo: 'errore'|'ok', testo }

// ═══════════════════════════════════════════════════════════
// RENDERING
// ═══════════════════════════════════════════════════════════

function renderAuth() {
  const el = document.getElementById('login-screen');
  if (!el) return;

  const viste = {
    login: _vistaLogin,
    registra: _vistaRegistra,
    recupera: _vistaRecupera,
    inviata: _vistaInviata,
    'nuova-password': _vistaNuovaPassword,
  };

  el.innerHTML = `
    <div class="au-body">
      <div class="au-head">
        <div class="au-mark">P</div>
        <div class="au-name">PersonalPTF</div>
      </div>
      ${(viste[AUTH_VISTA] || _vistaLogin)()}
    </div>`;
  el.style.display = 'flex';

  const primo = el.querySelector('input');
  if (primo && !primo.value) primo.focus();
}

function cambiaVista(vista) {
  AUTH_VISTA = vista;
  AUTH_MSG = null;
  renderAuth();
}

function _msg() {
  if (!AUTH_MSG) return '';
  return `<div class="au-msg ${AUTH_MSG.tipo}">${AUTH_MSG.testo}</div>`;
}

function _campo(id, etichetta, tipo, placeholder, autocomplete) {
  return `
    <div class="au-f">
      <label for="${id}">${etichetta}</label>
      <input type="${tipo}" id="${id}" placeholder="${placeholder}"
        autocomplete="${autocomplete}" onkeydown="_auInvio(event)">
    </div>`;
}

function _vistaLogin() {
  return `
    <div class="au-t">Bentornato</div>
    <div class="au-d">Accedi per vedere il tuo portafoglio.</div>
    ${_campo('au-email', 'Email', 'email', 'nome@esempio.it', 'username')}
    ${_campo('au-pw', 'Password', 'password', '••••••••', 'current-password')}
    <button class="au-mini" onclick="cambiaVista('recupera')">Password dimenticata?</button>
    ${_msg()}
    <button class="au-btn" id="au-azione" onclick="azioneLogin()">Accedi</button>
    ${REGISTRAZIONE_APERTA ? `
      <div class="au-alt">Non hai un account?
        <button onclick="cambiaVista('registra')">Registrati</button>
      </div>` : `
      <div class="au-alt au-chiuso">Le registrazioni sono momentaneamente chiuse.</div>`}`;
}

function _vistaRegistra() {
  return `
    <div class="au-t">Crea il tuo account</div>
    <div class="au-d">Ti manderemo una mail per confermare l'indirizzo.</div>
    ${_campo('au-email', 'Email', 'email', 'nome@esempio.it', 'username')}
    ${_campo('au-pw', 'Password', 'password', 'almeno 8 caratteri', 'new-password')}
    ${_campo('au-pw2', 'Ripeti la password', 'password', '••••••••', 'new-password')}
    ${_msg()}
    <button class="au-btn" id="au-azione" onclick="azioneRegistra()">Crea account</button>
    <div class="au-alt">Hai già un account?
      <button onclick="cambiaVista('login')">Accedi</button>
    </div>`;
}

function _vistaRecupera() {
  return `
    <div class="au-t">Recupera l'accesso</div>
    <div class="au-d">Inserisci la tua email: ti manderemo un link per impostare
      una nuova password.</div>
    ${_campo('au-email', 'Email', 'email', 'nome@esempio.it', 'username')}
    ${_msg()}
    <button class="au-btn" id="au-azione" onclick="azioneRecupera()">Invia il link</button>
    <div class="au-alt">
      <button onclick="cambiaVista('login')">Torna all'accesso</button>
    </div>`;
}

function _vistaInviata() {
  return `
    <div class="au-t">Controlla la posta</div>
    <div class="au-d">Se l'indirizzo è registrato, entro qualche minuto riceverai un
      messaggio con il link per procedere. Guarda anche nello spam.</div>
    <div class="au-alt" style="margin-top:24px">
      <button onclick="cambiaVista('login')">Torna all'accesso</button>
    </div>`;
}

function _vistaNuovaPassword() {
  return `
    <div class="au-t">Imposta la nuova password</div>
    <div class="au-d">Scegline una che non usi altrove.</div>
    ${_campo('au-pw', 'Nuova password', 'password', 'almeno 8 caratteri', 'new-password')}
    ${_campo('au-pw2', 'Ripetila', 'password', '••••••••', 'new-password')}
    ${_msg()}
    <button class="au-btn" id="au-azione" onclick="azioneNuovaPassword()">Salva ed entra</button>`;
}

// ═══════════════════════════════════════════════════════════
// AZIONI
// ═══════════════════════════════════════════════════════════

function _auInvio(e) {
  if (e.key !== 'Enter') return;
  const azioni = {
    login: azioneLogin, registra: azioneRegistra,
    recupera: azioneRecupera, 'nuova-password': azioneNuovaPassword,
  };
  const f = azioni[AUTH_VISTA];
  if (f) f();
}

function _val(id) {
  const el = document.getElementById(id);
  return el ? el.value.trim() : '';
}

function _occupato(testo) {
  AUTH_BUSY = true;
  const b = document.getElementById('au-azione');
  if (b) { b.disabled = true; b.textContent = testo; }
}

function _libero(testo) {
  AUTH_BUSY = false;
  const b = document.getElementById('au-azione');
  if (b) { b.disabled = false; b.textContent = testo; }
}

function _errore(testo) {
  AUTH_MSG = { tipo: 'errore', testo };
  renderAuth();
}

async function azioneLogin() {
  if (AUTH_BUSY) return;
  const email = _val('au-email');
  const pw = document.getElementById('au-pw').value;

  if (!email || !pw) return _errore('Inserisci email e password.');

  _occupato('Accesso in corso...');
  const { error } = await sb.auth.signInWithPassword({ email, password: pw });

  if (error) {
    _libero('Accedi');
    return _errore(/Invalid login/i.test(error.message)
      ? 'Email o password non corretti.'
      : 'Accesso non riuscito. Riprova fra poco.');
  }

  hideLogin();
  await avviaApp();
}

async function azioneRegistra() {
  if (AUTH_BUSY) return;
  const email = _val('au-email');
  const pw = document.getElementById('au-pw').value;
  const pw2 = document.getElementById('au-pw2').value;

  if (!email || !pw) return _errore('Compila tutti i campi.');
  if (pw.length < 8)  return _errore('La password deve avere almeno 8 caratteri.');
  if (pw !== pw2)     return _errore('Le due password non coincidono.');

  _occupato('Creazione in corso...');
  const { error } = await sb.auth.signUp({
    email, password: pw,
    options: { emailRedirectTo: window.location.origin },
  });

  if (error) {
    _libero('Crea account');
    return _errore(/already registered/i.test(error.message)
      ? 'Esiste già un account con questa email.'
      : 'Registrazione non riuscita. Riprova fra poco.');
  }

  cambiaVista('inviata');
}

async function azioneRecupera() {
  if (AUTH_BUSY) return;
  const email = _val('au-email');
  if (!email) return _errore('Inserisci la tua email.');

  _occupato('Invio in corso...');
  // L'esito non viene distinto: non si rivela se l'indirizzo esiste.
  await sb.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin,
  });
  cambiaVista('inviata');
}

async function azioneNuovaPassword() {
  if (AUTH_BUSY) return;
  const pw = document.getElementById('au-pw').value;
  const pw2 = document.getElementById('au-pw2').value;

  if (pw.length < 8) return _errore('La password deve avere almeno 8 caratteri.');
  if (pw !== pw2)    return _errore('Le due password non coincidono.');

  _occupato('Salvataggio...');
  const { error } = await sb.auth.updateUser({ password: pw });

  if (error) {
    _libero('Salva ed entra');
    return _errore('Non è stato possibile salvare. Il link potrebbe essere scaduto.');
  }

  AUTH_VISTA = 'login';
  hideLogin();
  await avviaApp();
}

// ═══════════════════════════════════════════════════════════
// RITORNO DAL LINK DI RECUPERO
// ═══════════════════════════════════════════════════════════
// Supabase autentica l'utente aprendo il link: senza intercettare
// l'evento si finirebbe nell'app senza mai cambiare la password.

sb.auth.onAuthStateChange((evento) => {
  if (evento === 'PASSWORD_RECOVERY') {
    AUTH_VISTA = 'nuova-password';
    AUTH_MSG = null;
    document.getElementById('app').style.display = 'none';
    renderAuth();
  }
});

// Il frammento nell'URL indica un ritorno dal link, anche prima
// che la libreria emetta l'evento.
if (window.location.hash.includes('type=recovery')) {
  AUTH_VISTA = 'nuova-password';
}
