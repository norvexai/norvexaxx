// Live market data via CoinMarketCap + Frankfurter (forex)
//   Crypto:   CoinMarketCap Pro API (free tier: 10k calls/month)
//   Gold:     CoinMarketCap (PAX Gold token) or fallback
//   Forex:    Frankfurter (ECB rates, free, no key needed)

const CMC_API_KEY = process.env.COINMARKETCAP_API_KEY;
const CMC_URL = "https://pro-api.coinmarketcap.com/v1";
const TTL_MS = 300_000; // 5 minutes cache

const CRYPTO_IDS = {
  bitcoin: 1,
  ethereum: 1027,
  solana: 5426,
  binancecoin: 1839,
  ripple: 52,
  cardano: 2010
};
const GOLD_ID = 4705; // PAX Gold

// ---- Generate realistic sparkline from current price + 24h change ----
function genSparkFromPrice(price, change24hPct, points = 56) {
  const changeDecimal = (change24hPct ?? 0) / 100;
  // Work backwards: last point = price, first point = price / (1 + change)
  const startPrice = price / (1 + changeDecimal);
  const values = [];
  for (let i = 0; i < points; i++) {
    const t = i / (points - 1); // 0 to 1
    // Linear interpolation with small noise
    const base = startPrice + (price - startPrice) * t;
    const noise = base * (Math.random() - 0.5) * 0.008;
    values.push(base + noise);
  }
  // Force last point to actual current price
  values[values.length - 1] = price;
  return values;
}

/* ---- Fallback data (if CMC key missing or API fails) ---- */
function genSpark(base, points = 56, volatility = 0.025) {
  let v = base;
  return Array.from({ length: points }, (_, i) => {
    const drift = Math.sin(i * 0.3) * volatility * base * 0.5;
    const noise = (Math.random() - 0.5) * volatility * base;
    v = Math.max(base * 0.85, Math.min(base * 1.15, v + drift * 0.1 + noise * 0.3));
    return v;
  });
}

const FALLBACK = {
  crypto: [
    { id: "bitcoin", symbol: "BTC", name: "Bitcoin", price: 68420.50, change24h: 2.35, spark: genSpark(68420, 56, 0.03) },
    { id: "ethereum", symbol: "ETH", name: "Ethereum", price: 3520.75, change24h: 1.82, spark: genSpark(3520, 56, 0.035) },
    { id: "solana", symbol: "SOL", name: "Solana", price: 168.40, change24h: 4.12, spark: genSpark(168, 56, 0.05) },
    { id: "binancecoin", symbol: "BNB", name: "BNB", price: 612.30, change24h: -0.85, spark: genSpark(612, 56, 0.025) },
    { id: "ripple", symbol: "XRP", name: "XRP", price: 0.6234, change24h: 5.67, spark: genSpark(0.62, 56, 0.04) },
    { id: "cardano", symbol: "ADA", name: "Cardano", price: 0.4521, change24h: -1.23, spark: genSpark(0.45, 56, 0.045) }
  ],
  gold: [
    { id: "pax-gold", symbol: "XAU", name: "Gold (per troy oz)", price: 2654.80, change24h: 0.42, spark: genSpark(2654, 56, 0.008) }
  ],
  forex: [
    { id: "EUR/USD", symbol: "EUR/USD", name: "EUR/USD", price: 1.0845, change24h: 0.18, spark: genSpark(1.0845, 56, 0.006) },
    { id: "GBP/USD", symbol: "GBP/USD", name: "GBP/USD", price: 1.2642, change24h: -0.24, spark: genSpark(1.2642, 56, 0.007) },
    { id: "USD/JPY", symbol: "USD/JPY", name: "USD/JPY", price: 151.32, change24h: 0.35, spark: genSpark(151.32, 56, 0.005) },
    { id: "USD/CHF", symbol: "USD/CHF", name: "USD/CHF", price: 0.9125, change24h: -0.12, spark: genSpark(0.9125, 56, 0.006) },
    { id: "AUD/USD", symbol: "AUD/USD", name: "AUD/USD", price: 0.6532, change24h: 0.45, spark: genSpark(0.6532, 56, 0.008) },
    { id: "USD/CAD", symbol: "USD/CAD", name: "USD/CAD", price: 1.3845, change24h: -0.08, spark: genSpark(1.3845, 56, 0.005) }
  ]
};

let cache = null;
let inflight = null;

async function getJson(url, headers = {}) {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`${res.status} from ${new URL(url).host}`);
  return res.json();
}

// ---- CoinMarketCap: fetch crypto + gold prices ----
async function loadCoinsCMC() {
  if (!CMC_API_KEY) throw new Error("COINMARKETCAP_API_KEY not set");

  const ids = Object.values({ ...CRYPTO_IDS, gold: GOLD_ID }).join(",");
  const data = await getJson(
    `${CMC_URL}/cryptocurrency/quotes/latest?id=${ids}&convert=USD`,
    { "X-CMC_PRO_API_KEY": CMC_API_KEY }
  );

  const map = data.data;
  const result = { crypto: [], gold: [] };

  // Crypto
  Object.entries(CRYPTO_IDS).forEach(([slug, id]) => {
    const c = map[String(id)];
    if (!c) return;
    const price = c.quote.USD.price;
    const change24h = c.quote.USD.percent_change_24h;
    result.crypto.push({
      id: slug,
      symbol: c.symbol,
      name: c.name,
      price,
      change24h,
      spark: genSparkFromPrice(price, change24h)
    });
  });

  // Gold (PAX Gold)
  const g = map[String(GOLD_ID)];
  if (g) {
    result.gold.push({
      id: "pax-gold",
      symbol: "XAU",
      name: "Gold (per troy oz)",
      price: g.quote.USD.price,
      change24h: g.quote.USD.percent_change_24h,
      spark: genSparkFromPrice(g.quote.USD.price, g.quote.USD.percent_change_24h)
    });
  }

  return result;
}

// ---- Forex: Frankfurter (free, no key) ----
const PAIRS = [
  ["EUR/USD", "EUR", true],
  ["GBP/USD", "GBP", true],
  ["USD/JPY", "JPY", false],
  ["USD/CHF", "CHF", false],
  ["AUD/USD", "AUD", true],
  ["USD/CAD", "CAD", false]
];

async function loadForex() {
  const iso = d => d.toISOString().slice(0, 10);
  const end = new Date(), start = new Date(Date.now() - 35 * 864e5);
  const symbols = PAIRS.map(p => p[1]).join(",");
  const data = await getJson(`https://api.frankfurter.dev/v1/${iso(start)}..${iso(end)}?base=USD&symbols=${symbols}`);
  const days = Object.keys(data.rates).sort();
  return PAIRS.map(([pair, ccy, invert]) => {
    const series = days.map(d => data.rates[d][ccy]).filter(Number.isFinite).map(v => (invert ? 1 / v : v));
    const last = series.at(-1), prev = series.at(-2);
    return { id: pair, symbol: pair, name: pair, price: last, change24h: prev ? ((last - prev) / prev) * 100 : null, spark: series };
  });
}

async function refresh() {
  const [coins, fx] = await Promise.allSettled([loadCoinsCMC(), loadForex()]);
  const stale = cache?.data;
  [coins, fx].forEach(r => r.status === "rejected" && console.warn("markets:", r.reason?.message));

  const data = {
    crypto: coins.status === "fulfilled" ? coins.value.crypto : (stale?.crypto?.length ? stale.crypto : FALLBACK.crypto),
    gold:   coins.status === "fulfilled" ? coins.value.gold   : (stale?.gold?.length   ? stale.gold   : FALLBACK.gold),
    forex:  fx.status    === "fulfilled" ? fx.value           : (stale?.forex?.length  ? stale.forex  : FALLBACK.forex),
    updatedAt: new Date().toISOString(),
    partial: coins.status === "rejected" || fx.status === "rejected"
  };

  cache = { at: Date.now(), data };
  return data;
}

export async function getMarkets() {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.data;
  inflight ??= refresh().finally(() => { inflight = null; });
  return inflight;
}
