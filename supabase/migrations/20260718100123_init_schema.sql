-- ============================================================
-- PersonalPTF — Schema Postgres (Supabase)
-- Pensato per: uso singolo utente oggi, multi-utente domani
-- ============================================================

-- Estensione per UUID
create extension if not exists "uuid-ossp";

-- ------------------------------------------------------------
-- TRANSACTIONS — log operazioni (buy/sell/deposit)
-- Sostituisce il tab "Transactions" del Google Sheet
-- ------------------------------------------------------------
create table transactions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null default '00000000-0000-0000-0000-000000000001', -- placeholder finché non c'è auth reale
  operation_date date not null,        -- "Data valuta" da Fineco
  trade_date date,                     -- "Operazione" data da Fineco (può differire)
  operation_type text not null,        -- 'buy' | 'sell' | 'deposit' | 'withdrawal'
  ticker text,                         -- es. SWDA.MI (formato Yahoo, per pricing)
  isin text,                           -- ISIN da Fineco, fonte di verità per matching
  description text,                    -- descrizione originale Fineco (es. "AM IS M EMKTS UEDRC")
  quantity numeric,
  currency text not null default 'EUR',
  price numeric,                       -- prezzo unitario in valuta nativa
  fx_rate numeric default 1.0,         -- cambio al momento dell'operazione
  gross_amount numeric,                -- controvalore
  commission numeric default 0,
  notes text,
  created_at timestamptz default now()
);

create index idx_transactions_user on transactions(user_id);
create index idx_transactions_isin on transactions(isin);
create index idx_transactions_date on transactions(operation_date);

-- ------------------------------------------------------------
-- INSTRUMENTS — anagrafica titoli (evita di ripetere ISIN/ticker ovunque)
-- ------------------------------------------------------------
create table instruments (
  isin text primary key,
  ticker text,                         -- ticker Yahoo Finance per pricing (es. SWDA.MI)
  fineco_ticker text,                  -- ticker come appare su Fineco, se diverso
  name text,
  asset_class text,                    -- 'etf_core' | 'etf_satellite' | 'stock' | 'crypto'
  currency text,
  category text                        -- es. 'Category A +100%', 'Category B +50%' per singole azioni
);

-- ------------------------------------------------------------
-- PRICE_HISTORY — snapshot storico prezzi (per NAV e risk metrics)
-- ------------------------------------------------------------
create table price_history (
  id uuid primary key default uuid_generate_v4(),
  isin text references instruments(isin),
  price_date date not null,
  price numeric not null,
  currency text not null,
  fx_rate numeric default 1.0,
  source text default 'manual',        -- 'googlefinance' | 'yahoo' | 'coingecko' | 'manual'
  created_at timestamptz default now(),
  unique(isin, price_date)
);

-- ------------------------------------------------------------
-- NAV_HISTORY — NAV giornaliero portafoglio (per TWR e benchmark)
-- ------------------------------------------------------------
create table nav_history (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null default '00000000-0000-0000-0000-000000000001',
  nav_date date not null,
  nav_eur numeric not null,
  benchmark_value numeric,             -- MSCI World o benchmark scelto
  cash_flow numeric default 0,         -- per calcolo TWR (esclude effetto PAC)
  created_at timestamptz default now(),
  unique(user_id, nav_date)
);

-- ------------------------------------------------------------
-- PENDING_ACTIONS — proposte scritte dagli agenti AI, NON eseguite
-- L'agente scrive qui, l'utente conferma dal frontend, SOLO ALLORA
-- si crea la riga vera in transactions. Mai scrittura diretta.
-- ------------------------------------------------------------
create table pending_actions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null default '00000000-0000-0000-0000-000000000001',
  proposed_by text not null,           -- 'portfolio_manager' | 'risk_manager' | 'market_analyst'
  action_type text not null,           -- 'trim' | 'rebalance' | 'buy' | 'sell'
  payload jsonb not null,              -- dettagli proposta (ticker, qty, motivazione)
  status text not null default 'pending', -- 'pending' | 'confirmed' | 'rejected'
  created_at timestamptz default now(),
  resolved_at timestamptz
);

-- ------------------------------------------------------------
-- MANDATE — pesi target per asset class (sostituisce tab Mandate)
-- ------------------------------------------------------------
create table mandate (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null default '00000000-0000-0000-0000-000000000001',
  asset_class text not null,
  target_weight numeric not null,
  min_weight numeric,
  max_weight numeric,
  updated_at timestamptz default now()
);

-- ------------------------------------------------------------
-- Row Level Security — predisposta per multi-utente futuro
-- Oggi permissiva (tutto visibile), domani si stringe per utente
-- ------------------------------------------------------------
alter table transactions enable row level security;
alter table nav_history enable row level security;
alter table pending_actions enable row level security;
alter table mandate enable row level security;

-- Policy permissiva temporanea (single-user). Da sostituire con
-- auth.uid() = user_id quando si attiva l'auth multi-utente.
create policy "allow_all_transactions" on transactions for all using (true);
create policy "allow_all_nav" on nav_history for all using (true);
create policy "allow_all_pending" on pending_actions for all using (true);
create policy "allow_all_mandate" on mandate for all using (true);
