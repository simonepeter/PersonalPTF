const L = require('./profile-logic.js');
let ok=0, ko=0;
const t=(nome,a,b)=>{const p=JSON.stringify(a)===JSON.stringify(b);
  if(p){ok++}else{ko++;console.log('  FALLITO:',nome,'→',JSON.stringify(a),'≠',JSON.stringify(b))}};

// condizioni
const ans = { A1:'250_500', B3:'no', E2:['etf','stocks'], H1:'yes' };
t('= vero',    L.evalCondition("H1 = 'yes'", ans), true);
t('= falso',   L.evalCondition("H1 = 'no'", ans), false);
t('!= vero',   L.evalCondition("A1 != 'none'", ans), true);
t('!= su non risposta', L.evalCondition("Z9 != 'x'", ans), false);
t('includes',  L.evalCondition("E2 includes 'stocks'", ans), true);
t('includes no',L.evalCondition("E2 includes 'crypto'", ans), false);
t('answered',  L.evalCondition("B3 answered", ans), true);
t('null cond', L.evalCondition(null, ans), true);

// profilo derivato
const full = { A1:'500_1000', A2:'fixed', B1:'6_12', B2:'gt10', C1:'normal',
               D1:'growth', D2:'small', D3:'free_ride', E1:'2to5', G3:'no', H2:'part_of_wealth' };
const p = L.deriveProfile(full, []);
t('orizzonte', p.horizon_years, 15);
t('cuscinetto', p.emergency_months, 9);
t('reazione', p.loss_reaction, 'hold');
t('flusso', p.monthly_flow_eur, 750);
t('notifiche', p.notify_when_idle, false);

// regole
const ctx = L.buildRuleContext(p, {...full, B4:'very', C3:'never'},
              { nav_gestito:23400, tax_credits_residuo:1500, tax_credits_expiring_days:90 });
t('minore',      L.evalRule('horizon_years < 3', ctx), false);
t('maggiore-uguale', L.evalRule('horizon_years >= 10', ctx), true);
t('stringa',     L.evalRule("loss_reaction = 'hold'", ctx), true);
t('in lista',    L.evalRule("experience in ('starting','under2')", ctx), false);
t('booleano',    L.evalRule('notify_when_idle = false', ctx), true);
t('scadenza',    L.evalRule('tax_credits_expiring_days < 120', ctx), true);
t('espressione', L.evalRule('monthly_flow_eur * 12 > nav_gestito * 0.3', ctx), true);
t('campo nullo', L.evalRule('inesistente < 5', ctx), false);

console.log(`\n${ok} superati, ${ko} falliti`);
process.exit(ko ? 1 : 0);
