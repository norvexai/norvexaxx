import React, { useEffect, useState } from "react";
import { api } from "../api";
import { money } from "../format";
import { useToast } from "../toast";
import Reveal from "../components/Reveal";

const TIER_COLORS = {
  1: { border: "#CD7F32", glow: "rgba(205,127,50,0.3)", badge: "BRONZE" },
  2: { border: "#C0C0C0", glow: "rgba(192,192,192,0.3)", badge: "SILVER" },
  3: { border: "#FFD700", glow: "rgba(255,215,0,0.3)", badge: "GOLD" },
  4: { border: "#E5E4E2", glow: "rgba(229,228,226,0.35)", badge: "PLATINUM" },
  5: { border: "#4FC3F7", glow: "rgba(79,195,247,0.4)", badge: "ELITE" },
};

function PlanCard({ plan, index, onSubscribe, busy }) {
  const [amount, setAmount] = useState("");
  const colors = TIER_COLORS[plan.planTier] || TIER_COLORS[1];
  const minDollars = plan.minDepositCents / 100;
  const maxDollars = plan.maxDepositCents ? plan.maxDepositCents / 100 : null;

  const handleSubscribe = () => {
    const amt = amount ? Math.round(parseFloat(amount) * 100) : plan.priceUsdCents;
    onSubscribe(plan.id, amt);
  };

  return (
    <Reveal as="article" className="plan-card" delay={index * 90} key={plan.id}>
      <div className="plan-card-inner" style={{ "--plan-border": colors.border, "--plan-glow": colors.glow }}>
        <div className="plan-badge" style={{ background: colors.border, color: plan.planTier >= 3 ? "#1a1a1a" : "#fff" }}>
          {colors.badge}
        </div>
        <h3>{plan.name}</h3>
        <div className="plan-return">
          <span className="plan-return-pct">{plan.totalReturnPct}%</span>
          <span className="plan-return-label">Total Return</span>
        </div>
        <p className="plan-desc">{plan.description}</p>
        <div className="plan-details">
          <div className="plan-detail">
            <span>Min Deposit</span>
            <b>${minDollars.toLocaleString()}</b>
          </div>
          {maxDollars && (
            <div className="plan-detail">
              <span>Max Deposit</span>
              <b>${maxDollars.toLocaleString()}</b>
            </div>
          )}
          <div className="plan-detail">
            <span>Duration</span>
            <b>{plan.durationDays} days</b>
          </div>
          <div className="plan-detail">
            <span>Return Frequency</span>
            <b style={{ textTransform: "capitalize" }}>{plan.capitalReturnFreq}</b>
          </div>
          <div className="plan-detail">
            <span>Return Rate</span>
            <b>{plan.weeklyReturnPct}% {plan.capitalReturnFreq === "daily" ? "daily" : "weekly"}</b>
          </div>
          <div className="plan-detail">
            <span>Risk</span>
            <b>{plan.riskLabel}</b>
          </div>
        </div>
        <div className="plan-invest">
          <label>Investment amount (USD)</label>
          <input
            type="number"
            min={minDollars}
            max={maxDollars || undefined}
            placeholder={`Min $${minDollars.toLocaleString()}`}
            value={amount}
            onChange={e => setAmount(e.target.value)}
          />
        </div>
        <button
          className={`button full ${busy === plan.id ? "busy" : ""}`}
          disabled={busy === plan.id}
          onClick={handleSubscribe}
        >
          {busy === plan.id ? "Processing…" : `Invest in ${plan.name}`}
        </button>
      </div>
    </Reveal>
  );
}

export default function Plans({ onSubscribed }) {
  const [plans, setPlans] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const toast = useToast();

  useEffect(() => {
    api("/plans").then(d => setPlans(d.plans)).catch(e => toast(e.message, "err"));
  }, []);

  async function subscribe(planId, amountCents) {
    setBusyId(planId);
    try {
      const d = await api("/subscriptions", { method: "POST", body: JSON.stringify({ planId, amountCents }) });
      toast(d.message);
      onSubscribed?.();
    } catch (e) {
      toast(e.message, "err");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div className="plans-header">
        <h2>Investment Plans</h2>
        <p>Choose a plan that fits your goals. Fixed capital plans with scheduled returns.</p>
      </div>
      <div className="plans-grid">
        {!plans && [0, 1, 2, 3, 4].map(i => <div className="skeleton" key={i} style={{ height: 480 }} />)}
        {plans?.map((p, i) => (
          <PlanCard key={p.id} plan={p} index={i} onSubscribe={subscribe} busy={busyId} />
        ))}
      </div>
    </div>
  );
}
