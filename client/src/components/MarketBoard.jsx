import React, { useEffect, useMemo, useRef, useState } from "react";
import { Bitcoin, Coins, Globe2 } from "lucide-react";
import { api } from "../api";

const TABS = [
  { key: "crypto", label: "Crypto", icon: Bitcoin },
  { key: "gold", label: "Gold", icon: Coins },
  { key: "forex", label: "Forex", icon: Globe2 }
];

function fmtPrice(v, key) {
  if (!Number.isFinite(v)) return "–";
  if (key === "forex") return v.toLocaleString("en-US", { minimumFractionDigits: v > 20 ? 3 : 4, maximumFractionDigits: v > 20 ? 3 : 4 });
  if (v >= 1000) return v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
  if (v >= 1) return v.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 4 });
  return v.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 4, maximumFractionDigits: 5 });
}
const fmtChange = c => (c == null ? "–" : `${c >= 0 ? "+" : ""}${c.toFixed(2)}%`);
const tone = c => (c == null ? "" : c >= 0 ? "up" : "down");

function toPath(values, w, h, pad = 6) {
  const min = Math.min(...values), max = Math.max(...values), span = max - min || 1;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * w, pad + (1 - (v - min) / span) * (h - pad * 2)]);
  return { pts, line: pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" "), min, max };
}

function Spark({ values, up }) {
  if (!values || values.length < 2) return <div className="spark-empty" />;
  const { line } = toPath(values, 120, 36, 3);
  return <svg className={`mini-spark ${up ? "up" : "down"}`} viewBox="0 0 120 36" preserveAspectRatio="none" aria-hidden="true"><path pathLength="1" d={line} /></svg>;
}

function BigChart({ asset, tab }) {
  const [hover, setHover] = useState(null);
  const box = useRef(null);
  const W = 720, H = 260;
  const chart = useMemo(() => (asset?.spark?.length > 1 ? toPath(asset.spark, W, H, 14) : null), [asset]);
  if (!chart) return <div className="big-chart empty">No chart data available.</div>;
  const up = (asset.change24h ?? 0) >= 0;
  const color = up ? "#5FD3A1" : "#FF8F8F";

  function onMove(e) {
    const r = box.current.getBoundingClientRect();
    const x = Math.min(Math.max(((e.clientX - r.left) / r.width) * W, 0), W);
    setHover(Math.round((x / W) * (asset.spark.length - 1)));
  }
  const hp = hover != null ? chart.pts[hover] : null;
  return (
    <div className="big-chart">
      <div className="big-head">
        <div><span className="big-name">{asset.name}</span><span className="big-sym">{asset.symbol}</span></div>
        <div className="big-price"><strong key={asset.price}>{fmtPrice(hover != null ? asset.spark[hover] : asset.price, tab)}</strong><span className={tone(asset.change24h)}>{fmtChange(asset.change24h)} {tab === "forex" ? "1 day" : "24h"}</span></div>
      </div>
      <svg ref={box} key={asset.id} viewBox={`0 0 ${W} ${H}`} onPointerMove={onMove} onPointerLeave={() => setHover(null)} role="img" aria-label={`${asset.name} price chart`}>
        <defs><linearGradient id={`fill-${up}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={color} stopOpacity=".28" /><stop offset="1" stopColor={color} stopOpacity="0" /></linearGradient></defs>
        {[0.25, 0.5, 0.75].map(f => <line key={f} className="gl" x1="0" x2={W} y1={H * f} y2={H * f} />)}
        <path className="area" d={`${chart.line} L${W} ${H} L0 ${H} Z`} fill={`url(#fill-${up})`} />
        <path className="ln" pathLength="1" d={chart.line} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        {hp && <g><line className="cross" x1={hp[0]} x2={hp[0]} y1="0" y2={H} /><circle cx={hp[0]} cy={hp[1]} r="5" fill="#fff" stroke={color} strokeWidth="2" /></g>}
      </svg>
      <div className="big-foot"><span>Low {fmtPrice(chart.min, tab)}</span><span>{tab === "forex" ? "Last 5 weeks" : "Last 7 days"}</span><span>High {fmtPrice(chart.max, tab)}</span></div>
    </div>
  );
}

export default function MarketBoard() {
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);
  const [tab, setTab] = useState("crypto");
  const [selected, setSelected] = useState({});
  const [flash, setFlash] = useState({});
  const prev = useRef({});

  async function load() {
    try {
      const d = await api("/markets");
      const f = {};
      [...d.crypto, ...d.gold, ...d.forex].forEach(a => {
        if (prev.current[a.id] != null && prev.current[a.id] !== a.price) f[a.id] = a.price > prev.current[a.id] ? "up" : "down";
        prev.current[a.id] = a.price;
      });
      setFlash(f); setData(d); setFailed(false);
      setTimeout(() => setFlash({}), 1200);
    } catch { setFailed(true); }
  }
  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, []);

  const list = data?.[tab] ?? [];
  const active = list.find(a => a.id === selected[tab]) ?? list[0];

  return (
    <div className="board">
      <div className="tabs" role="tablist">
        {TABS.map(t => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} className={tab === t.key ? "tab on" : "tab"} onClick={() => setTab(t.key)}>
            <t.icon size={16} /> {t.label}
          </button>
        ))}
      </div>

      {!data && !failed && <div className="board-grid"><div className="skeleton" style={{ height: 340 }} /><div className="skeleton" style={{ height: 340 }} /></div>}
      {failed && !data && <p className="empty">Live prices are unavailable right now. They will load again automatically.</p>}

      {data && (
        <div className="board-grid" key={tab}>
          <BigChart asset={active} tab={tab} />
          <ul className="asset-list">
            {list.map((a, i) => (
              <li key={a.id} style={{ "--i": i }}>
                <button className={`asset ${active?.id === a.id ? "on" : ""}`} onClick={() => setSelected({ ...selected, [tab]: a.id })}>
                  <span className="asset-name"><b>{a.symbol}</b><small>{tab === "gold" ? "per troy oz" : a.name}</small></span>
                  <Spark values={a.spark} up={(a.change24h ?? 0) >= 0} />
                  <span className="asset-price"><span className={flash[a.id] ? `flash-${flash[a.id]}` : ""}>{fmtPrice(a.price, tab)}</span><small className={tone(a.change24h)}>{fmtChange(a.change24h)}</small></span>
                </button>
              </li>
            ))}
            {list.length === 0 && <li className="empty">No data for this market right now.</li>}
          </ul>
        </div>
      )}
      <p className="source">Crypto and gold from CoinGecko (gold tracks the PAX Gold token, one troy ounce each), refreshed every minute. Forex from European Central Bank reference rates, published once per working day.</p>
    </div>
  );
}
