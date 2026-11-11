import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Bitcoin,
  TrendingUp,
  Coins,
  Globe2,
  Shield,
  Users,
  Award,
  Activity,
  BarChart3,
  Landmark,
  Wallet,
} from "lucide-react";
import { HexMark } from "./Brand";
import { prefersReducedMotion } from "../hooks";
import { api } from "../api";

const LINE =
  "M0 168 C40 160 62 176 96 150 S150 132 182 142 S236 96 270 110 S330 150 366 112 S430 52 468 74 S540 38 600 20";

/* ---- Background tokens ---- */
const FloatingTokens = () => {
  const tokens = [
    { Icon: Bitcoin, x: "6%", y: "10%", s: 44, d: "0s", o: 0.07 },
    { Icon: Coins, x: "22%", y: "6%", s: 38, d: "1.2s", o: 0.06 },
    { Icon: TrendingUp, x: "44%", y: "12%", s: 36, d: "2.1s", o: 0.055 },
    { Icon: Globe2, x: "66%", y: "8%", s: 40, d: "0.7s", o: 0.065 },
    { Icon: Bitcoin, x: "88%", y: "14%", s: 38, d: "1.8s", o: 0.06 },
    { Icon: Activity, x: "12%", y: "30%", s: 34, d: "2.5s", o: 0.05 },
    { Icon: BarChart3, x: "34%", y: "26%", s: 32, d: "0.4s", o: 0.045 },
    { Icon: Landmark, x: "56%", y: "32%", s: 36, d: "1.5s", o: 0.055 },
    { Icon: Wallet, x: "78%", y: "28%", s: 34, d: "2.8s", o: 0.05 },
    { Icon: Coins, x: "92%", y: "36%", s: 30, d: "0.9s", o: 0.04 },
    { Icon: TrendingUp, x: "8%", y: "55%", s: 38, d: "1.1s", o: 0.06 },
    { Icon: Bitcoin, x: "30%", y: "60%", s: 34, d: "2.3s", o: 0.05 },
    { Icon: Globe2, x: "52%", y: "54%", s: 36, d: "0.6s", o: 0.055 },
    { Icon: Activity, x: "74%", y: "62%", s: 32, d: "1.9s", o: 0.045 },
    { Icon: BarChart3, x: "94%", y: "58%", s: 34, d: "2.6s", o: 0.05 },
    { Icon: Coins, x: "16%", y: "80%", s: 36, d: "0.3s", o: 0.055 },
    { Icon: Wallet, x: "38%", y: "86%", s: 34, d: "1.4s", o: 0.05 },
    { Icon: Landmark, x: "60%", y: "82%", s: 38, d: "2.0s", o: 0.06 },
    { Icon: TrendingUp, x: "82%", y: "88%", s: 32, d: "0.8s", o: 0.045 },
    { Icon: Bitcoin, x: "96%", y: "78%", s: 36, d: "1.7s", o: 0.055 },
    { Icon: Globe2, x: "48%", y: "42%", s: 28, d: "3.0s", o: 0.035 },
    { Icon: Coins, x: "26%", y: "44%", s: 30, d: "1.0s", o: 0.04 },
    { Icon: Activity, x: "70%", y: "46%", s: 28, d: "2.4s", o: 0.035 },
  ];

  return (
    <div className="floating-tokens" aria-hidden="true">
      {tokens.map((t, i) => (
        <div
          key={i}
          className="floating-token"
          style={{
            left: t.x,
            top: t.y,
            animationDelay: t.d,
            opacity: t.o,
            fontSize: t.s,
          }}
        >
          <t.Icon />
        </div>
      ))}
    </div>
  );
};

/* ---- Stat row ---- */
const HeroStats = () => (
  <div className="hero-stats-bar">
    <div className="hero-stat">
      <Shield size={22} strokeWidth={2} />
      <div>
        <b>Bank-Grade</b>
        <span>Security</span>
      </div>
    </div>
    <div className="hero-stat">
      <Users size={22} strokeWidth={2} />
      <div>
        <b>10,000+</b>
        <span>Active Traders</span>
      </div>
    </div>
    <div className="hero-stat">
      <Award size={22} strokeWidth={2} />
      <div>
        <b>24/7</b>
        <span>Expert Support</span>
      </div>
    </div>
  </div>
);

function fmtPrice(v) {
  if (!Number.isFinite(v)) return "–";
  if (v >= 1000) return v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
  if (v >= 1) return v.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 4 });
  return v.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 4, maximumFractionDigits: 5 });
}
const fmtChange = c => (c == null ? "–" : `${c >= 0 ? "+" : ""}${c.toFixed(1)}%`);
const tone = c => (c == null ? "" : c >= 0 ? "up" : "down");

/* ---- Live-price card ---- */
const HeroCard = ({ still }) => {
  const [prices, setPrices] = useState(null);

  useEffect(() => {
    api("/markets")
      .then(d => {
        const btc = d.crypto?.find(c => c.id === "bitcoin");
        const eth = d.crypto?.find(c => c.id === "ethereum");
        setPrices({ btc, eth });
      })
      .catch(() => setPrices(null));
  }, []);

  const btc = prices?.btc;
  const eth = prices?.eth;

  return (
    <div className="hero-card">
      <div className="hero-card-header">
        <HexMark size={44} />
        <div>
          <b>NORVEXA</b>
          <span>Trading Platform</span>
        </div>
      </div>

      <div className="hero-chart">
        <svg viewBox="0 0 600 200" aria-hidden="true">
          <defs>
            <linearGradient id="area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#4FC3F7" stopOpacity=".32" />
              <stop offset="1" stopColor="#4FC3F7" stopOpacity="0" />
            </linearGradient>
          </defs>
          <g className="chart-grid">
            {[40, 80, 120, 160].map((y) => (
              <line key={y} x1="0" x2="600" y1={y} y2={y} />
            ))}
          </g>
          <path
            className="chart-area"
            d={`${LINE} L600 200 L0 200 Z`}
            fill="url(#area)"
          />
          <path
            className="chart-line"
            pathLength="1"
            d={LINE}
            fill="none"
            stroke="#4FC3F7"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          {still ? (
            <circle className="chart-dot" cx="600" cy="20" r="5" />
          ) : (
            <circle className="chart-dot" r="5" opacity="0">
              <set attributeName="opacity" to="1" begin="0.9s" />
              <animateMotion
                dur="2.6s"
                begin="0.9s"
                fill="freeze"
                path={LINE}
                calcMode="spline"
                keyTimes="0;1"
                keySplines="0.4 0 0.2 1"
              />
            </circle>
          )}
        </svg>
      </div>

      <div className="hero-card-footer">
        <div className="price-ticker">
          <span className="ticker-label">BTC/USD</span>
          <span className={`ticker-price ${tone(btc?.change24h)}`}>
            {btc ? fmtPrice(btc.price) : "$67,420.50"}
          </span>
          <span className={`ticker-change ${tone(btc?.change24h)}`}>
            {btc ? fmtChange(btc.change24h) : "+2.4%"}
          </span>
        </div>
        <div className="price-ticker">
          <span className="ticker-label">ETH/USD</span>
          <span className={`ticker-price ${tone(eth?.change24h)}`}>
            {eth ? fmtPrice(eth.price) : "$3,580.20"}
          </span>
          <span className={`ticker-change ${tone(eth?.change24h)}`}>
            {eth ? fmtChange(eth.change24h) : "+1.8%"}
          </span>
        </div>
      </div>
    </div>
  );
};

/* ---- Main Hero ---- */
export default function Hero() {
  const still = prefersReducedMotion();
  return (
    <section className="hero">
      <div className="hero-grid" aria-hidden="true" />
      {!still && <FloatingTokens />}

      <div className="hero-container">
        <div className="hero-content">
          <div className="hero-badge">
            <span className="pulse-dot" />
            Live Markets · Real-Time Trading
          </div>

          <h1 className="hero-title">
            <span className="line" style={{ "--i": 0 }}>
              <span>Precision.</span>
            </span>
            <span className="line" style={{ "--i": 1 }}>
              <span>Strategy.</span>
            </span>
            <span className="line accent" style={{ "--i": 2 }}>
              <span>Global Opportunities.</span>
            </span>
          </h1>

          <p className="hero-description">
            NORVEXA INVEST GLOBAL delivers institutional-grade trading across
            digital assets, currency markets, and commodities. Advanced
            security, real-time analytics, and dedicated support for discerning
            investors worldwide.
          </p>

          <div className="hero-actions">
            <Link className="btn-primary btn-lg" to="/register">
              Start Trading <ArrowRight size={18} />
            </Link>
            <a className="btn-secondary btn-lg" href="/#markets">
              View Live Markets
            </a>
          </div>

          <HeroStats />
        </div>

        <div className="hero-visual">
          <HeroCard still={still} />
        </div>
      </div>
    </section>
  );
}
