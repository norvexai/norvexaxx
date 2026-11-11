import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import bcrypt from "bcryptjs";
import multer from "multer";
import crypto from "crypto";
import { z } from "zod";
import { query, tx, HttpError } from "./db.js";
import { requireAuth, requireRole, setSession, clearSession } from "./auth.js";
import { getMarkets } from "./markets.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { queueEmail, depositApprovedEmail, withdrawalApprovedEmail, welcomeEmail, chatNotificationEmail } from "./email.js";

if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
  throw new Error("SESSION_SECRET must be at least 32 characters.");
}
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");

const app = express();

// Trust proxy — required for Render/Vercel behind load balancers
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "blob:"],
      scriptSrc: ["'self'"],
      connectSrc: ["'self'", process.env.CLIENT_ORIGIN]
    }
  },
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));
const allowedOrigins = (process.env.CLIENT_ORIGIN || "http://localhost:5173")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin) || allowedOrigins.includes("*")) {
      return callback(null, true);
    }
    callback(new Error("Not allowed by CORS"));
  },
  credentials: true
}));
app.use(express.json({ limit: "100kb" }));
app.use(cookieParser());

/* Local file uploads */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOAD_DIR = path.join(__dirname, "../uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
app.use("/uploads", express.static(UPLOAD_DIR));

// Rate limiting
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts. Try again later." }
});
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: true,
  legacyHeaders: false
});
app.use("/api/auth", authLimiter);
app.use("/api", apiLimiter);

// Multer for file uploads (local disk storage)
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname) || ".jpg";
      cb(null, `profile-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
    }
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only JPEG, PNG, and WebP images are allowed'));
  }
});

const asyncRoute = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const uuid = z.string().uuid();
const cents = z.number().int().positive().max(100_000_000);
const publicUser = u => ({ 
  id: u.id, name: u.name, email: u.email, role: u.role,
  phone: u.phone, address: u.address, city: u.city, state: u.state,
  country: u.country, zip_code: u.zip_code, profile_image: u.profile_image,
  email_verified: u.email_verified, kyc_status: u.kyc_status
});

const BALANCE_SQL = `
  SELECT COALESCE(SUM(CASE direction WHEN 'CREDIT' THEN amount_cents ELSE -amount_cents END), 0)::bigint AS balance
  FROM ledger_entries WHERE account_id = $1`;

app.get("/api/health", asyncRoute(async (_req, res) => {
  await query("SELECT 1");
  res.json({ status: "ok", service: "NORVEXA API", version: "6.0.0" });
}));

/* ---------------- Auth ---------------- */
app.post("/api/auth/register", asyncRoute(async (req, res) => {
  const body = z.object({
    name: z.string().min(2).max(80),
    email: z.string().email().max(160),
    password: z.string().min(10).max(100),
    phone: z.string().min(7).max(20).optional(),
    address: z.string().max(200).optional(),
    city: z.string().max(100).optional(),
    state: z.string().max(100).optional(),
    country: z.string().max(100).optional(),
    zip_code: z.string().max(20).optional()
  }).parse(req.body);

  const hash = await bcrypt.hash(body.password, 12);
  const verifyToken = crypto.randomBytes(32).toString('hex');

  try {
    const user = await tx(async db => {
      const { rows } = await db.query(
        `INSERT INTO users (name, email, password_hash, phone, address, city, state, country, zip_code, email_verify_token)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING id, name, email::text AS email, role, phone, address, city, state, country, zip_code, profile_image, email_verified, kyc_status`,
        [body.name.trim(), body.email, hash, body.phone || null, body.address || null, 
         body.city || null, body.state || null, body.country || null, body.zip_code || null, verifyToken]
      );
      await db.query(`INSERT INTO trading_accounts (user_id, label) VALUES ($1, 'Main USD account')`, [rows[0].id]);
      return rows[0];
    });

    const welcome = welcomeEmail(user.name, user.email);
    await queueEmail(user.email, welcome.subject, welcome.html);

    setSession(res, user);
    res.status(201).json({ user: publicUser(user) });
  } catch (err) {
    if (err.code === "23505") throw new HttpError(409, "Email already registered.");
    throw err;
  }
}));

app.post("/api/auth/login", asyncRoute(async (req, res) => {
  const body = z.object({ email: z.string().email(), password: z.string().min(1) }).parse(req.body);

  const { rows: userRows } = await query(
    `SELECT id, name, email::text AS email, role, password_hash, login_attempts, locked_until,
            phone, address, city, state, country, zip_code, profile_image, email_verified, kyc_status
     FROM users WHERE email = $1`, [body.email]
  );
  const user = userRows[0];

  if (!user) throw new HttpError(401, "Invalid email or password.");

  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    throw new HttpError(423, "Account temporarily locked. Try again later.");
  }

  const valid = await bcrypt.compare(body.password, user.password_hash);
  if (!valid) {
    await query(
      `UPDATE users SET login_attempts = login_attempts + 1, 
       locked_until = CASE WHEN login_attempts >= 4 THEN now() + interval '15 minutes' ELSE locked_until END
       WHERE id = $1`, [user.id]
    );
    throw new HttpError(401, "Invalid email or password.");
  }

  await query(
    `UPDATE users SET login_attempts = 0, locked_until = NULL, last_login_at = now() WHERE id = $1`,
    [user.id]
  );

  setSession(res, user);
  res.json({ user: publicUser(user) });
}));

app.post("/api/auth/logout", (_req, res) => { clearSession(res); res.json({ ok: true }); });
app.get("/api/auth/me", requireAuth, (req, res) => res.json({ user: publicUser(req.user) }));

/* ---------------- Profile Management ---------------- */
app.put("/api/profile", requireAuth, asyncRoute(async (req, res) => {
  const body = z.object({
    name: z.string().min(2).max(80).optional(),
    phone: z.string().min(7).max(20).optional(),
    address: z.string().max(200).optional(),
    city: z.string().max(100).optional(),
    state: z.string().max(100).optional(),
    country: z.string().max(100).optional(),
    zip_code: z.string().max(20).optional()
  }).parse(req.body);

  const { rows } = await query(
    `UPDATE users SET 
      name = COALESCE($2, name),
      phone = COALESCE($3, phone),
      address = COALESCE($4, address),
      city = COALESCE($5, city),
      state = COALESCE($6, state),
      country = COALESCE($7, country),
      zip_code = COALESCE($8, zip_code)
     WHERE id = $1
     RETURNING id, name, email::text AS email, role, phone, address, city, state, country, zip_code, profile_image, email_verified, kyc_status`,
    [req.user.id, body.name, body.phone, body.address, body.city, body.state, body.country, body.zip_code]
  );

  res.json({ user: publicUser(rows[0]), message: "Profile updated successfully." });
}));

app.post("/api/profile/image", requireAuth, upload.single('image'), asyncRoute(async (req, res) => {
  if (!req.file) throw new HttpError(400, "No image file provided.");

  // Build public URL for the uploaded file
  const host = process.env.API_BASE_URL || `${req.protocol}://${req.get('host')}`;
  const imageUrl = `${host}/uploads/${req.file.filename}`;

  // Delete old profile image if exists
  const { rows: oldUser } = await query(`SELECT profile_image FROM users WHERE id = $1`, [req.user.id]);
  if (oldUser[0]?.profile_image) {
    try {
      const oldFilename = path.basename(new URL(oldUser[0].profile_image).pathname);
      const oldPath = path.join(UPLOAD_DIR, oldFilename);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    } catch {}
  }

  const { rows } = await query(
    `UPDATE users SET profile_image = $2 WHERE id = $1
     RETURNING id, name, email::text AS email, role, phone, address, city, state, country, zip_code, profile_image, email_verified, kyc_status`,
    [req.user.id, imageUrl]
  );

  res.json({ user: publicUser(rows[0]), message: "Profile image updated." });
}));

app.put("/api/profile/password", requireAuth, asyncRoute(async (req, res) => {
  const body = z.object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(10).max(100)
  }).parse(req.body);

  const { rows } = await query(`SELECT password_hash FROM users WHERE id = $1`, [req.user.id]);
  const valid = await bcrypt.compare(body.currentPassword, rows[0].password_hash);
  if (!valid) throw new HttpError(400, "Current password is incorrect.");

  const hash = await bcrypt.hash(body.newPassword, 12);
  await query(`UPDATE users SET password_hash = $2 WHERE id = $1`, [req.user.id, hash]);

  res.json({ message: "Password updated successfully." });
}));

/* ---------------- Market Data ---------------- */
app.get("/api/markets", asyncRoute(async (_req, res) => {
  res.set("Cache-Control", "public, max-age=30");
  res.json(await getMarkets());
}));

/* ---------------- Deposit Addresses ---------------- */
app.get("/api/deposit-addresses", asyncRoute(async (_req, res) => {
  const { rows } = await query(
    `SELECT currency, address, network, label FROM deposit_addresses WHERE active ORDER BY currency`
  );
  res.json({ addresses: rows });
}));

/* ---------------- Plans ---------------- */
app.get("/api/plans", asyncRoute(async (_req, res) => {
  const { rows } = await query(
    `SELECT id, name, description, price_usd_cents AS "priceUsdCents", duration_days AS "durationDays",
            risk_label AS "riskLabel", min_deposit_cents AS "minDepositCents", max_deposit_cents AS "maxDepositCents",
            weekly_return_pct AS "weeklyReturnPct", total_return_pct AS "totalReturnPct",
            capital_return_freq AS "capitalReturnFreq", plan_tier AS "planTier"
     FROM trading_plans WHERE active ORDER BY plan_tier`
  );
  res.json({ plans: rows });
}));

app.post("/api/subscriptions", requireAuth, asyncRoute(async (req, res) => {
  const body = z.object({ planId: uuid, amountCents: cents.optional() }).parse(req.body);

  const result = await tx(async db => {
    const { rows: plans } = await db.query(
      `SELECT id, name, min_deposit_cents, max_deposit_cents, duration_days, price_usd_cents
       FROM trading_plans WHERE id = $1 AND active`, [body.planId]
    );
    if (!plans[0]) throw new HttpError(404, "Plan not found.");
    const p = plans[0];

    let investCents = body.amountCents ?? p.price_usd_cents;
    if (investCents < p.min_deposit_cents) {
      throw new HttpError(400, `Minimum deposit for ${p.name} plan is $${p.min_deposit_cents / 100}.`);
    }
    if (p.max_deposit_cents !== null && investCents > p.max_deposit_cents) {
      throw new HttpError(400, `Maximum deposit for ${p.name} plan is $${p.max_deposit_cents / 100}.`);
    }

    const { rows: accounts } = await db.query(
      `SELECT a.id, COALESCE(SUM(CASE l.direction WHEN 'CREDIT' THEN l.amount_cents ELSE -l.amount_cents END), 0)::bigint AS balance
       FROM trading_accounts a LEFT JOIN ledger_entries l ON l.account_id = a.id
       WHERE a.user_id = $1 GROUP BY a.id ORDER BY a.created_at LIMIT 1`, [req.user.id]
    );
    if (!accounts[0]) throw new HttpError(404, "Account not found.");
    if (accounts[0].balance < investCents) {
      throw new HttpError(400, "Insufficient balance. Please deposit funds first.");
    }

    await db.query(
      `INSERT INTO ledger_entries (account_id, type, amount_cents, direction, description, reference)
       VALUES ($1, 'INVESTMENT', $2, 'DEBIT', $3, $4)`,
      [accounts[0].id, investCents, `Investment in ${p.name} plan`, `investment-${Date.now()}-${req.user.id}`]
    );

    const { rows: subs } = await db.query(
      `INSERT INTO subscriptions (user_id, plan_id, amount_cents, ends_at)
       VALUES ($1, $2, $3, now() + make_interval(days => $4))
       RETURNING id, status, started_at AS "startedAt", ends_at AS "endsAt"`,
      [req.user.id, body.planId, investCents, p.duration_days]
    );
    return { subscription: subs[0], plan: p, investCents };
  });

  res.status(201).json({
    subscription: result.subscription,
    message: `Successfully subscribed to ${result.plan.name} plan with $${result.investCents / 100}.`
  });
}));

/* ---------------- Dashboard ---------------- */
app.get("/api/dashboard", requireAuth, asyncRoute(async (req, res) => {
  const uid = req.user.id;
  const [accounts, subscriptions, deposits, withdrawals, ledger, addresses, unreadChat] = await Promise.all([
    query(
      `SELECT a.id, a.label, a.currency,
              b.balance_cents AS "balanceCents", b.ledger_count AS "ledgerCount",
              COALESCE((
                SELECT json_agg(t ORDER BY t."recordedAt" DESC) FROM (
                  SELECT id, symbol, side, market, status, pnl_cents AS "pnlCents", recorded_at AS "recordedAt"
                  FROM trades WHERE account_id = a.id ORDER BY recorded_at DESC LIMIT 10
                ) t
              ), '[]'::json) AS trades
       FROM trading_accounts a JOIN account_balances b ON b.account_id = a.id
       WHERE a.user_id = $1 ORDER BY a.created_at`, [uid]),
    query(
      `SELECT s.id, p.name AS "planName", p.plan_tier AS "planTier", s.amount_cents AS "amountCents",
              CASE WHEN s.status = 'ACTIVE' AND s.ends_at < now() THEN 'EXPIRED' ELSE s.status::text END AS status,
              s.started_at AS "startedAt", s.ends_at AS "endsAt", s.returns_paid AS "returnsPaid"
       FROM subscriptions s JOIN trading_plans p ON p.id = s.plan_id
       WHERE s.user_id = $1 ORDER BY s.started_at DESC`, [uid]),
    query(
      `SELECT id, amount_cents AS "amountCents", currency, txid, txid_verified AS "txidVerified", status, created_at AS "createdAt"
       FROM deposit_requests WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20`, [uid]),
    query(
      `SELECT id, amount_cents AS "amountCents", status, created_at AS "createdAt"
       FROM withdrawal_requests WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20`, [uid]),
    query(
      `SELECT l.id, l.type, l.direction, l.amount_cents AS "amountCents", l.description, l.created_at AS "createdAt"
       FROM ledger_entries l JOIN trading_accounts a ON a.id = l.account_id
       WHERE a.user_id = $1 ORDER BY l.created_at DESC LIMIT 20`, [uid]),
    query(`SELECT currency, address, network, label FROM deposit_addresses WHERE active ORDER BY currency`),
    query(`SELECT COUNT(*)::int as count FROM chat_messages WHERE user_id = $1 AND sender_type = 'ADMIN' AND read = false`, [uid])
  ]);

  const totalBalanceCents = accounts.rows.reduce((s, a) => s + a.balanceCents, 0);
  const totalInvestedCents = subscriptions.rows
    .filter(s => s.status === "ACTIVE")
    .reduce((s, sub) => s + Number(sub.amountCents), 0);

  res.json({
    accounts: accounts.rows,
    subscriptions: subscriptions.rows,
    deposits: deposits.rows,
    withdrawals: withdrawals.rows,
    ledger: ledger.rows,
    depositAddresses: addresses.rows,
    totalBalanceCents,
    totalInvestedCents,
    unreadMessages: unreadChat.rows[0].count
  });
}));

/* ---------------- Deposits ---------------- */
app.post("/api/deposits", requireAuth, asyncRoute(async (req, res) => {
  const body = z.object({
    accountId: uuid, 
    amountCents: cents,
    currency: z.enum(["BTC", "USDT", "ETH"]),
    txid: z.string().min(10).max(100).optional(),
    reference: z.string().max(120).optional(), 
    notes: z.string().max(500).optional()
  }).parse(req.body);

  const { rows } = await query(
    `INSERT INTO deposit_requests (user_id, account_id, amount_cents, currency, txid, reference, notes)
     SELECT $1, a.id, $3, $4, $5, $6, $7 FROM trading_accounts a WHERE a.id = $2 AND a.user_id = $1
     RETURNING id, status, created_at AS "createdAt"`,
    [req.user.id, body.accountId, body.amountCents, body.currency, body.txid || null, body.reference ?? null, body.notes ?? null]
  );
  if (!rows[0]) throw new HttpError(404, "Account not found.");
  res.status(201).json({ 
    request: rows[0], 
    message: "Deposit request submitted. Your account will be credited after transaction verification." 
  });
}));

app.post("/api/withdrawals", requireAuth, asyncRoute(async (req, res) => {
  const body = z.object({ 
    accountId: uuid, 
    amountCents: cents, 
    destination: z.string().min(4).max(300) 
  }).parse(req.body);

  const request = await tx(async db => {
    const acct = await db.query(`SELECT id FROM trading_accounts WHERE id = $1 AND user_id = $2 FOR UPDATE`, [body.accountId, req.user.id]);
    if (!acct.rows[0]) throw new HttpError(404, "Account not found.");
    const { rows: [{ balance }] } = await db.query(BALANCE_SQL, [body.accountId]);
    const { rows: [{ pending }] } = await db.query(
      `SELECT COALESCE(SUM(amount_cents), 0)::bigint AS pending FROM withdrawal_requests WHERE account_id = $1 AND status = 'PENDING'`,
      [body.accountId]
    );
    if (body.amountCents > balance - pending) throw new HttpError(400, "Requested amount exceeds available balance.");
    const ins = await db.query(
      `INSERT INTO withdrawal_requests (user_id, account_id, amount_cents, destination)
       VALUES ($1, $2, $3, $4) RETURNING id, status, created_at AS "createdAt"`,
      [req.user.id, body.accountId, body.amountCents, body.destination]
    );
    return ins.rows[0];
  });
  res.status(201).json({ request, message: "Withdrawal request submitted for review." });
}));

/* ---------------- Chat ---------------- */
app.get("/api/chat", requireAuth, asyncRoute(async (req, res) => {
  const { rows } = await query(
    `SELECT id, message, sender_type AS "senderType", read, created_at AS "createdAt"
     FROM chat_messages WHERE user_id = $1 ORDER BY created_at ASC LIMIT 100`,
    [req.user.id]
  );
  await query(`UPDATE chat_messages SET read = true, read_at = now() WHERE user_id = $1 AND sender_type = 'ADMIN' AND read = false`, [req.user.id]);
  res.json({ messages: rows });
}));

app.post("/api/chat", requireAuth, asyncRoute(async (req, res) => {
  const { message } = z.object({ message: z.string().min(1).max(1000) }).parse(req.body);

  const { rows } = await query(
    `INSERT INTO chat_messages (user_id, message, sender_type) VALUES ($1, $2, 'CUSTOMER') RETURNING id, created_at AS "createdAt"`,
    [req.user.id, message]
  );

  const user = await query(`SELECT name, email FROM users WHERE id = $1`, [req.user.id]);
  const notif = chatNotificationEmail(user.rows[0].name, message);
  await queueEmail(process.env.ADMIN_EMAIL || 'norvexainvementglobal@gmail.com', notif.subject, notif.html);

  res.status(201).json({ message: rows[0], success: true });
}));

/* ---------------- Admin Plan Management ---------------- */
const adminOnly = requireRole("ADMIN");

app.get("/api/admin/plans", requireAuth, adminOnly, asyncRoute(async (_req, res) => {
  const { rows } = await query(
    `SELECT id, name, description, price_usd_cents AS "priceUsdCents", duration_days AS "durationDays",
            risk_label AS "riskLabel", min_deposit_cents AS "minDepositCents", max_deposit_cents AS "maxDepositCents",
            weekly_return_pct AS "weeklyReturnPct", total_return_pct AS "totalReturnPct",
            capital_return_freq AS "capitalReturnFreq", plan_tier AS "planTier", active
     FROM trading_plans ORDER BY plan_tier`
  );
  res.json({ plans: rows });
}));

app.post("/api/admin/plans", requireAuth, adminOnly, asyncRoute(async (req, res) => {
  const body = z.object({
    name: z.string().min(2).max(80),
    description: z.string().min(5).max(500),
    priceUsdCents: z.number().int().positive(),
    durationDays: z.number().int().positive(),
    riskLabel: z.string().min(1).max(50),
    minDepositCents: z.number().int().nonnegative(),
    maxDepositCents: z.number().int().nonnegative().nullable().optional(),
    weeklyReturnPct: z.number().nonnegative(),
    totalReturnPct: z.number().nonnegative(),
    capitalReturnFreq: z.enum(["weekly", "daily", "monthly"]).default("weekly"),
    planTier: z.number().int().positive()
  }).parse(req.body);

  const { rows } = await query(
    `INSERT INTO trading_plans (name, description, price_usd_cents, duration_days, risk_label, min_deposit_cents, max_deposit_cents, weekly_return_pct, total_return_pct, capital_return_freq, plan_tier)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING id, name, price_usd_cents AS "priceUsdCents", duration_days AS "durationDays", active`,
    [body.name, body.description, body.priceUsdCents, body.durationDays, body.riskLabel,
     body.minDepositCents, body.maxDepositCents ?? null, body.weeklyReturnPct, body.totalReturnPct,
     body.capitalReturnFreq, body.planTier]
  );
  res.status(201).json({ plan: rows[0], message: `Plan "${body.name}" created successfully.` });
}));

app.put("/api/admin/plans/:id", requireAuth, adminOnly, asyncRoute(async (req, res) => {
  const id = uuid.parse(req.params.id);
  const body = z.object({
    name: z.string().min(2).max(80).optional(),
    description: z.string().min(5).max(500).optional(),
    priceUsdCents: z.number().int().positive().optional(),
    durationDays: z.number().int().positive().optional(),
    riskLabel: z.string().min(1).max(50).optional(),
    minDepositCents: z.number().int().nonnegative().optional(),
    maxDepositCents: z.number().int().nonnegative().nullable().optional(),
    weeklyReturnPct: z.number().nonnegative().optional(),
    totalReturnPct: z.number().nonnegative().optional(),
    capitalReturnFreq: z.enum(["weekly", "daily", "monthly"]).optional(),
    planTier: z.number().int().positive().optional(),
    active: z.boolean().optional()
  }).parse(req.body);

  const { rows } = await query(
    `UPDATE trading_plans SET
      name = COALESCE($2, name),
      description = COALESCE($3, description),
      price_usd_cents = COALESCE($4, price_usd_cents),
      duration_days = COALESCE($5, duration_days),
      risk_label = COALESCE($6, risk_label),
      min_deposit_cents = COALESCE($7, min_deposit_cents),
      max_deposit_cents = COALESCE($8, max_deposit_cents),
      weekly_return_pct = COALESCE($9, weekly_return_pct),
      total_return_pct = COALESCE($10, total_return_pct),
      capital_return_freq = COALESCE($11, capital_return_freq),
      plan_tier = COALESCE($12, plan_tier),
      active = COALESCE($13, active)
     WHERE id = $1
     RETURNING id, name, active`,
    [id, body.name, body.description, body.priceUsdCents, body.durationDays, body.riskLabel,
     body.minDepositCents, body.maxDepositCents ?? undefined, body.weeklyReturnPct, body.totalReturnPct,
     body.capitalReturnFreq, body.planTier, body.active]
  );
  if (!rows[0]) throw new HttpError(404, "Plan not found.");
  res.json({ plan: rows[0], message: `Plan "${rows[0].name}" updated successfully.` });
}));

app.delete("/api/admin/plans/:id", requireAuth, adminOnly, asyncRoute(async (req, res) => {
  const id = uuid.parse(req.params.id);
  // Check if plan has active subscriptions
  const { rows: subCheck } = await query(
    `SELECT COUNT(*)::int as count FROM subscriptions WHERE plan_id = $1 AND status = 'ACTIVE'`, [id]
  );
  if (subCheck[0].count > 0) {
    throw new HttpError(400, "Cannot delete plan with active subscriptions. Deactivate it instead.");
  }
  await query(`DELETE FROM trading_plans WHERE id = $1`, [id]);
  res.json({ message: "Plan deleted successfully." });
}));

/* ---------------- Admin ---------------- */
const staff = requireRole("ADMIN", "FINANCE");

app.get("/api/admin/overview", requireAuth, requireRole("ADMIN", "FINANCE", "COMPLIANCE"), asyncRoute(async (_req, res) => {
  const { rows } = await query(
    `SELECT (SELECT count(*) FROM users WHERE role = 'CUSTOMER')::int               AS "customers",
            (SELECT count(*) FROM deposit_requests    WHERE status = 'PENDING')::int AS "pendingDeposits",
            (SELECT count(*) FROM withdrawal_requests WHERE status = 'PENDING')::int AS "pendingWithdrawals",
            (SELECT count(*) FROM trades)::int                                       AS "recordedTrades",
            (SELECT count(*) FROM subscriptions WHERE status = 'ACTIVE')::int        AS "activeSubscriptions",
            (SELECT COALESCE(SUM(amount_cents), 0)::bigint FROM subscriptions WHERE status = 'ACTIVE') AS "totalInvestedCents",
            (SELECT COALESCE(SUM(balance_cents), 0)::bigint FROM account_balances)  AS "totalBalancesCents",
            (SELECT count(*) FROM chat_messages WHERE sender_type = 'CUSTOMER' AND read = false)::int AS "unreadChats"`
  );
  res.json(rows[0]);
}));

app.get("/api/admin/requests", requireAuth, staff, asyncRoute(async (_req, res) => {
  const [deposits, withdrawals] = await Promise.all([
    query(`SELECT r.id, r.amount_cents AS "amountCents", r.currency, r.txid, r.txid_verified AS "txidVerified", 
                  r.reference, r.created_at AS "createdAt",
                  u.name AS "userName", u.email::text AS "userEmail", a.label AS "accountLabel"
           FROM deposit_requests r JOIN users u ON u.id = r.user_id JOIN trading_accounts a ON a.id = r.account_id
           WHERE r.status = 'PENDING' ORDER BY r.created_at`),
    query(`SELECT r.id, r.amount_cents AS "amountCents", r.destination, r.created_at AS "createdAt",
                  u.name AS "userName", u.email::text AS "userEmail", a.label AS "accountLabel"
           FROM withdrawal_requests r JOIN users u ON u.id = r.user_id JOIN trading_accounts a ON a.id = r.account_id
           WHERE r.status = 'PENDING' ORDER BY r.created_at`)
  ]);
  res.json({ deposits: deposits.rows, withdrawals: withdrawals.rows });
}));

app.post("/api/admin/deposits/:id/review", requireAuth, staff, asyncRoute(async (req, res) => {
  const id = uuid.parse(req.params.id);
  const { decision } = z.object({ decision: z.enum(["APPROVED", "REJECTED"]) }).parse(req.body);

  const result = await tx(async db => {
    const found = await db.query(
      `SELECT r.id, r.account_id, r.amount_cents, r.currency, r.txid, u.name AS user_name, u.email::text AS user_email
       FROM deposit_requests r JOIN users u ON u.id = r.user_id 
       WHERE r.id = $1 AND r.status = 'PENDING' FOR UPDATE`, [id]
    );
    const item = found.rows[0];
    if (!item) throw new HttpError(404, "Request not found or already reviewed.");

    const upd = await db.query(
      `UPDATE deposit_requests SET status = $2, reviewed_at = now(), reviewed_by = $3 WHERE id = $1 
       RETURNING id, status, reviewed_at AS "reviewedAt"`,
      [id, decision, req.user.id]
    );

    if (decision === "APPROVED") {
      await db.query(
        `INSERT INTO ledger_entries (account_id, type, amount_cents, direction, description, reference)
         VALUES ($1, 'DEPOSIT', $2, 'CREDIT', 'Verified deposit', $3)`,
        [item.account_id, item.amount_cents, `deposit-${id}`]
      );

      const email = depositApprovedEmail(item.user_name, item.amount_cents / 100, item.currency, item.txid);
      await queueEmail(item.user_email, email.subject, email.html);
    }

    await db.query(
      `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id) VALUES ($1, $2, 'DepositRequest', $3)`,
      [req.user.id, `DEPOSIT_${decision}`, id]
    );
    return upd.rows[0];
  });
  res.json({ request: result, message: decision === "APPROVED" ? "Deposit approved and customer notified." : "Deposit rejected." });
}));

app.post("/api/admin/withdrawals/:id/review", requireAuth, staff, asyncRoute(async (req, res) => {
  const id = uuid.parse(req.params.id);
  const { decision } = z.object({ decision: z.enum(["APPROVED", "REJECTED"]) }).parse(req.body);

  const result = await tx(async db => {
    const found = await db.query(
      `SELECT r.id, r.account_id, r.amount_cents, r.destination, u.name AS user_name, u.email::text AS user_email
       FROM withdrawal_requests r JOIN users u ON u.id = r.user_id 
       WHERE r.id = $1 AND r.status = 'PENDING' FOR UPDATE`, [id]
    );
    const item = found.rows[0];
    if (!item) throw new HttpError(404, "Request not found or already reviewed.");

    if (decision === "APPROVED") {
      await db.query(`SELECT id FROM trading_accounts WHERE id = $1 FOR UPDATE`, [item.account_id]);
      const { rows: [{ balance }] } = await db.query(BALANCE_SQL, [item.account_id]);
      if (item.amount_cents > balance) throw new HttpError(400, "Insufficient recorded balance.");
      await db.query(
        `INSERT INTO ledger_entries (account_id, type, amount_cents, direction, description, reference)
         VALUES ($1, 'WITHDRAWAL', $2, 'DEBIT', 'Approved withdrawal', $3)`,
        [item.account_id, item.amount_cents, `withdrawal-${id}`]
      );

      const email = withdrawalApprovedEmail(item.user_name, item.amount_cents / 100, item.destination);
      await queueEmail(item.user_email, email.subject, email.html);
    }

    const upd = await db.query(
      `UPDATE withdrawal_requests SET status = $2, reviewed_at = now(), reviewed_by = $3 WHERE id = $1 RETURNING id, status, reviewed_at AS "reviewedAt"`,
      [id, decision, req.user.id]
    );
    await db.query(
      `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id) VALUES ($1, $2, 'WithdrawalRequest', $3)`,
      [req.user.id, `WITHDRAWAL_${decision}`, id]
    );
    return upd.rows[0];
  });
  res.json({ request: result, message: decision === "APPROVED" ? "Withdrawal approved and customer notified." : "Withdrawal rejected." });
}));

app.post("/api/admin/adjust-balance", requireAuth, staff, asyncRoute(async (req, res) => {
  const body = z.object({
    userId: uuid,
    accountId: uuid,
    amountCents: cents,
    direction: z.enum(["CREDIT", "DEBIT"]),
    reason: z.string().min(2).max(300)
  }).parse(req.body);

  const result = await tx(async db => {
    const acct = await db.query(
      `SELECT a.id, a.label, u.name AS user_name FROM trading_accounts a
       JOIN users u ON u.id = a.user_id WHERE a.id = $1 AND a.user_id = $2`,
      [body.accountId, body.userId]
    );
    if (!acct.rows[0]) throw new HttpError(404, "Account not found for this customer.");

    if (body.direction === "DEBIT") {
      const { rows: [{ balance }] } = await db.query(BALANCE_SQL, [body.accountId]);
      if (body.amountCents > balance) {
        throw new HttpError(400, `Insufficient balance. Current balance: $${balance / 100}.`);
      }
    }

    const ledgerType = body.direction === "CREDIT" ? "PROFIT" : "ADJUSTMENT";
    const refId = `adjust-${Date.now()}-${body.accountId}`;

    await db.query(
      `INSERT INTO ledger_entries (account_id, type, amount_cents, direction, description, reference)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [body.accountId, ledgerType, body.amountCents, body.direction, body.reason, refId]
    );

    await db.query(
      `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, metadata)
       VALUES ($1, 'BALANCE_ADJUSTED', 'TradingAccount', $2, $3)`,
      [req.user.id, body.accountId, JSON.stringify({
        direction: body.direction, amountCents: body.amountCents, reason: body.reason
      })]
    );

    const { rows: [{ balance }] } = await db.query(BALANCE_SQL, [body.accountId]);
    return { newBalanceCents: balance, accountLabel: acct.rows[0].label, userName: acct.rows[0].user_name };
  });

  res.json({
    ...result,
    message: `${body.direction === "CREDIT" ? "Credited" : "Debited"} $${body.amountCents / 100}. New balance: $${result.newBalanceCents / 100}.`
  });
}));

app.get("/api/admin/deposit-addresses", requireAuth, staff, asyncRoute(async (_req, res) => {
  const { rows } = await query(
    `SELECT id, currency, address, network, label, active, updated_at AS "updatedAt"
     FROM deposit_addresses ORDER BY currency`
  );
  res.json({ addresses: rows });
}));

app.put("/api/admin/deposit-addresses/:currency", requireAuth, staff, asyncRoute(async (req, res) => {
  const currency = z.enum(["BTC", "USDT", "ETH"]).parse(req.params.currency);
  const body = z.object({
    address: z.string().min(10).max(200),
    network: z.string().max(100).optional(),
    label: z.string().max(200).optional(),
    active: z.boolean().optional()
  }).parse(req.body);

  const { rows } = await query(
    `UPDATE deposit_addresses SET address = $2, network = COALESCE($3, network),
            label = COALESCE($4, label), active = COALESCE($5, active), updated_by = $6
     WHERE currency = $1 RETURNING currency, address, network, label, active`,
    [currency, body.address, body.network ?? null, body.label ?? null, body.active ?? null, req.user.id]
  );
  if (!rows[0]) throw new HttpError(404, "Currency not found.");
  res.json({ address: rows[0], message: `${currency} deposit address updated.` });
}));

const traders = requireRole("ADMIN", "TRADER");

app.get("/api/admin/customers", requireAuth, traders, asyncRoute(async (_req, res) => {
  const { rows } = await query(
    `SELECT u.id, u.name, u.email::text AS email, u.phone, u.country, u.kyc_status AS "kycStatus", 
            u.created_at AS "createdAt",
            json_agg(json_build_object('id', a.id, 'label', a.label, 'balanceCents', b.balance_cents) ORDER BY a.created_at) AS accounts
     FROM users u
     JOIN trading_accounts a ON a.user_id = u.id
     JOIN account_balances b ON b.account_id = a.id
     WHERE u.role = 'CUSTOMER' GROUP BY u.id ORDER BY u.name`
  );
  res.json({ customers: rows });
}));

app.get("/api/admin/trades/open", requireAuth, traders, asyncRoute(async (_req, res) => {
  const { rows } = await query(
    `SELECT t.id, t.symbol, t.side, t.market, t.quantity, t.entry_price AS "entryPrice", t.recorded_at AS "recordedAt", u.name AS "userName"
     FROM trades t JOIN users u ON u.id = t.user_id WHERE t.status = 'OPEN' ORDER BY t.recorded_at`
  );
  res.json({ trades: rows });
}));

app.post("/api/admin/trades", requireAuth, traders, asyncRoute(async (req, res) => {
  const body = z.object({
    userId: uuid, accountId: uuid,
    market: z.enum(["CRYPTO", "FOREX", "COMMODITY"]), symbol: z.string().min(2).max(30),
    side: z.enum(["BUY", "SELL"]), quantity: z.string().min(1).max(40), entryPrice: z.string().min(1).max(40),
    notes: z.string().max(500).optional()
  }).parse(req.body);

  const trade = await tx(async db => {
    const ins = await db.query(
      `INSERT INTO trades (user_id, account_id, market, symbol, side, quantity, entry_price, notes)
       SELECT $1, a.id, $3, $4, $5, $6, $7, $8 FROM trading_accounts a WHERE a.id = $2 AND a.user_id = $1
       RETURNING id, symbol, side, market, status`,
      [body.userId, body.accountId, body.market, body.symbol.toUpperCase(), body.side, body.quantity, body.entryPrice, body.notes ?? null]
    );
    if (!ins.rows[0]) throw new HttpError(404, "Customer account mismatch.");
    await db.query(
      `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id) VALUES ($1, 'TRADE_RECORDED', 'Trade', $2)`,
      [req.user.id, ins.rows[0].id]
    );
    return ins.rows[0];
  });
  res.status(201).json({ trade, message: "Trade record created." });
}));

app.post("/api/admin/trades/:id/close", requireAuth, traders, asyncRoute(async (req, res) => {
  const id = uuid.parse(req.params.id);
  const body = z.object({ 
    exitPrice: z.string().min(1).max(40), 
    pnlCents: z.number().int().min(-100_000_000).max(100_000_000) 
  }).parse(req.body);

  const trade = await tx(async db => {
    const upd = await db.query(
      `UPDATE trades SET exit_price = $2, pnl_cents = $3, status = 'CLOSED', closed_at = now()
       WHERE id = $1 AND status = 'OPEN' RETURNING id, account_id, symbol, status, pnl_cents AS "pnlCents"`,
      [id, body.exitPrice, body.pnlCents]
    );
    const t = upd.rows[0];
    if (!t) throw new HttpError(404, "Open trade not found.");
    if (body.pnlCents !== 0) {
      await db.query(
        `INSERT INTO ledger_entries (account_id, type, amount_cents, direction, description, reference)
         VALUES ($1, 'TRADE_PNL', $2, $3, $4, $5)`,
        [t.account_id, Math.abs(body.pnlCents), body.pnlCents > 0 ? "CREDIT" : "DEBIT", `Recorded P/L for ${t.symbol}`, `trade-pnl-${id}`]
      );
    }
    await db.query(
      `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id) VALUES ($1, 'TRADE_CLOSED', 'Trade', $2)`, 
      [req.user.id, id]
    );
    return { id: t.id, symbol: t.symbol, status: t.status, pnlCents: t.pnlCents };
  });
  res.json({ trade, message: "Trade closed and P/L recorded." });
}));

app.post("/api/admin/subscriptions/:id/pay-return", requireAuth, staff, asyncRoute(async (req, res) => {
  const id = uuid.parse(req.params.id);
  const result = await tx(async db => {
    const { rows: subs } = await db.query(
      `SELECT s.id, s.user_id, s.amount_cents, s.returns_paid, s.status, s.ends_at,
              p.name AS plan_name, p.weekly_return_pct, p.capital_return_freq, p.duration_days
       FROM subscriptions s JOIN trading_plans p ON p.id = s.plan_id
       WHERE s.id = $1 FOR UPDATE`, [id]
    );
    if (!subs[0]) throw new HttpError(404, "Subscription not found.");
    const sub = subs[0];
    if (sub.status !== 'ACTIVE') throw new HttpError(400, "Subscription is not active.");
    if (sub.ends_at < new Date()) throw new HttpError(400, "Subscription has expired.");

    const returnPct = Number(sub.weekly_return_pct);
    const returnCents = Math.round(Number(sub.amount_cents) * returnPct / 100);

    const { rows: accounts } = await db.query(
      `SELECT id FROM trading_accounts WHERE user_id = $1 ORDER BY created_at LIMIT 1`, [sub.user_id]
    );
    if (!accounts[0]) throw new HttpError(404, "Customer account not found.");

    await db.query(
      `INSERT INTO ledger_entries (account_id, type, amount_cents, direction, description, reference)
       VALUES ($1, 'CAPITAL_RETURN', $2, 'CREDIT', $3, $4)`,
      [accounts[0].id, returnCents, `${sub.plan_name} plan return (${returnPct}%)`, `return-${id}-${sub.returns_paid + 1}`]
    );

    const { rows: updated } = await db.query(
      `UPDATE subscriptions SET returns_paid = returns_paid + 1 WHERE id = $1 RETURNING returns_paid`, [id]
    );

    await db.query(
      `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, metadata)
       VALUES ($1, 'RETURN_PAID', 'Subscription', $2, $3)`,
      [req.user.id, id, JSON.stringify({ returnCents, returnPct, period: updated[0].returns_paid })]
    );

    return { returnCents, returnPct, planName: sub.plan_name, period: updated[0].returns_paid };
  });
  res.json({ ...result, message: `Paid $${result.returnCents / 100} (${result.returnPct}%) return for ${result.planName} plan, period ${result.period}.` });
}));

app.get("/api/admin/chats", requireAuth, staff, asyncRoute(async (_req, res) => {
  const { rows } = await query(
    `SELECT u.id AS user_id, u.name, u.email::text AS email,
            COUNT(CASE WHEN c.sender_type = 'CUSTOMER' AND c.read = false THEN 1 END)::int AS unread,
            MAX(c.created_at) AS last_message_at
     FROM users u
     JOIN chat_messages c ON c.user_id = u.id
     WHERE u.role = 'CUSTOMER'
     GROUP BY u.id, u.name, u.email
     ORDER BY last_message_at DESC`
  );
  res.json({ chats: rows });
}));

app.get("/api/admin/chats/:userId", requireAuth, staff, asyncRoute(async (req, res) => {
  const userId = uuid.parse(req.params.userId);
  const { rows } = await query(
    `SELECT id, message, sender_type AS "senderType", read, created_at AS "createdAt"
     FROM chat_messages WHERE user_id = $1 ORDER BY created_at ASC LIMIT 100`,
    [userId]
  );
  await query(`UPDATE chat_messages SET read = true, read_at = now() WHERE user_id = $1 AND sender_type = 'CUSTOMER' AND read = false`, [userId]);
  res.json({ messages: rows });
}));

app.post("/api/admin/chats/:userId/reply", requireAuth, staff, asyncRoute(async (req, res) => {
  const userId = uuid.parse(req.params.userId);
  const { message } = z.object({ message: z.string().min(1).max(1000) }).parse(req.body);

  const { rows } = await query(
    `INSERT INTO chat_messages (user_id, message, sender_type) VALUES ($1, $2, 'ADMIN') RETURNING id, created_at AS "createdAt"`,
    [userId, message]
  );
  res.status(201).json({ message: rows[0], success: true });
}));

/* ---------------- Health Check ---------------- */
app.get("/api/health", (_req, res) => res.json({ status: "ok", service: "NORVEXA API", version: "6.0.0", time: new Date().toISOString() }));

/* ---------------- Error Handler ---------------- */
app.use((err, _req, res, _next) => {
  if (err instanceof z.ZodError) return res.status(400).json({ error: "Invalid input.", details: err.issues });
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  if (err.message?.includes('Only JPEG')) return res.status(400).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: "Server error. Please try again." });
});

const port = Number(process.env.PORT || 4000);
app.listen(port, () => console.log(`NORVEXA API v6.0 listening on http://localhost:${port}`));
