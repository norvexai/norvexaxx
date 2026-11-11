-- NORVEXA INVEST GLOBAL — Production PostgreSQL Schema
-- Run with: npm run db:init (or) psql "$DATABASE_URL" -f db/schema.sql

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

-- ---------- Enums ----------
DO $$ BEGIN CREATE TYPE user_role           AS ENUM ('CUSTOMER','ADMIN','TRADER','COMPLIANCE','FINANCE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE request_status      AS ENUM ('PENDING','APPROVED','REJECTED');                    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE subscription_status AS ENUM ('ACTIVE','CANCELLED','EXPIRED');                     EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE trade_status        AS ENUM ('OPEN','CLOSED','CANCELLED');                        EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE ledger_type         AS ENUM ('DEPOSIT','WITHDRAWAL','TRADE_PNL','FEE','ADJUSTMENT','INVESTMENT','CAPITAL_RETURN','PROFIT'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE ledger_direction    AS ENUM ('CREDIT','DEBIT');                                   EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE trade_market        AS ENUM ('CRYPTO','FOREX','COMMODITY');                       EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE trade_side          AS ENUM ('BUY','SELL');                                       EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE crypto_currency     AS ENUM ('BTC','USDT','ETH');                                 EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE kyc_status          AS ENUM ('PENDING','VERIFIED','REJECTED');                    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------- Users (Enhanced for Production) ----------
CREATE TABLE IF NOT EXISTS users (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name           text        NOT NULL CHECK (char_length(name) BETWEEN 2 AND 80),
  email          citext      NOT NULL UNIQUE,
  password_hash  text        NOT NULL,
  role           user_role   NOT NULL DEFAULT 'CUSTOMER',
  phone          text,
  address        text,
  city           text,
  state          text,
  country        text,
  zip_code       text,
  profile_image  text,              -- Cloudinary URL
  cloudinary_id  text,              -- Cloudinary public_id for deletion
  email_verified boolean     NOT NULL DEFAULT false,
  email_verify_token text,
  phone_verified boolean     NOT NULL DEFAULT false,
  kyc_status     kyc_status  NOT NULL DEFAULT 'PENDING',
  kyc_submitted_at timestamptz,
  kyc_reviewed_at  timestamptz,
  kyc_notes      text,
  last_login_at  timestamptz,
  login_attempts integer     NOT NULL DEFAULT 0,
  locked_until   timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- ---------- Trading Plans ----------
CREATE TABLE IF NOT EXISTS trading_plans (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name             text    NOT NULL UNIQUE,
  description      text    NOT NULL,
  price_usd_cents  integer NOT NULL CHECK (price_usd_cents > 0),
  duration_days    integer NOT NULL CHECK (duration_days > 0),
  risk_label       text    NOT NULL,
  min_deposit_cents    bigint  NOT NULL DEFAULT 0,
  max_deposit_cents    bigint,
  weekly_return_pct    numeric(5,2) NOT NULL DEFAULT 0,
  total_return_pct     numeric(5,2) NOT NULL DEFAULT 0,
  capital_return_freq  text    NOT NULL DEFAULT 'weekly',
  plan_tier            integer NOT NULL DEFAULT 1,
  active           boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- ---------- Subscriptions ----------
CREATE TABLE IF NOT EXISTS subscriptions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id     uuid NOT NULL REFERENCES trading_plans(id),
  amount_cents bigint NOT NULL DEFAULT 0,
  status      subscription_status NOT NULL DEFAULT 'ACTIVE',
  started_at  timestamptz NOT NULL DEFAULT now(),
  ends_at     timestamptz NOT NULL,
  returns_paid integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS subscriptions_user_idx ON subscriptions(user_id, started_at DESC);

-- ---------- Trading Accounts ----------
CREATE TABLE IF NOT EXISTS trading_accounts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label       text NOT NULL,
  currency    char(3) NOT NULL DEFAULT 'USD',
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS trading_accounts_user_idx ON trading_accounts(user_id);

-- ---------- Deposit Requests (with TXID) ----------
CREATE TABLE IF NOT EXISTS deposit_requests (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id   uuid NOT NULL REFERENCES trading_accounts(id) ON DELETE CASCADE,
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  currency     crypto_currency NOT NULL DEFAULT 'BTC',
  txid         text,                -- Blockchain transaction ID
  txid_verified boolean NOT NULL DEFAULT false,
  txid_verified_at timestamptz,
  reference    text,
  notes        text,
  status       request_status NOT NULL DEFAULT 'PENDING',
  created_at   timestamptz NOT NULL DEFAULT now(),
  reviewed_at  timestamptz,
  reviewed_by  uuid REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS deposit_requests_user_idx    ON deposit_requests(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS deposit_requests_pending_idx ON deposit_requests(created_at) WHERE status = 'PENDING';
CREATE INDEX IF NOT EXISTS deposit_requests_txid_idx    ON deposit_requests(txid) WHERE txid IS NOT NULL;

-- ---------- Withdrawal Requests ----------
CREATE TABLE IF NOT EXISTS withdrawal_requests (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id   uuid NOT NULL REFERENCES trading_accounts(id) ON DELETE CASCADE,
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  destination  text   NOT NULL,
  status       request_status NOT NULL DEFAULT 'PENDING',
  created_at   timestamptz NOT NULL DEFAULT now(),
  reviewed_at  timestamptz,
  reviewed_by  uuid REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS withdrawal_requests_user_idx    ON withdrawal_requests(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS withdrawal_requests_pending_idx ON withdrawal_requests(created_at) WHERE status = 'PENDING';

-- ---------- Trades ----------
CREATE TABLE IF NOT EXISTS trades (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id   uuid NOT NULL REFERENCES trading_accounts(id) ON DELETE CASCADE,
  market       trade_market NOT NULL,
  symbol       text NOT NULL,
  side         trade_side   NOT NULL,
  quantity     text NOT NULL,
  entry_price  text NOT NULL,
  exit_price   text,
  pnl_cents    bigint,
  status       trade_status NOT NULL DEFAULT 'OPEN',
  notes        text,
  recorded_at  timestamptz NOT NULL DEFAULT now(),
  closed_at    timestamptz
);
CREATE INDEX IF NOT EXISTS trades_account_idx ON trades(account_id, recorded_at DESC);

-- ---------- Ledger (Append-Only) ----------
CREATE TABLE IF NOT EXISTS ledger_entries (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id   uuid NOT NULL REFERENCES trading_accounts(id) ON DELETE CASCADE,
  type         ledger_type      NOT NULL,
  amount_cents bigint           NOT NULL CHECK (amount_cents > 0),
  direction    ledger_direction NOT NULL,
  description  text NOT NULL,
  reference    text NOT NULL UNIQUE,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ledger_account_idx ON ledger_entries(account_id, created_at DESC);

-- ---------- Audit Logs ----------
CREATE TABLE IF NOT EXISTS audit_logs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id     uuid NOT NULL REFERENCES users(id),
  action       text NOT NULL,
  entity_type  text NOT NULL,
  entity_id    uuid NOT NULL,
  metadata     jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_logs_entity_idx ON audit_logs(entity_type, entity_id);

-- ---------- Deposit Addresses ----------
CREATE TABLE IF NOT EXISTS deposit_addresses (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  currency     crypto_currency NOT NULL UNIQUE,
  address      text NOT NULL,
  network      text NOT NULL DEFAULT '',
  label        text NOT NULL DEFAULT '',
  active       boolean NOT NULL DEFAULT true,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  updated_by   uuid REFERENCES users(id)
);

-- ---------- Chat Messages ----------
CREATE TABLE IF NOT EXISTS chat_messages (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message      text NOT NULL,
  sender_type  text NOT NULL DEFAULT 'CUSTOMER',  -- CUSTOMER, ADMIN
  read         boolean NOT NULL DEFAULT false,
  read_at      timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS chat_messages_user_idx ON chat_messages(user_id, created_at);

-- ---------- Email Queue ----------
CREATE TABLE IF NOT EXISTS email_queue (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  to_email     text NOT NULL,
  subject      text NOT NULL,
  body_html    text NOT NULL,
  body_text    text,
  sent         boolean NOT NULL DEFAULT false,
  sent_at      timestamptz,
  attempts     integer NOT NULL DEFAULT 0,
  error        text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- ---------- Security: Ledger Append-Only ----------
CREATE OR REPLACE FUNCTION forbid_ledger_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'ledger_entries is append-only';
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ledger_no_update ON ledger_entries;
CREATE TRIGGER ledger_no_update BEFORE UPDATE ON ledger_entries
  FOR EACH ROW EXECUTE FUNCTION forbid_ledger_mutation();

-- ---------- updated_at Maintenance ----------
CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS users_touch ON users;
CREATE TRIGGER users_touch BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS deposit_addresses_touch ON deposit_addresses;
CREATE TRIGGER deposit_addresses_touch BEFORE UPDATE ON deposit_addresses
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ---------- Balances View ----------
CREATE OR REPLACE VIEW account_balances AS
SELECT a.id AS account_id,
       a.user_id,
       COALESCE(SUM(CASE l.direction WHEN 'CREDIT' THEN l.amount_cents ELSE -l.amount_cents END), 0)::bigint AS balance_cents,
       COUNT(l.id)::int AS ledger_count
FROM trading_accounts a
LEFT JOIN ledger_entries l ON l.account_id = a.id
GROUP BY a.id, a.user_id;

-- ---------- Seed: Investment Plans ----------
INSERT INTO trading_plans (name, description, price_usd_cents, duration_days, risk_label, min_deposit_cents, max_deposit_cents, weekly_return_pct, total_return_pct, capital_return_freq, plan_tier) VALUES
  ('Bronze',   'Fixed capital plan. Weekly capital return at 10% for 2 weeks. Total return: 10% of initial deposit.',   10000,  14, 'Moderate risk',  10000,   50000,  10.00,  10.00, 'weekly', 1),
  ('Silver',   'Fixed capital plan. Weekly capital return at 15%. Total return: 15% of initial deposit.',                 25000,  30, 'Moderate risk',  25000,  100000,  15.00,  15.00, 'weekly', 2),
  ('Gold',     'Fixed capital plan. Weekly capital return at 20%. Total return: 20% of initial deposit.',                 50000,  30, 'Elevated risk',  50000,  500000,  20.00,  20.00, 'weekly', 3),
  ('Platinum', 'Fixed capital plan. Weekly capital return at 25% for 3 weeks. Total return: 25% of initial deposit.',     100000, 21, 'High risk',     100000,  NULL,   25.00,  25.00, 'weekly', 4),
  ('Elite',    'Premium fixed capital plan. Daily capital return at 50% for 7 days. Total return: 450% of initial deposit.', 500000, 7, 'Very high risk', 500000, NULL,   50.00, 450.00, 'daily',  5)
ON CONFLICT (name) DO NOTHING;

-- ---------- Seed: Deposit Addresses ----------
INSERT INTO deposit_addresses (currency, address, network, label) VALUES
  ('BTC',  'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh', 'Bitcoin (BTC)',    'Bitcoin deposit address'),
  ('USDT', 'TQrY8aC2eHhLzB1dZ9mV3xK7pN4wR5tY6u',           'TRC20 (Tron)',     'Tether (USDT) deposit address'),
  ('ETH',  '0x71C7656EC7ab88b098defB751B7401B5f6d8976F', 'ERC20 (Ethereum)', 'Ethereum deposit address')
ON CONFLICT (currency) DO NOTHING;

-- ---------- Seed: Admin (CHANGE BEFORE PRODUCTION) ----------
INSERT INTO users (name, email, password_hash, role, email_verified)
VALUES ('NORVEXA Admin', 'admin@norvexa.local', crypt('ChangeMe123!', gen_salt('bf', 12)), 'ADMIN', true)
ON CONFLICT (email) DO NOTHING;
