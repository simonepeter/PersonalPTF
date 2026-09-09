// auth.js — autenticazione Supabase
// Va caricato PRIMA di app.js in index.html.

const SB_URL = 'https://svldalsbtvntyqpsssoe.supabase.co';
const SB_KEY = 'sb_publishable_e18W8dCJPry_PuZdTTP3-g_8W_V289_';

const sb = window.supabase.createClient(SB_URL, SB_KEY);

async function checkSession() {
  const { data } = await sb.auth.getSession();
  const s = data.session;
  if (!s) return null;

  // getSession restituisce anche un token scaduto: va rinnovato
  const scadenza = (s.expires_at || 0) * 1000;
  if (scadenza - Date.now() > 120000) return s;      // valido per almeno 2 minuti

  try {
    const { data: nuovo, error } = await sb.auth.refreshSession();
    if (error || !nuovo.session) return null;
    return nuovo.session;
  } catch (e) {
    return null;
  }
}

// Se il token scade mentre l'app è aperta, si torna al login
// invece di lasciare una schermata di errore.
sb.auth.onAuthStateChange((evento, sessione) => {
  if (evento === 'SIGNED_OUT' || (evento === 'TOKEN_REFRESHED' && !sessione)) {
    showLogin();
  }
});

function showLogin() {
  document.getElementById('app').style.display = 'none';
  if (typeof renderAuth === 'function') renderAuth();
  else document.getElementById('login-screen').style.display = 'flex';
}

function hideLogin() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app').style.display = '';
}

async function doLogout() {
  await sb.auth.signOut();
  showLogin();
}

// Controllo sessione all'avvio.
// Questo listener è registrato prima di quello di app.js, quindi gira per primo.
window.addEventListener('DOMContentLoaded', async () => {
  const session = await checkSession();
  if (!session) { showLogin(); return; }
  hideLogin();
  await avviaApp();
});
