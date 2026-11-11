import React from "react";

export default function Legal({ title }) {
  return (
    <section className="portal page">
      <h1>{title}</h1>
      <p className="sub">NORVEXA INVEST GLOBAL</p>
      <p className="fine" style={{ fontSize: 15 }}>Trading in cryptocurrency, foreign exchange and commodities carries substantial risk. Prices can move rapidly and you may lose some or all of your capital. No profit or return is guaranteed. Nothing on this website is an offer, solicitation or individualized investment advice.</p>
    </section>
  );
}
