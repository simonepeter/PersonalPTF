// api/prices.js — aggiorna price_history da Yahoo Finance,
// genera i movimenti ricorrenti e registra lo snapshot NAV del giorno.
// Girare su Vercel (cron giornaliero o chiamata manuale).
// Env richieste: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET (opzionale)

import { createClient } from '@supabase/supabase-js';

const YAHOO = 'https://query1.finance.yahoo.com/v8/finance/chart/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36';

// ISIN usato come benchmark nello storico NAV (iShares Core MSCI World)
const BENCHMARK_ISIN = 'IE00B4L5Y983';

async function fetchQuote(symbol) {
  const url = `${YAHOO}${encodeURIComponent(symbol)}?interval=1d&range=5d`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`${symbol}: HTTP ${res.status}`);

  const json = await res.json();
  const meta = json?.chart?.result?.[0]?.meta;
  if (!meta) throw new Error(`${symbol}: risposta senza meta`);

  const price = meta.regularMarketPrice ?? meta.previousClose;
  if (typeof price !== 'number') throw new Error(`${symbol}: prezzo assente`);

  // data di riferimento della quotazione, non "oggi"
  const ts = meta.regularMarketTime ? meta.regularMarketTime * 1000 : Date.now();
  const priceDate = new Date(ts).toISOString().split('T')[0];

  return { price, priceDate, currency: meta.currency };
}

// Genera i movimenti ricorrenti scaduti
async function runRecurringRules(supabase) {
  const { data: rules, error } = await supabase
    .from('recurring_rules')
    .select('*')
    .eq('active', true);

  if (error) throw error;
  if (!rules?.length) return { generati: 0 };

  const oggi = new Date();
  oggi.setHours(0, 0, 0, 0);
  const movimenti = [];
  const aggiornamenti = [];

  for (const r of rules) {
    const fine = r.end_date ? new Date(r.end_date) : oggi;
    const limite = fine < oggi ? fine : oggi;

    // punto di partenza: giorno dopo l'ultima esecuzione, o start_date
    const inizio = r.last_run_date
      ? new Date(new Date(r.last_run_date).getTime() + 86400000)
      : new Date(r.start_date);

    const passo = { monthly: 1, quarterly: 3, yearly: 12 }[r.frequency] || 1;

    // prima scadenza teorica: mese di start_date, al day_of_month
    const start = new Date(r.start_date);
    let cursore = new Date(start.getFullYear(), start.getMonth(), r.day_of_month);
    if (cursore < start) cursore.setMonth(cursore.getMonth() + passo);

    let ultima = r.last_run_date ? new Date(r.last_run_date) : null;

    while (cursore <= limite) {
      if (cursore >= inizio) {
        movimenti.push({
          user_id: r.user_id,
          asset_id: r.asset_id,
          rule_id: r.id,
          movement_date: cursore.toISOString().split('T')[0],
          amount_eur: r.amount_eur,
          kind: 'contribution',
          note: 'Generato da regola ricorrente',
        });
        ultima = new Date(cursore);
      }
      cursore = new Date(cursore.getFullYear(), cursore.getMonth() + passo, r.day_of_month);
    }

    if (ultima) {
      aggiornamenti.push({ id: r.id, last_run_date: ultima.toISOString().split('T')[0] });
    }
  }

  if (movimenti.length) {
    // ignoreDuplicates: l'indice unico (rule_id, movement_date) fa da rete
    const { error: insErr } = await supabase
      .from('asset_movements')
      .upsert(movimenti, { onConflict: 'rule_id,movement_date', ignoreDuplicates: true });
    if (insErr) throw insErr;

    for (const a of aggiornamenti) {
      await supabase
        .from('recurring_rules')
        .update({ last_run_date: a.last_run_date })
        .eq('id', a.id);
    }
  }

  return { generati: movimenti.length };
}

// Registra lo snapshot NAV del giorno
async function snapshotNav(supabase) {
  const { data: rows, error } = await supabase.from('v_overview').select('*');
  if (error) throw error;
  if (!rows?.length) return { snapshot: 0 };

  const { data: pos } = await supabase.from('v_positions').select('user_id, ac, mv');

  let bench = null;
  const { data: b } = await supabase
    .from('price_history').select('price')
    .eq('isin', BENCHMARK_ISIN)
    .order('price_date', { ascending: false }).limit(1);
  if (b?.length) bench = b[0].price;

  const oggi = new Date().toISOString().split('T')[0];
  const AC = { ETF: 'ETF', ETC: 'ETF', STOCK: 'Azioni', CRYPTO: 'Crypto', FUND: 'Fondi' };

  const snapshots = rows.filter(r => r.user_id).map(r => {
    const mine = (pos || []).filter(p => p.user_id === r.user_id);
    const gestito = Number(r.nav_gestito) || 0;
    const per = {};
    mine.forEach(p => {
      const k = AC[p.ac] || p.ac;
      per[k] = (per[k] || 0) + (Number(p.mv) || 0);
    });
    const cash = Number(r.cash_totale) || 0;
    const q = v => (gestito > 0 ? (v || 0) / gestito : 0);

    return {
      user_id: r.user_id,
      nav_date: oggi,
      nav_eur: gestito,
      benchmark_value: bench,
      cash_flow: 0,
      patrimonio_totale: Number(r.nav_totale) || 0,
      patrimonio_stabile: Number(r.nav_stabile) || 0,
      cash_eur: cash,
      pct_azioni: q(per['Azioni']),
      pct_etf: q(per['ETF']),
      pct_cash: q(cash),
      pct_crypto: q(per['Crypto']),
    };
  });

  const { error: upErr } = await supabase
    .from('nav_history').upsert(snapshots, { onConflict: 'user_id,nav_date' });
  if (upErr) throw upErr;

  return { snapshot: snapshots.length, nav: snapshots[0].nav_eur };
}

  // più esecuzioni nello stesso giorno sovrascrivono: vince l'ultima
  const { error: upErr } = await supabase
    .from('nav_history')
    .upsert(snapshots, { onConflict: 'user_id,nav_date' });
  if (upErr) throw upErr;

  return { snapshot: snapshots.length, nav: snapshots[0].nav_eur };
}

export default async function handler(req, res) {
  // protezione: solo cron Vercel o chiamata con secret
  const auth = req.headers.authorization;
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Non autorizzato' });
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  try {
    const { data: quotes, error } = await supabase
      .from('instrument_quotes')
      .select('isin, symbol, currency')
      .eq('provider', 'yahoo')
      .eq('is_primary', true);

    if (error) throw error;
    if (!quotes?.length) return res.status(200).json({ message: 'Nessuno strumento mappato' });

    // cambio EUR/USD: una volta sola, riusato per tutti i titoli in USD
    let fx = null;
    try {
      const eurusd = await fetchQuote('EURUSD=X');
      fx = eurusd.price;
    } catch (e) {
      console.error('FX non disponibile:', e.message);
    }

    const rows = [];
    const errors = [];

    for (const q of quotes) {
      try {
        const quote = await fetchQuote(q.symbol);
        rows.push({
          isin: q.isin,
          price_date: quote.priceDate,
          price: quote.price,
          currency: quote.currency || q.currency,
          fx_rate: (quote.currency || q.currency) === 'EUR' ? 1 : fx,
          source: 'yahoo',
        });
      } catch (e) {
        errors.push(e.message);
      }
      // Yahoo non ama le raffiche: mezzo secondo tra le chiamate
      await new Promise(r => setTimeout(r, 500));
    }

    if (rows.length) {
      const { error: upsertError } = await supabase
        .from('price_history')
        .upsert(rows, { onConflict: 'isin,price_date' });
      if (upsertError) throw upsertError;
    }

    let ricorrenti = { generati: 0 };
    try {
      ricorrenti = await runRecurringRules(supabase);
    } catch (e) {
      console.error('Regole ricorrenti:', e.message);
      ricorrenti = { generati: 0, errore: e.message };
    }

    // dopo prezzi e movimenti, così il NAV riflette lo stato aggiornato
    let nav = { snapshot: 0 };
    try {
      nav = await snapshotNav(supabase);
    } catch (e) {
      console.error('Snapshot NAV:', e.message);
      nav = { snapshot: 0, errore: e.message };
    }

    return res.status(200).json({
      aggiornati: rows.length,
      falliti: errors.length,
      fx_eur_usd: fx,
      errori: errors,
      ricorrenti,
      nav,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
