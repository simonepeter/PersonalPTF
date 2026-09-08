// profile-logic.js — logica pura dell'onboarding.
// Nessun DOM, nessuna rete: valuta condizioni e deriva il profilo.
// Testabile isolatamente.

// ═══════════════════════════════════════════════════════════
// 1. VALUTAZIONE DELLE CONDIZIONI (visible_if)
// ═══════════════════════════════════════════════════════════
//
// Sintassi supportata:
//   A1 = 'none'              uguale
//   A1 != 'none'             diverso
//   E2 includes 'stocks'     la risposta multipla contiene il valore
//   B3 answered              esiste una risposta
//
// answers: { A1: 'none', E2: ['etf','stocks'], ... }

const COND_RE = /^\s*([A-Za-z0-9_]+)\s+(=|!=|includes|answered)\s*(?:'([^']*)')?\s*$/;

function evalCondition(expr, answers) {
  if (!expr) return true;                       // nessuna condizione = sempre visibile

  const m = COND_RE.exec(expr);
  if (!m) {
    console.warn('Condizione non riconosciuta, domanda mostrata:', expr);
    return true;                                // fallback prudente: mostra
  }

  const [, code, op, value] = m;
  const a = answers[code];

  switch (op) {
    case 'answered':
      return a !== undefined && a !== null && a !== '';
    case '=':
      return a === value;
    case '!=':
      return a !== undefined && a !== value;    // non risposta ≠ soddisfatta
    case 'includes':
      return Array.isArray(a) && a.includes(value);
    default:
      return true;
  }
}

// Domande visibili, in ordine, per il livello richiesto.
// level: 'setup' | 'profile' | 'all'
function visibleQuestions(questions, answers, level = 'all') {
  return questions
    .filter(q => level === 'all' || q.level === level)
    .filter(q => evalCondition(q.visible_if, answers))
    .sort((a, b) => a.sort_order - b.sort_order);
}

// ═══════════════════════════════════════════════════════════
// 2. MAPPATURA RISPOSTE → PROFILO DERIVATO
// ═══════════════════════════════════════════════════════════
//
// Le risposte grezze restano in user_answers.
// Il profilo è la sintesi che leggono gli agenti (R2).

const HORIZON_YEARS = { lt2: 1, '3_5': 4, '5_10': 7, gt10: 15, unknown: null };
const BUFFER_MONTHS = { lt3: 1, '3_6': 4, '6_12': 9, gt12: 18 };
const MONTHLY_FLOW  = { none: 0, to250: 150, '250_500': 375, '500_1000': 750, over1000: 1200 };

const LOSS_REACTION = {
  double: 'buy_more', normal: 'hold', pause: 'reduce', sell: 'exit',
};

const GOAL = {
  growth: 'growth', income: 'income',
  inflation: 'inflation_hedge', outperform: 'outperform',
};

const EXPERIENCE = {
  starting: 'beginner', under2: 'under2y', '2to5': '2to5y', over5: 'over5y',
};

const FLOW_STABILITY = {
  fixed: 'fixed', variable: 'variable', occasional: 'occasional',
};

function deriveProfile(answers, questions) {
  const g = code => answers[code];

  const profile = {
    horizon_years:         HORIZON_YEARS[g('B2')] ?? null,
    emergency_months:      BUFFER_MONTHS[g('B1')] ?? null,
    loss_reaction:         LOSS_REACTION[g('C1')] ?? null,
    primary_goal:          GOAL[g('D1')] ?? null,
    experience:            EXPERIENCE[g('E1')] ?? null,
    single_position_risk:  g('D2') ?? null,
    target_reached_action: g('D3') ?? null,
    pension_treatment:     g('H2') ?? null,
    monthly_flow_eur:      MONTHLY_FLOW[g('A1')] ?? null,
    flow_stability:        FLOW_STABILITY[g('A2')] ?? null,
    notify_when_idle:      g('G3') === 'yes',
  };

  // Rischio di liquidità: il cuscinetto va letto insieme alla stabilità
  // del reddito e alle spese in programma. Meno di 3 mesi con contratto
  // stabile e nessuna spesa prevista non è la stessa cosa di meno di 3
  // mesi con reddito variabile.
  profile.liquidity_risk = deriveLiquidityRisk(answers);

  profile.completeness = computeCompleteness(answers, questions);
  return profile;
}

function deriveLiquidityRisk(answers) {
  const mesi = BUFFER_MONTHS[answers.B1];
  if (mesi === undefined || mesi === null) return null;

  const redditoInstabile = answers.B4 === 'variable';
  const spesaVicina = answers.B3 === 'lt2';
  const spesaLontana = answers.B3 === 'gt2';

  if (mesi >= 12) return 'low';

  if (mesi < 3) {
    if (redditoInstabile || spesaVicina) return 'high';
    if (spesaLontana || answers.B4 === 'fairly') return 'medium';
    return 'medium';                       // riserva sottile: mai 'low'
  }

  if (mesi < 6) {
    if (redditoInstabile && spesaVicina) return 'high';
    if (redditoInstabile || spesaVicina) return 'medium';
    return 'low';
  }

  return (redditoInstabile && spesaVicina) ? 'medium' : 'low';
}

// Quota di domande di profilo visibili a cui è stata data risposta.
function computeCompleteness(answers, questions) {
  const visibili = visibleQuestions(questions, answers, 'profile')
    .filter(q => q.input_type !== 'form');       // i form rimandabili non contano
  if (!visibili.length) return 0;

  const risposte = visibili.filter(q => {
    const a = answers[q.code];
    return a !== undefined && a !== null && a !== ''
      && !(Array.isArray(a) && a.length === 0);
  });

  return Math.round((risposte.length / visibili.length) * 100) / 100;
}

// ═══════════════════════════════════════════════════════════
// 3. CONTESTO PER LE REGOLE DERIVATE
// ═══════════════════════════════════════════════════════════
//
// Le regole in profile_rules hanno condizioni su campi che non stanno
// tutti nel profilo: alcuni vengono dalle risposte grezze, altri dal
// portafoglio. Qui si compone il contesto completo.

function buildRuleContext(profile, answers, portfolio = {}) {
  // Flusso totale = PAC + versamenti previdenziali ricorrenti.
  // Restano distinti: crescono con logiche diverse.
  const pac = Number(profile.monthly_flow_eur) || 0;
  const previdenza = Number(portfolio.pension_flow_eur) || 0;

  return {
    ...profile,
    pac_flow_eur: pac,
    pension_flow_eur: previdenza,
    total_flow_eur: pac + previdenza,
    income_stability:          answers.B4 ?? null,
    sold_at_loss_before:       answers.C3 ?? null,
    check_frequency:           answers.C4 ?? null,
    fees_sensitivity:          answers.G2 ?? null,
    pension_line:              answers.H3 ?? null,
    nav_gestito:               portfolio.nav_gestito ?? 0,
    tax_credits_residuo:       portfolio.tax_credits_residuo ?? 0,
    tax_credits_expiring_days: portfolio.tax_credits_expiring_days ?? 99999,
  };
}

// ═══════════════════════════════════════════════════════════
// 4. VALUTAZIONE DELLE REGOLE DERIVATE
// ═══════════════════════════════════════════════════════════
//
// Sintassi supportata nelle condizioni di profile_rules:
//   horizon_years < 3
//   emergency_months >= 12
//   loss_reaction = 'buy_more'
//   experience in ('starting','under2')
//   notify_when_idle = false
//   monthly_flow_eur * 12 > nav_gestito * 0.3

const RULE_CMP = /^\s*([a-z_]+)\s*(<=|>=|<|>|=|!=)\s*(.+?)\s*$/;
const RULE_IN  = /^\s*([a-z_]+)\s+in\s*\((.+)\)\s*$/;
const RULE_EXPR = /^\s*([a-z_]+)\s*\*\s*([\d.]+)\s*(<=|>=|<|>)\s*([a-z_]+)\s*\*\s*([\d.]+)\s*$/;

function evalRule(condition, ctx) {
  if (!condition) return false;

  // forma: campo * n  OP  campo * n
  const e = RULE_EXPR.exec(condition);
  if (e) {
    const [, l, lm, op, r, rm] = e;
    const lv = Number(ctx[l]);
    const rv = Number(ctx[r]);
    if (!isFinite(lv) || !isFinite(rv)) return false;
    return compare(lv * Number(lm), op, rv * Number(rm));
  }

  // forma: campo in ('a','b')
  const i = RULE_IN.exec(condition);
  if (i) {
    const [, field, list] = i;
    const valori = list.split(',').map(v => v.trim().replace(/^'|'$/g, ''));
    return valori.includes(ctx[field]);
  }

  // forma: campo OP valore
  const c = RULE_CMP.exec(condition);
  if (c) {
    const [, field, op, rawVal] = c;
    const actual = ctx[field];
    if (actual === null || actual === undefined) return false;

    let expected = rawVal.trim();
    if (/^'.*'$/.test(expected)) {
      expected = expected.slice(1, -1);
      return op === '!=' ? actual !== expected : actual === expected;
    }
    if (expected === 'true')  return actual === true;
    if (expected === 'false') return actual === false;

    const num = Number(expected);
    if (!isFinite(num) || !isFinite(Number(actual))) return false;
    return compare(Number(actual), op, num);
  }

  console.warn('Regola non riconosciuta, ignorata:', condition);
  return false;
}

function compare(a, op, b) {
  switch (op) {
    case '<':  return a <  b;
    case '<=': return a <= b;
    case '>':  return a >  b;
    case '>=': return a >= b;
    case '=':  return a === b;
    case '!=': return a !== b;
    default:   return false;
  }
}

// Regole attive per un agente, ordinate per priorità.
function activeRules(rules, ctx, agent) {
  return rules
    .filter(r => r.active !== false)
    .filter(r => !agent || (r.agents || []).includes(agent))
    .filter(r => evalRule(r.condition, ctx))
    .sort((a, b) => a.priority - b.priority);
}

// ═══════════════════════════════════════════════════════════
// Export per i test (in browser le funzioni sono già globali)
// ═══════════════════════════════════════════════════════════
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    evalCondition, visibleQuestions,
    deriveProfile, computeCompleteness,
    buildRuleContext, evalRule, activeRules,
  };
}
