// profile-store.js — persistenza dell'onboarding su Supabase.
// Responsabilità unica: leggere e scrivere. Nessuna logica, nessun DOM.
// Usa il client `sb` dichiarato in auth.js.

const LANG = 'it';   // in futuro: preferenza utente

// ═══════════════════════════════════════════════════════════
// LETTURA
// ═══════════════════════════════════════════════════════════

// Catalogo domande con opzioni, nella lingua scelta.
async function fetchQuestions(lang = LANG) {
  const { data, error } = await sb
    .from('v_questions')
    .select('*')
    .eq('lang', lang)
    .order('sort_order');

  if (error) throw error;
  return data || [];
}

// Risposte correnti, come mappa { codice: valore }.
// Le multiple tornano come array, le numeriche come numero.
async function fetchAnswers() {
  const { data, error } = await sb
    .from('user_answers')
    .select('code, value, values_multi, value_num')
    .is('valid_to', null);

  if (error) throw error;

  const out = {};
  (data || []).forEach(r => {
    if (r.values_multi !== null && r.values_multi !== undefined) out[r.code] = r.values_multi;
    else if (r.value_num !== null && r.value_num !== undefined)  out[r.code] = r.value_num;
    else out[r.code] = r.value;
  });
  return out;
}

// Profilo corrente, o null se non è mai stato calcolato.
async function fetchProfile() {
  const { data, error } = await sb
    .from('investor_profile')
    .select('*')
    .is('valid_to', null)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

// Regole derivate con il testo nella lingua scelta.
async function fetchRules(lang = LANG) {
  const { data, error } = await sb
    .from('profile_rules')
    .select('id, condition, agents, priority, active, profile_rule_translations(lang, text)')
    .eq('active', true)
    .order('priority');

  if (error) throw error;

  return (data || []).map(r => ({
    id: r.id,
    condition: r.condition,
    agents: r.agents,
    priority: r.priority,
    active: r.active,
    text: (r.profile_rule_translations || []).find(t => t.lang === lang)?.text || '',
  }));
}

// Dati di portafoglio che servono alle regole (flussi, zainetto fiscale).
async function fetchRuleContext() {
  const [ovw, tax] = await Promise.all([
    sb.from('v_overview').select('nav_gestito').maybeSingle(),
    sb.from('v_tax_credits').select('residuo_eur, giorni_alla_scadenza'),
  ]);

  const crediti = tax.data || [];
  const residuo = crediti.reduce((s, c) => s + Number(c.residuo_eur || 0), 0);
  const giorni = crediti.length
    ? Math.min(...crediti.map(c => Number(c.giorni_alla_scadenza)))
    : 99999;

  return {
    nav_gestito: Number(ovw.data?.nav_gestito) || 0,
    tax_credits_residuo: residuo,
    tax_credits_expiring_days: giorni,
  };
}

// ═══════════════════════════════════════════════════════════
// SCRITTURA
// ═══════════════════════════════════════════════════════════

// Salva una risposta. Storicizza la precedente invece di sovrascriverla.
async function saveAnswer(code, value, inputType = 'single', source = 'onboarding') {
  const { data: sess } = await sb.auth.getSession();
  const uid = sess?.session?.user?.id;
  if (!uid) throw new Error('Sessione assente');

  // chiude la risposta precedente, se esiste
  const { error: closeErr } = await sb
    .from('user_answers')
    .update({ valid_to: new Date().toISOString() })
    .eq('code', code)
    .is('valid_to', null);
  if (closeErr) throw closeErr;

  const riga = { user_id: uid, code, source };
  if (inputType === 'multi')       riga.values_multi = value;
  else if (inputType === 'number') riga.value_num = value;
  else                             riga.value = value;

  const { error } = await sb.from('user_answers').insert(riga);
  if (error) throw error;
}

// Salva il profilo derivato. Storicizza il precedente (R4, R11).
// reason: perché è cambiato — null all'onboarding iniziale.
async function saveProfile(profile, reason = null) {
  const { data: sess } = await sb.auth.getSession();
  const uid = sess?.session?.user?.id;
  if (!uid) throw new Error('Sessione assente');

  const { error: closeErr } = await sb
    .from('investor_profile')
    .update({ valid_to: new Date().toISOString() })
    .is('valid_to', null);
  if (closeErr) throw closeErr;

  const { error } = await sb
    .from('investor_profile')
    .insert({ ...profile, user_id: uid, change_reason: reason });
  if (error) throw error;
}

// Minusvalenze: sostituisce l'elenco completo (form F1b).
async function saveTaxCredits(tranches) {
  const { data: sess } = await sb.auth.getSession();
  const uid = sess?.session?.user?.id;
  if (!uid) throw new Error('Sessione assente');

  const { error: delErr } = await sb.from('tax_credits').delete().eq('user_id', uid);
  if (delErr) throw delErr;

  if (!tranches.length) return;

  const righe = tranches.map(t => ({
    user_id: uid,
    year_formed: Number(t.anno),
    amount_eur: Number(t.importo),
    amount_used: Number(t.usato) || 0,
    note: t.nota || null,
  }));

  const { error } = await sb.from('tax_credits').insert(righe);
  if (error) throw error;
}

// Applica al mandato i pesi standard (risposta A3 = 'standard').
async function applyStandardMandate() {
  const { data: sess } = await sb.auth.getSession();
  const uid = sess?.session?.user?.id;
  if (!uid) throw new Error('Sessione assente');

  // Allocazione di partenza convenzionale: ETF diversificati + riserva.
  // Azioni singole e crypto restano a zero: si aggiungono come scelta esplicita.
  const standard = [
    { asset_class: 'ETF',    target_weight: 85, min_weight: 70, max_weight: 95 },
    { asset_class: 'Cash',   target_weight: 15, min_weight: 5,  max_weight: 30 },
    { asset_class: 'Azioni', target_weight: 0,  min_weight: 0,  max_weight: 20 },
    { asset_class: 'Crypto', target_weight: 0,  min_weight: 0,  max_weight: 5  },
  ];

  const { error } = await sb
    .from('mandate')
    .upsert(standard.map(r => ({ ...r, user_id: uid, source: 'default' })),
            { onConflict: 'user_id,asset_class' });
  if (error) throw error;
}

// Stato dell'onboarding: cosa manca.
async function onboardingStatus() {
  const [questions, answers, profile] = await Promise.all([
    fetchQuestions(), fetchAnswers(), fetchProfile(),
  ]);

  const setupDomande = visibleQuestions(questions, answers, 'setup');
  const setupFatto = setupDomande.every(q => answers[q.code] !== undefined);

  return {
    questions,
    answers,
    profile,
    setupCompletato: setupFatto,
    profiloCompletato: !!profile && Number(profile.completeness) >= 1,
    completeness: profile ? Number(profile.completeness) : 0,
  };
}
