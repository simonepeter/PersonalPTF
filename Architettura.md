# PersonalPTF — Architettura dei moduli

Regola: **un file, una responsabilità.** Nessun modulo modifica `app.js`.

---

## Ordine di caricamento

L'ordine in `index.html` non è arbitrario: ogni modulo dipende dai precedenti,
e alcune dichiarazioni ne sovrascrivono altre di proposito.

```
1. supabase-js (CDN)   libreria esterna
2. auth.js             client sb + sessione + login
3. app.js              rendering e stato UI (mai modificato)
4. data.js             sovrascrive loadData() → legge da Supabase
5. prices-ui.js        aggiornamento prezzi on-demand
6. settings.js         tab Setup + override di renderTab()
```

Il pattern della sovrascrittura: `data.js` e `settings.js` ridichiarano
funzioni già definite in `app.js`. Essendo caricati dopo, vincono. È il modo
di estendere `app.js` senza toccarlo.

---

## Responsabilità

| Modulo | Fa | Non fa |
|---|---|---|
| `auth.js` | Client Supabase, sessione, login, logout | Non legge dati di portafoglio |
| `app.js` | Rendering tab, grafici SVG, form, stato UI | Non parla con Supabase |
| `data.js` | Query alle viste, mappatura verso `DATA` | Non renderizza |
| `prices-ui.js` | Chiama `/api/prices`, poi `loadData()` | Non conosce lo schema DB |
| `settings.js` | Editor mandato e target, validazione | Non aggiorna prezzi |

Il client `sb` è dichiarato una volta sola in `auth.js` e usato da tutti.

---

## Backend

| File | Responsabilità |
|---|---|
| `api/prices.js` | Prezzi Yahoo, movimenti ricorrenti, snapshot NAV |
| `api/claude.js` | Proxy verso l'API Anthropic |

`api/prices.js` contiene tre funzioni indipendenti (`fetchQuote`,
`runRecurringRules`, `snapshotNav`), ciascuna in try/catch separato: se una
fallisce, le altre completano.

---

## Livello dati

Le viste Postgres sono il confine fra dati grezzi e applicazione. Il frontend
non fa join né calcoli: legge viste già pronte.

| Vista | Restituisce |
|---|---|
| `v_positions` | Posizioni con quantità, carico medio, market value, P&L |
| `v_overview` | NAV gestito, stabile, totale, P&L, cash |
| `v_asset_balances` | Saldi degli asset non quotati |
| `v_metrics` | Informative bilingui su formule e limiti |
| `v_questions` | Domande onboarding con opzioni, per lingua |
| `v_tax_credits` | Minusvalenze con residuo e giorni alla scadenza |

---

## In arrivo: onboarding

Tre moduli, separati per testabilità:

| Modulo | Responsabilità |
|---|---|
| `profile-logic.js` | Valuta `visible_if`, calcola il profilo derivato dalle risposte. Nessun DOM, nessuna rete: testabile isolatamente |
| `onboarding-ui.js` | Rendering delle schermate, navigazione fra domande |
| `profile-store.js` | Lettura domande e scrittura risposte su Supabase |

Dipendenze: `onboarding-ui` usa `profile-logic` e `profile-store`;
`profile-logic` non dipende da nessuno.

---

## Quando aggiungere un modulo

Un file nuovo quando la funzionalità:

- risponde a una domanda diversa (dati vs rendering vs persistenza)
- può essere testata da sola
- potrebbe essere rimossa senza toccare il resto

`refreshPrices` viveva in `settings.js` per comodità: aggiornare i prezzi non
c'entra con l'editing del mandato. Spostata in `prices-ui.js` prima che
`settings.js` diventasse un secondo `app.js`.
