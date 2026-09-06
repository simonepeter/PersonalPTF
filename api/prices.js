// api/prices.js — aggiorna price_history da Yahoo Finance
// Girare su Vercel (cron giornaliero o chiamata manuale).
// Env richieste: SUPABASE_URL, SUPABASE_SERVICE_KEY, CRON_SECRET

import { createClient } from '@supabase/supabase-js';

const YAHOO = 'https://query1.finance.yahoo.com/v8/finance/chart/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36';

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

    return res.status(200).json({
      aggiornati: rows.length,
      falliti: errors.length,
      fx_eur_usd: fx,
      errori: errors,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
