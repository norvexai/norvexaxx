# NORVEXA INVEST GLOBAL — Full-stack platform

A full-stack investment platform with:
- Public marketing website with live markets
- Customer registration/login
- Customer dashboard with investment plans
- 5-tier investment plans (Bronze, Silver, Gold, Platinum, Elite)
- Multi-crypto deposit support (BTC, USDT, ETH)
- Deposit and withdrawal request workflows
- Admin dashboard with balance adjustment controls
- Admin-configurable deposit addresses
- Trade/activity records and performance summaries
- PostgreSQL schema in plain SQL (no ORM)

## Investment Plans

| Plan | Min Deposit | Max Deposit | Return Rate | Duration | Total Return |
|------|-------------|-------------|-------------|----------|--------------|
| Bronze | $100 | $500 | 10% weekly | 2 weeks | 10% |
| Silver | $250 | $1,000 | 15% weekly | Flexible | 15% |
| Gold | $500 | $5,000 | 20% weekly | Flexible | 20% |
| Platinum | $1,000 | Unlimited | 25% weekly | 3 weeks | 25% |
| Elite | $5,000 | Unlimited | 50% daily | 7 days | 450% |

## Important launch limitation

This is a **development MVP scaffold**, not a licensed investment platform and not production-ready custody/payment/trading infrastructure. Payment confirmation, client-money custody, broker/exchange connectivity, KYC verification and trade execution are intentionally manual/demo workflows. Do not accept customer funds or represent simulated trades as live performance until the business has obtained applicable legal/regulatory advice, approvals and independently reviewed security/payment integrations.

No returns are promised. Trading can result in loss of capital.

## Requirements

- Node.js 20+
- PostgreSQL 15+
- npm

## Project layout

- `client/` — React + Vite + Tailwind frontend
- `server/` — Express API (`pg` driver) and `db/schema.sql`

## 1. Configure the database

Create an empty PostgreSQL database, then:

```bash
cd server
cp .env.example .env      # set DATABASE_URL and a long random SESSION_SECRET
npm install
npm run db:init           # applies db/schema.sql (safe to re-run)
npm run dev
```

The backend is plain SQL: `server/db/schema.sql` creates the enums, tables, indexes, the append-only ledger trigger,
the `account_balances` view, the five investment plans, default deposit addresses and the demo admin.

Demo admin (created by schema.sql): `admin@norvexa.local` / `ChangeMe123!`.
**Change the email and password in schema.sql, or delete that INSERT, before any shared deployment.**

The API runs at `http://localhost:4000`.

## 2. Start the frontend

```bash
cd client
npm install
cp .env.example .env
npm run dev
```

Open `http://localhost:5173`.

## Admin features

1. **Balance Adjustment**: Go to Admin → Adjust Balance tab. Select a customer, choose Credit (increase) or Debit (decrease), enter amount and reason. Use this to record trade profits/losses.

2. **Deposit Addresses**: Go to Admin → Deposit Addresses tab. Update BTC, USDT, and ETH wallet addresses that customers see when making deposits.

3. **Request Review**: Go to Admin → Requests tab to approve/reject deposit and withdrawal requests.

4. **Trade Recording**: Go to Admin → Trades tab to record and close trades with P/L.

## Demo workflows

1. Register a customer account.
2. Sign in.
3. Browse investment plans and subscribe with a custom amount.
4. Submit a deposit request (select BTC/USDT/ETH, send to displayed address).
5. Sign in as the demo admin to review requests, adjust balances, and manage deposit addresses.
6. Customer dashboard shows recorded account activity, active investments, and transaction history.

## Production checklist (must complete before launch)

- Obtain Nigerian and any other relevant legal advice on SEC/CAC status, portfolio management, virtual-asset services, client-money rules and cross-border offering.
- Implement compliant KYC/AML/sanctions screening with a vetted provider.
- Select a regulated payment provider and implement signed webhook verification, idempotency and reconciliation.
- Determine the lawful client asset custody model; never store customer wallet/exchange passwords or unrestricted withdrawal keys.
- Integrate a properly authorized broker/exchange through least-privilege API credentials; test in sandbox first.
- Have the ledger, withdrawal controls, security model and disaster recovery independently reviewed.
- Add MFA, email verification, password reset, session revocation, monitoring, backups, secrets management and penetration testing.
- Replace demo admin credentials; configure HTTPS, secure cookies, production CORS and rate limits.
- Publish reviewed Terms, Privacy, Risk Disclosure, complaints and fee documents.
- Never advertise guaranteed or fixed trading returns.

## Notes

The API uses an HTTP-only signed cookie for sessions, bcrypt password hashes, role checks, input validation, Helmet and rate limiting. This is a useful baseline, not a substitute for a professional security review.

## Live markets

`GET /api/markets` (public) serves the prices shown in the Markets section. The server fetches them and caches for 60 seconds:

- Crypto and gold: CoinGecko public API (gold is the PAX Gold token, one troy ounce each)
- Forex: Frankfurter, which republishes European Central Bank reference rates (once per working day)

No API keys are needed, but CoinGecko's free tier is rate limited. For silver, oil or intraday forex, add a provider such as Twelve Data in `server/src/markets.js`.
