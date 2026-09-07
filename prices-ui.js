// prices-ui.js — aggiornamento prezzi on-demand dall'interfaccia.
// Responsabilità unica: chiamare /api/prices e ricaricare i dati.

async function refreshPrices(btn) {
  if (!btn) btn = document.getElementById('refresh-prices-btn');
  const testo = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = '⏳'; }

  const ripristina = () => {
    if (btn) { btn.textContent = testo || '↻'; btn.disabled = false; }
  };

  try {
    const res = await fetch('/api/prices');
    const d = await res.json();
    if (d.error) throw new Error(d.error);

    if (btn) btn.textContent = `✓ ${d.aggiornati}`;
    await loadData();
    setTimeout(ripristina, 1500);

  } catch (e) {
    if (btn) btn.textContent = '✕';
    console.error('Aggiornamento prezzi:', e.message || e);
    setTimeout(ripristina, 2000);
  }
}
