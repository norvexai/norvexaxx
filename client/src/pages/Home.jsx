import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ShieldCheck, Activity, Wallet, TrendingUp, Clock, Award, Bitcoin, Globe2, Coins } from "lucide-react";
import MarketBoard from "../components/MarketBoard";
import Hero from "../components/Hero";
import Reveal from "../components/Reveal";
import { Wordmark } from "../components/Brand";

const principles = [
  { icon: ShieldCheck, title: "Security First", text: "Bank-grade encryption and multi-layer account protection for your peace of mind." },
  { icon: Activity, title: "Real-Time Trading", text: "Advanced trading infrastructure across crypto, forex, and commodities markets." },
  { icon: Wallet, title: "Asset Protection", text: "Cold storage solutions and segregated accounts for maximum fund security." }
];

const planHighlights = [
  { name: "Bronze", return: "10%", period: "2 weeks", min: "$100", icon: Award, color: "#CD7F32" },
  { name: "Silver", return: "15%", period: "Weekly", min: "$250", icon: Award, color: "#C0C0C0" },
  { name: "Gold", return: "20%", period: "Weekly", min: "$500", icon: Award, color: "#FFD700" },
  { name: "Platinum", return: "25%", period: "3 weeks", min: "$1,000", icon: Award, color: "#E5E4E2" },
  { name: "Elite", return: "450%", period: "7 days", min: "$5,000", icon: Award, color: "#4FC3F7" },
];

const features = [
  { icon: Bitcoin, title: "Crypto Trading", text: "Bitcoin, Ethereum, USDT and major altcoins with deep liquidity." },
  { icon: Globe2, title: "Forex Markets", text: "Major and exotic currency pairs with competitive spreads." },
  { icon: Coins, title: "Commodities", text: "Gold, silver, oil and agricultural commodities trading." },
  { icon: TrendingUp, title: "Advanced Analytics", text: "Professional charting tools and real-time market data." },
  { icon: ShieldCheck, title: "Regulated Security", text: "Compliance-focused platform with regular security audits." },
  { icon: Clock, title: "24/7 Support", text: "Dedicated customer support team available around the clock." }
];

const steps = [
  ["Create Your Account", "Complete registration with your details. Advanced verification protects your account."],
  ["Fund Your Account", "Deposit via Bitcoin, USDT, or Ethereum. Multiple payment options available."],
  ["Choose Your Plan", "Select from our tiered investment plans designed for every level of investor."],
  ["Track Your Growth", "Monitor your portfolio performance with real-time analytics and reporting."]
];

export default function Home() {
  return (
    <>
      <Hero />

      <section className="section" id="markets">
        <Reveal className="section-head">
          <h2>Live Market Data</h2>
          <p>Real-time prices for cryptocurrency, gold, and major currency pairs. Professional-grade market intelligence.</p>
        </Reveal>
        <Reveal><MarketBoard /></Reveal>
      </section>

      <section className="section plans-preview" id="plans">
        <Reveal className="section-head">
          <h2>Investment Plans</h2>
          <p>Tiered investment strategies designed to meet your financial goals. Fixed capital plans with scheduled returns.</p>
        </Reveal>
        <div className="plans-preview-grid">
          {planHighlights.map((p, i) => (
            <Reveal as="div" className="plan-preview-card" delay={i * 80} key={p.name}>
              <div className="plan-preview-icon" style={{ background: `${p.color}20`, color: p.color }}>
                <p.icon size={28} />
              </div>
              <h3>{p.name}</h3>
              <div className="plan-preview-return" style={{ color: p.color }}>{p.return}</div>
              <p className="plan-preview-period">{p.period} return</p>
              <p className="plan-preview-min">Min: {p.min}</p>
            </Reveal>
          ))}
        </div>
        <Reveal>
          <Link to="/register" className="button" style={{ marginTop: 30 }}>
            Start Investing Today <ArrowRight size={17} />
          </Link>
        </Reveal>
      </section>

      <section className="section features-section" id="features">
        <Reveal className="section-head">
          <h2>Why Choose NORVEXA</h2>
          <p>Professional trading infrastructure with institutional-grade security and support.</p>
        </Reveal>
        <div className="features-grid">
          {features.map((f, i) => (
            <Reveal as="div" className="feature-card" delay={i * 60} key={f.title}>
              <div className="feature-icon"><f.icon size={24} /></div>
              <h3>{f.title}</h3>
              <p>{f.text}</p>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="split section" id="approach">
        <Reveal>
          <h2>Institutional-Grade Approach</h2>
          <p>Our platform combines cutting-edge technology with rigorous risk management. We prioritize capital preservation while seeking growth opportunities across global markets.</p>
        </Reveal>
        <Reveal className="principles">
          {principles.map(p => (
            <div key={p.title}><p.icon /><div><b>{p.title}</b><p>{p.text}</p></div></div>
          ))}
        </Reveal>
      </section>

      <section className="section about" id="about">
        <Reveal>
          <h2>Global Market Access</h2>
          <p>NORVEXA INVEST GLOBAL provides sophisticated trading solutions across digital assets, foreign exchange, and commodity markets. Our platform serves institutional and retail clients worldwide with professional tools and dedicated support.</p>
        </Reveal>
        <Reveal as="ol" className="steps">
          {steps.map(([t, d], i) => <li key={t} style={{ "--d": `${i * 220}ms` }}><b>{t}</b><p>{d}</p></li>)}
        </Reveal>
      </section>

      <section className="contact section" id="contact">
        <Reveal>
          <h2>Get Started Today</h2>
          <p>Join thousands of investors who trust NORVEXA for their trading needs. Our team is ready to assist you.</p>
          <Link to="/register" className="button">Create Your Account <ArrowRight size={17} /></Link>
          <p className="fine" style={{ marginTop: 16 }}>24/7 Customer Support: norvexainvementglobal@gmail.com</p>
        </Reveal>
      </section>

      <footer>
        <Link to="/" className="brand-link"><Wordmark /></Link>
        <p>© {new Date().getFullYear()} NORVEXA INVEST GLOBAL. All rights reserved.</p>
        <p className="fine">Risk disclosure: Trading in cryptocurrency, forex and commodities involves significant risk and may not be suitable for everyone. You may lose some or all of your capital. Past performance is not indicative of future results. Nothing on this website constitutes investment advice or a guarantee of returns.</p>
        <div className="foot-links">
          <Link to="/risk">Risk Disclosure</Link>
          <Link to="/privacy">Privacy Policy</Link>
          <Link to="/terms">Terms of Service</Link>
        </div>
      </footer>
    </>
  );
}
