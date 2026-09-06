// data.js — sostituisce loadData() leggendo da Supabase.
// Va caricato DOPO app.js: la dichiarazione qui sovrascrive quella originale.

// Mappa asset_class del DB → etichette usate dalla UI (AC_COLOR, donut, mandate)
const AC_MAP = { ETF: 'ETF', ETC: 'ETF', STOCK: 'Azioni', CRYPTO: 'Crypto', FUND: 'Fondi' };

async function loadData() {
  show('loading'); hide('page-content');
  document.getElementById('loading-text').textContent = 'Caricamento...';
  document.getElementById('live-badge').textContent = '...';

  try {
    const session = await checkSession();
    if (!session) { showLogin(); return; }

    const [posRes, ovwRes, navRes, trxRes, catRes, assRes] = await Promise.all([
      sb.from('v_positions').select('*'),
      sb.from('v_overview').select('*').single(),
      sb.from('nav_history').select('*').order('nav_date', { ascending: true }),
      sb.from('transactions').select('*').order('operation_date', { ascending: false }).limit(50),
      sb.from('category_targets').select('*').is('valid_to', null),
      sb.from('mandate').select('*'),
    ]);

    if (posRes.error) throw posRes.error;
    if (ovwRes.error) throw ovwRes.error;

    const o = ovwRes.data || {};
    const positions = posRes.data || [];
    const navRows = navRes.data || [];
    const trxRows = trxRes.data || [];
    const targets = catRes.data || [];
    const assetTargets = assRes.data || [];

    // ─── POSIZIONI ───
    const posizioni = positions.map(p => {
      const mv = Number(p.mv) || 0;
      const pnl = Number(p.pnl_eur) || 0;
      const costo = mv - pnl;
      return {
        ticker: p.ticker || p.isin,
        nome: p.nome || '',
        ac: AC_MAP[p.asset_class] || AC_MAP[p.ac] || p.ac || 'ETF',
        category: p.category,
        qty: Number(p.qty) || 0,
        mv,
        pnlEur: pnl,
        pnlPct: costo > 0 ? pnl / costo : 0,
        price: Number(p.price_eur) || 0,
        currency: p.currency || 'EUR',
        caricoMedio: Number(p.carico_medio) || 0,
      };
    });

    // ─── OVERVIEW ───
    const overview = {
      navTotale: Number(o.nav_totale) || 0,
      navGestito: Number(o.nav_gestito) || 0,
      navStabile: Number(o.nav_stabile) || 0,
      pnlEur: Number(o.pnl_eur) || 0,
      pnlPct: Number(o.pnl_pct) || 0,
      nPos: Number(o.n_pos) || posizioni.length,
      cashFineco: Number(o.cash_fineco) || 0,
      cashKraken: Number(o.cash_kraken) || 0,
      cashTotale: Number(o.cash_totale) || 0,
    };

    // ─── PERFORMANCE ───
    // Rendimento cumulato semplice sul NAV: non è un vero TWR, perché
    // cash_flow non è ancora popolato e i versamenti non vengono neutralizzati.
    const navBase = navRows.length ? Number(navRows[0].nav_eur) : 0;
    const benchBase = navRows.length ? Number(navRows[0].benchmark_value) : 0;

    const performance = navRows.map(r => {
      const nav = Number(r.nav_eur) || 0;
      const bench = Number(r.benchmark_value) || 0;
      return {
        data: r.nav_date,
        nav,
        twr: navBase > 0 ? (nav - navBase) / navBase : 0,
        msci: benchBase > 0 && bench > 0 ? (bench - benchBase) / benchBase : null,
        sp: null,
        patrimonio: Number(r.patrimonio_totale) || null,
        pctAzioni: r.pct_azioni != null ? Number(r.pct_azioni) : null,
        pctEtf: r.pct_etf != null ? Number(r.pct_etf) : null,
        pctCash: r.pct_cash != null ? Number(r.pct_cash) : null,
        pctCrypto: r.pct_crypto != null ? Number(r.pct_crypto) : null,
      };
    });

    // ─── MANDATE (categorie) ───
    const investito = posizioni.reduce((s, p) => s + p.mv, 0);
    const perCat = {};
    posizioni.forEach(p => {
      if (!p.category) return;
      perCat[p.category] = (perCat[p.category] || 0) + p.mv;
    });

    const CAT_LABEL = {
      core: 'Core', satellite: 'Satellite',
      stocks: 'Stocks', speculative: 'Speculative',
    };

    const mandate = targets.map(t => {
      const current = investito > 0 ? (perCat[t.category] || 0) / investito : 0;
      const target = Number(t.target_weight) / 100;
      const min = Number(t.min_weight) / 100;
      const max = Number(t.max_weight) / 100;
      let status = 'OK';
      if (current < min) status = 'SOTTO MIN';
      else if (current > max) status = 'SOPRA MAX';
      return {
        label: CAT_LABEL[t.category] || t.category,
        current, target, min, max, status,
        drift: current - target,
      };
    }).sort((a, b) => b.target - a.target);

    // ─── TRANSAZIONI ───
    const isinToPos = {};
    positions.forEach(p => { isinToPos[p.isin] = p; });

    const transactions = trxRows.map(t => {
      const p = isinToPos[t.isin] || {};
      const qty = Number(t.quantity) || 0;
      const prezzo = Number(t.price) || 0;
      const fx = Number(t.fx_rate) || 1;
      const lordo = Number(t.gross_amount) || 0;
      const netto = lordo > 0 ? lordo : (qty * prezzo) / (fx || 1);
      const tipo = t.operation_type === 'TRANSFER_IN' ? 'TRASF' : t.operation_type;
      return {
        ticker: p.ticker || t.ticker || t.isin,
        tipo,
        data: t.operation_date,
        netto,
        ac: AC_MAP[p.asset_class] || 'ETF',
      };
    });

    // ─── MANDATE per asset class ───
    const perAC = {};
    posizioni.forEach(p => { perAC[p.ac] = (perAC[p.ac] || 0) + p.mv; });
    const gestito = overview.navGestito || 0;
    if (gestito > 0) perAC['Cash'] = (perAC['Cash'] || 0) + overview.cashTotale;

    const mandateAC = assetTargets.map(t => {
      const current = gestito > 0 ? (perAC[t.asset_class] || 0) / gestito : 0;
      const target = Number(t.target_weight) / 100;
      const min = Number(t.min_weight) / 100;
      const max = Number(t.max_weight) / 100;
      let status = 'OK';
      if (current < min) status = 'SOTTO MIN';
      else if (current > max) status = 'SOPRA MAX';
      return { label: t.asset_class, current, target, min, max, status, drift: current - target };
    }).sort((a, b) => b.target - a.target);

    DATA = {
      overview, posizioni, performance, transactions,
      mandate: mandate.concat(mandateAC),
      mandateCategorie: targets,
      mandateAssetClass: assetTargets,
    };

    const ultimo = navRows.length ? navRows[navRows.length - 1].nav_date : '';
    document.getElementById('update-time').textContent = ultimo || '--';
    document.getElementById('live-badge').textContent = 'LIVE';
    hide('loading'); show('page-content');
    renderTab(CURRENT_TAB);

  } catch (e) {
    document.getElementById('loading').innerHTML =
      `<div style="padding:20px;width:100%;max-width:360px">
        <div style="font-size:12px;color:var(--text3);margin-bottom:8px">Errore connessione</div>
        <div class="error-banner">${e.message || e}</div>
        <button class="btn-retry" onclick="loadData()">Riprova</button>
      </div>`;
    document.getElementById('live-badge').textContent = 'ERR';
  }
}
