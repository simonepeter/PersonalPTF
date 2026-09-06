// auth.js — autenticazione Supabase
// Va caricato PRIMA di app.js in index.html.

const SB_URL = 'https://svldalsbtvntyqpsssoe.supabase.co';
const SB_KEY = 'sb_publishable_e18W8dCJPry_PuZdTTP3-g_8W_V289_';

const sb = window.supabase.createClient(SB_URL, SB_KEY);

async function checkSession() {
  const { data } = await sb.auth.getSession();
  return data.session || null;
}

function showLogin() {
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('app').style.display = 'none';
}

function hideLogin() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app').style.display = '';
}

async function doLogin() {
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const btn = document.getElementById('login-btn');
  const err = document.getElementById('login-error');

  if (!email || !password) {
    err.textContent = 'Inserisci email e password';
    err.style.display = 'block';
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Accesso...';
  err.style.display = 'none';

  const { error } = await sb.auth.signInWithPassword({ email, password });

  btn.disabled = false;
  btn.textContent = 'Accedi';

  if (error) {
    err.textContent = 'Credenziali non valide';
    err.style.display = 'block';
    return;
  }

  hideLogin();
  if (typeof loadData === 'function') loadData();
}

async function doLogout() {
  await sb.auth.signOut();
  showLogin();
}

// Invio con Enter dal campo password
window.addEventListener('DOMContentLoaded', () => {
  const pw = document.getElementById('login-password');
  if (pw) pw.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
});

// Controllo sessione all'avvio.
// Questo listener è registrato prima di quello di app.js, quindi gira per primo.
window.addEventListener('DOMContentLoaded', async () => {
  const session = await checkSession();
  if (!session) showLogin(); else hideLogin();
});
