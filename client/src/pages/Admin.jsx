import React, { useEffect, useState } from "react";
import { api } from "../api";
import { money, toCents } from "../format";
import { useCountUp } from "../hooks";
import { useToast } from "../toast";
import {
  Bitcoin, Wallet, Settings, TrendingUp, ArrowUpRight, ArrowDownRight,
  Clock, MessageCircle, Send, Users, Hash, Plus, Pencil, Trash2, X,
  Shield, User, Lock, Eye, EyeOff
} from "lucide-react";

const labels = {
  customers: "Customers", pendingDeposits: "Pending Deposits", pendingWithdrawals: "Pending Withdrawals",
  recordedTrades: "Recorded Trades", activeSubscriptions: "Active Plans",
  totalInvestedCents: "Total Invested", totalBalancesCents: "Total Balances", unreadChats: "Unread Chats"
};
const Stat = ({ label, value, isMoney }) => {
  const v = useCountUp(Number(value) || 0, 700);
  return (
    <div className="stat">
      <small>{labels[label] || label}</small>
      <strong>{isMoney ? money(v) : v.toLocaleString()}</strong>
    </div>
  );
};

const blankTrade = { userId: "", accountId: "", market: "CRYPTO", symbol: "", side: "BUY", quantity: "", entryPrice: "" };
const blankAdjust = { userId: "", accountId: "", amount: "", direction: "CREDIT", reason: "" };
const blankPlan = {
  name: "", description: "", priceUsdCents: "", durationDays: "",
  riskLabel: "Moderate risk", minDepositCents: "", maxDepositCents: "",
  weeklyReturnPct: "", totalReturnPct: "", capitalReturnFreq: "weekly", planTier: ""
};

export default function Admin({ user, onUserUpdate }) {
  const [overview, setOverview] = useState(null);
  const [requests, setRequests] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [open, setOpen] = useState([]);
  const [leaving, setLeaving] = useState({});
  const [trade, setTrade] = useState(blankTrade);
  const [close, setClose] = useState({});
  const [adjust, setAdjust] = useState(blankAdjust);
  const [addresses, setAddresses] = useState([]);
  const [addrEdits, setAddrEdits] = useState({});
  const [activeTab, setActiveTab] = useState("overview");
  const [chats, setChats] = useState([]);
  const [selectedChat, setSelectedChat] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [replyText, setReplyText] = useState("");

  // Plans state
  const [plans, setPlans] = useState([]);
  const [planForm, setPlanForm] = useState(blankPlan);
  const [editingPlan, setEditingPlan] = useState(null);
  const [showPlanForm, setShowPlanForm] = useState(false);

  // Admin settings state
  const [adminProfile, setAdminProfile] = useState({ name: user.name || "", phone: user.phone || "", address: user.address || "", city: user.city || "", state: user.state || "", country: user.country || "", zip_code: user.zip_code || "" });
  const [passwordForm, setPasswordForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [settingsTab, setSettingsTab] = useState("profile");
  const [showPassword, setShowPassword] = useState({ current: false, new: false, confirm: false });

  const toast = useToast();
  const canFinance = ["ADMIN", "FINANCE"].includes(user.role);
  const canTrade = ["ADMIN", "TRADER"].includes(user.role);
  const isAdmin = user.role === "ADMIN";

  async function load() {
    try {
      const jobs = [api("/admin/overview").then(setOverview)];
      if (canFinance) {
        jobs.push(api("/admin/requests").then(setRequests));
        jobs.push(api("/admin/deposit-addresses").then(d => {
          setAddresses(d.addresses);
          const edits = {};
          d.addresses.forEach(a => { edits[a.currency] = { address: a.address, network: a.network, label: a.label }; });
          setAddrEdits(edits);
        }));
        jobs.push(api("/admin/chats").then(d => setChats(d.chats)));
      }
      if (canTrade) {
        jobs.push(
          api("/admin/customers").then(d => setCustomers(d.customers)),
          api("/admin/trades/open").then(d => setOpen(d.trades))
        );
      }
      if (isAdmin) {
        jobs.push(api("/admin/plans").then(d => setPlans(d.plans)));
      }
      await Promise.all(jobs);
    } catch (e) { toast(e.message, "err"); }
  }
  useEffect(() => { load(); }, []);

  async function review(type, id, decision) {
    try {
      setLeaving(l => ({ ...l, [id]: true }));
      await api(`/admin/${type}/${id}/review`, { method: "POST", body: JSON.stringify({ decision }) });
      toast(decision === "APPROVED" ? "Approved and customer notified." : "Rejected.");
      setTimeout(load, 450);
    } catch (e) { setLeaving(l => ({ ...l, [id]: false })); toast(e.message, "err"); }
  }

  async function recordTrade(e) {
    e.preventDefault();
    try {
      const d = await api("/admin/trades", { method: "POST", body: JSON.stringify(trade) });
      toast(d.message); setTrade(blankTrade); load();
    } catch (err) { toast(err.message, "err"); }
  }

  async function closeTrade(t) {
    const c = close[t.id] || {};
    try {
      const d = await api(`/admin/trades/${t.id}/close`, { method: "POST", body: JSON.stringify({ exitPrice: c.exit, pnlCents: toCents(c.pnl) }) });
      toast(d.message); load();
    } catch (err) { toast(err.message, "err"); }
  }

  async function adjustBalance(e) {
    e.preventDefault();
    try {
      const d = await api("/admin/adjust-balance", {
        method: "POST",
        body: JSON.stringify({
          userId: adjust.userId,
          accountId: adjust.accountId,
          amountCents: toCents(adjust.amount),
          direction: adjust.direction,
          reason: adjust.reason
        })
      });
      toast(d.message);
      setAdjust(blankAdjust);
      load();
    } catch (err) { toast(err.message, "err"); }
  }

  async function saveAddress(currency) {
    const edit = addrEdits[currency];
    if (!edit?.address) { toast("Address cannot be empty.", "err"); return; }
    try {
      const d = await api(`/admin/deposit-addresses/${currency}`, {
        method: "PUT",
        body: JSON.stringify({ address: edit.address, network: edit.network, label: edit.label })
      });
      toast(d.message);
      load();
    } catch (err) { toast(err.message, "err"); }
  }

  async function payReturn(subId) {
    try {
      const d = await api(`/admin/subscriptions/${subId}/pay-return`, { method: "POST" });
      toast(d.message);
      load();
    } catch (err) { toast(err.message, "err"); }
  }

  async function openChat(userId) {
    setSelectedChat(userId);
    try {
      const d = await api(`/admin/chats/${userId}`);
      setChatMessages(d.messages);
      load();
    } catch (err) { toast(err.message, "err"); }
  }

  async function sendReply(e) {
    e.preventDefault();
    if (!replyText.trim() || !selectedChat) return;
    try {
      await api(`/admin/chats/${selectedChat}/reply`, { method: "POST", body: JSON.stringify({ message: replyText }) });
      setReplyText("");
      openChat(selectedChat);
    } catch (err) { toast(err.message, "err"); }
  }

  // Plan CRUD
  async function savePlan(e) {
    e.preventDefault();
    try {
      const payload = {
        ...planForm,
        priceUsdCents: Number(planForm.priceUsdCents) * 100,
        minDepositCents: Number(planForm.minDepositCents) * 100,
        maxDepositCents: planForm.maxDepositCents ? Number(planForm.maxDepositCents) * 100 : null,
        durationDays: Number(planForm.durationDays),
        weeklyReturnPct: Number(planForm.weeklyReturnPct),
        totalReturnPct: Number(planForm.totalReturnPct),
        planTier: Number(planForm.planTier)
      };
      if (editingPlan) {
        await api(`/admin/plans/${editingPlan.id}`, { method: "PUT", body: JSON.stringify(payload) });
        toast("Plan updated successfully.");
      } else {
        await api("/admin/plans", { method: "POST", body: JSON.stringify(payload) });
        toast("Plan created successfully.");
      }
      setPlanForm(blankPlan);
      setEditingPlan(null);
      setShowPlanForm(false);
      load();
    } catch (err) { toast(err.message, "err"); }
  }

  async function deletePlan(plan) {
    if (!confirm(`Delete "${plan.name}" plan? This cannot be undone.`)) return;
    try {
      await api(`/admin/plans/${plan.id}`, { method: "DELETE" });
      toast("Plan deleted.");
      load();
    } catch (err) { toast(err.message, "err"); }
  }

  function startEditPlan(plan) {
    setEditingPlan(plan);
    setPlanForm({
      name: plan.name,
      description: plan.description,
      priceUsdCents: String(plan.priceUsdCents / 100),
      durationDays: String(plan.durationDays),
      riskLabel: plan.riskLabel,
      minDepositCents: String(plan.minDepositCents / 100),
      maxDepositCents: plan.maxDepositCents ? String(plan.maxDepositCents / 100) : "",
      weeklyReturnPct: String(plan.weeklyReturnPct),
      totalReturnPct: String(plan.totalReturnPct),
      capitalReturnFreq: plan.capitalReturnFreq,
      planTier: String(plan.planTier)
    });
    setShowPlanForm(true);
  }

  function startNewPlan() {
    setEditingPlan(null);
    setPlanForm(blankPlan);
    setShowPlanForm(true);
  }

  // Admin profile & password
  async function saveAdminProfile(e) {
    e.preventDefault();
    try {
      const d = await api("/profile", { method: "PUT", body: JSON.stringify(adminProfile) });
      onUserUpdate(d.user);
      toast("Profile updated successfully.");
    } catch (err) { toast(err.message, "err"); }
  }

  async function changeAdminPassword(e) {
    e.preventDefault();
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast("New passwords do not match", "err");
      return;
    }
    try {
      await api("/profile/password", {
        method: "PUT",
        body: JSON.stringify({ currentPassword: passwordForm.currentPassword, newPassword: passwordForm.newPassword })
      });
      toast("Password changed successfully.");
      setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
    } catch (err) { toast(err.message, "err"); }
  }

  const accounts = customers.find(c => c.id === trade.userId)?.accounts ?? [];
  const adjustAccounts = customers.find(c => c.id === adjust.userId)?.accounts ?? [];

  const renderReq = (r, type, detail) => (
    <div key={r.id} className={`request ${leaving[r.id] ? "leaving" : ""}`}>
      <b>{r.userName} <span className="meta">{money(r.amountCents)}</span></b>
      <p>{detail}</p>
      {r.currency && <p><span className="pill">{r.currency}</span></p>}
      {r.txid && (
        <p className="txid-display">
          <Hash size={12} /> TXID: {r.txid.slice(0, 20)}...
          {r.txidVerified && <span className="txid-verified">✓ Verified</span>}
        </p>
      )}
      <div className="btns">
        <button className="mini ok" onClick={() => review(type, r.id, "APPROVED")}>Approve</button>
        <button className="mini no" onClick={() => review(type, r.id, "REJECTED")}>Reject</button>
      </div>
    </div>
  );

  const TABS = [
    { key: "overview", label: "Overview", icon: TrendingUp },
    ...(canFinance ? [
      { key: "requests", label: "Requests", icon: Clock },
      { key: "chats", label: "Chats", icon: MessageCircle, badge: overview?.unreadChats },
      { key: "adjust", label: "Adjust Balance", icon: Settings },
      { key: "addresses", label: "Addresses", icon: Wallet },
    ] : []),
    ...(canTrade ? [{ key: "trades", label: "Trades", icon: Bitcoin }] : []),
    ...(isAdmin ? [{ key: "plans", label: "Plans", icon: TrendingUp }] : []),
    { key: "settings", label: "My Account", icon: User },
  ];

  return (
    <section className="portal page">
      <div className="dash-header">
        <div>
          <h1>Admin Dashboard</h1>
          <p className="sub">Signed in as {user.name} ({user.role.toLowerCase()})</p>
        </div>
      </div>

      <div className="admin-tabs">
        {TABS.map(t => (
          <button key={t.key} className={`admin-tab ${activeTab === t.key ? "on" : ""}`} onClick={() => setActiveTab(t.key)}>
            <t.icon size={16} /> <span className="tab-label">{t.label}</span>
            {t.badge > 0 && <span className="chat-badge">{t.badge}</span>}
          </button>
        ))}
      </div>

      {activeTab === "overview" && overview && (
        <>
          <div className="stats" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))" }}>
            <Stat label="customers" value={overview.customers} />
            <Stat label="pendingDeposits" value={overview.pendingDeposits} />
            <Stat label="pendingWithdrawals" value={overview.pendingWithdrawals} />
            <Stat label="recordedTrades" value={overview.recordedTrades} />
            <Stat label="activeSubscriptions" value={overview.activeSubscriptions} />
            <Stat label="totalInvestedCents" value={overview.totalInvestedCents} isMoney />
            <Stat label="totalBalancesCents" value={overview.totalBalancesCents} isMoney />
            <Stat label="unreadChats" value={overview.unreadChats} />
          </div>

          <h2>Active Plan Subscriptions</h2>
          <div className="admin-subscriptions">
            {customers.map(c => (
              <div key={c.id} className="admin-customer-block">
                <h3>
                  {c.name} <span className="meta">{c.email}</span>
                  {c.kycStatus === 'VERIFIED' && <span className="badge verified" style={{ marginLeft: 8 }}>KYC ✓</span>}
                </h3>
                {c.accounts.map(a => (
                  <div key={a.id} className="admin-account-row">
                    <span>{a.label}</span>
                    <b>{money(a.balanceCents)}</b>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </>
      )}

      {activeTab === "requests" && requests && (
        <div className="dash-cols">
          <div>
            <h2>Deposit Requests</h2>
            {requests.deposits.length === 0 && <p className="empty">Nothing waiting.</p>}
            {requests.deposits.map(r => renderReq(r, "deposits", r.reference || "No reference supplied"))}
          </div>
          <div>
            <h2>Withdrawal Requests</h2>
            {requests.withdrawals.length === 0 && <p className="empty">Nothing waiting.</p>}
            {requests.withdrawals.map(r => renderReq(r, "withdrawals", r.destination))}
          </div>
        </div>
      )}

      {activeTab === "chats" && (
        <div className="admin-chat-layout">
          <div className="chat-list-panel">
            <h2>Customer Chats</h2>
            {chats.length === 0 && <p className="empty">No chat conversations.</p>}
            {chats.map(c => (
              <div
                key={c.user_id}
                className={`chat-list-item ${selectedChat === c.user_id ? "on" : ""} ${c.unread > 0 ? "unread" : ""}`}
                onClick={() => openChat(c.user_id)}
              >
                <div className="chat-list-avatar"><Users size={20} /></div>
                <div className="chat-list-info">
                  <b>{c.name}</b>
                  <span>{c.email}</span>
                </div>
                {c.unread > 0 && <span className="chat-badge">{c.unread}</span>}
              </div>
            ))}
          </div>
          <div className="chat-conversation-panel">
            {selectedChat ? (
              <>
                <div className="chat-messages admin-chat-messages">
                  {chatMessages.map((m) => (
                    <div key={m.id} className={`chat-msg ${m.senderType === "ADMIN" ? "out" : "in"}`}>
                      <div className="chat-bubble">{m.message}</div>
                      <span className="chat-time">{new Date(m.createdAt).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
                <form className="chat-input" onSubmit={sendReply}>
                  <input
                    value={replyText}
                    onChange={e => setReplyText(e.target.value)}
                    placeholder="Type your reply..."
                  />
                  <button type="submit" disabled={!replyText.trim()}><Send size={18} /></button>
                </form>
              </>
            ) : (
              <div className="chat-empty-state">
                <MessageCircle size={48} />
                <p>Select a conversation to view messages</p>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "adjust" && (
        <div className="admin-adjust-section">
          <h2>Adjust Customer Balance</h2>
          <p className="sub">Increase or decrease a customer&apos;s account balance after successful or failed trades.</p>
          <form className="panel" onSubmit={adjustBalance}>
            <label>Customer
              <select required value={adjust.userId} onChange={e => setAdjust({ ...adjust, userId: e.target.value, accountId: "" })}>
                <option value="">Select a customer</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.name} ({c.email})</option>)}
              </select>
            </label>
            <label>Account
              <select required value={adjust.accountId} onChange={e => setAdjust({ ...adjust, accountId: e.target.value })}>
                <option value="">Select an account</option>
                {adjustAccounts.map(a => <option key={a.id} value={a.id}>{a.label} ({money(a.balanceCents)})</option>)}
              </select>
            </label>
            <div className="two">
              <label>Direction
                <select value={adjust.direction} onChange={e => setAdjust({ ...adjust, direction: e.target.value })}>
                  <option value="CREDIT">Credit (Increase)</option>
                  <option value="DEBIT">Debit (Decrease)</option>
                </select>
              </label>
              <label>Amount (USD)
                <input required type="number" min="0.01" step="0.01" value={adjust.amount} onChange={e => setAdjust({ ...adjust, amount: e.target.value })} />
              </label>
            </div>
            <label>Reason
              <input required placeholder="e.g. Profit from BTC trade, Loss adjustment, etc." value={adjust.reason} onChange={e => setAdjust({ ...adjust, reason: e.target.value })} />
            </label>
            <button className="button full" type="submit">
              {adjust.direction === "CREDIT" ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
              {adjust.direction === "CREDIT" ? " Credit Account" : " Debit Account"}
            </button>
          </form>
        </div>
      )}

      {activeTab === "addresses" && (
        <div>
          <h2>Deposit Addresses</h2>
          <p className="sub">Configure the crypto addresses shown to customers for deposits.</p>
          {addresses.map(a => (
            <div key={a.currency} className="panel address-edit-panel">
              <div className="address-edit-header">
                <span className={`crypto-badge crypto-${a.currency.toLowerCase()}`}>{a.currency}</span>
                <b>{a.label || a.network}</b>
              </div>
              <label>Wallet Address
                <input value={addrEdits[a.currency]?.address || ""} onChange={e => setAddrEdits({ ...addrEdits, [a.currency]: { ...addrEdits[a.currency], address: e.target.value } })} placeholder={`Enter ${a.currency} deposit address`} />
              </label>
              <div className="two">
                <label>Network
                  <input value={addrEdits[a.currency]?.network || ""} onChange={e => setAddrEdits({ ...addrEdits, [a.currency]: { ...addrEdits[a.currency], network: e.target.value } })} placeholder="e.g. TRC20, ERC20, BTC" />
                </label>
                <label>Label
                  <input value={addrEdits[a.currency]?.label || ""} onChange={e => setAddrEdits({ ...addrEdits, [a.currency]: { ...addrEdits[a.currency], label: e.target.value } })} placeholder="Display label" />
                </label>
              </div>
              <button className="button small" onClick={() => saveAddress(a.currency)}>Save {a.currency} Address</button>
            </div>
          ))}
        </div>
      )}

      {activeTab === "trades" && canTrade && (
        <div className="dash-cols">
          <div>
            <h2>Record a Trade</h2>
            <form className="panel" onSubmit={recordTrade}>
              <label style={{ marginTop: 0 }}>Customer
                <select required value={trade.userId} onChange={e => setTrade({ ...trade, userId: e.target.value, accountId: "" })}>
                  <option value="">Select a customer</option>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
              <label>Account
                <select required value={trade.accountId} onChange={e => setTrade({ ...trade, accountId: e.target.value })}>
                  <option value="">Select an account</option>
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.label} ({money(a.balanceCents)})</option>)}
                </select>
              </label>
              <div className="two">
                <label>Market
                  <select value={trade.market} onChange={e => setTrade({ ...trade, market: e.target.value })}>
                    <option value="CRYPTO">Crypto</option>
                    <option value="FOREX">Forex</option>
                    <option value="COMMODITY">Commodity</option>
                  </select>
                </label>
                <label>Side
                  <select value={trade.side} onChange={e => setTrade({ ...trade, side: e.target.value })}>
                    <option>BUY</option>
                    <option>SELL</option>
                  </select>
                </label>
                <label>Symbol<input required minLength="2" value={trade.symbol} onChange={e => setTrade({ ...trade, symbol: e.target.value })} /></label>
                <label>Quantity<input required value={trade.quantity} onChange={e => setTrade({ ...trade, quantity: e.target.value })} /></label>
              </div>
              <label>Entry Price<input required value={trade.entryPrice} onChange={e => setTrade({ ...trade, entryPrice: e.target.value })} /></label>
              <button className="button full">Record Trade</button>
            </form>
          </div>
          <div>
            <h2>Open Trades</h2>
            {open.length === 0 && <p className="empty">No open trades.</p>}
            {open.map(t => (
              <div className="request" key={t.id}>
                <b>{t.symbol} <span className="meta">{t.side.toLowerCase()} for {t.userName}, entry {t.entryPrice}</span></b>
                <div className="two">
                  <label>Exit Price<input value={close[t.id]?.exit || ""} onChange={e => setClose({ ...close, [t.id]: { ...close[t.id], exit: e.target.value } })} /></label>
                  <label>Profit or Loss (USD)<input type="number" step="0.01" value={close[t.id]?.pnl || ""} onChange={e => setClose({ ...close, [t.id]: { ...close[t.id], pnl: e.target.value } })} /></label>
                </div>
                <div className="btns">
                  <button className="mini ok" disabled={!close[t.id]?.exit || close[t.id]?.pnl === undefined || close[t.id]?.pnl === ""} onClick={() => closeTrade(t)}>Close Trade</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Plans Management */}
      {activeTab === "plans" && isAdmin && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <h2>Investment Plans</h2>
            <button className="button" onClick={startNewPlan}><Plus size={16} /> New Plan</button>
          </div>

          {showPlanForm && (
            <form className="panel" onSubmit={savePlan} style={{ marginBottom: 24 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h3>{editingPlan ? "Edit Plan" : "Create New Plan"}</h3>
                <button type="button" className="icon-btn" onClick={() => { setShowPlanForm(false); setEditingPlan(null); }}><X size={18} /></button>
              </div>
              <div className="two">
                <label>Plan Name<input required value={planForm.name} onChange={e => setPlanForm({ ...planForm, name: e.target.value })} placeholder="e.g. Diamond" /></label>
                <label>Tier (sort order)<input required type="number" min="1" value={planForm.planTier} onChange={e => setPlanForm({ ...planForm, planTier: e.target.value })} /></label>
              </div>
              <label>Description<textarea required value={planForm.description} onChange={e => setPlanForm({ ...planForm, description: e.target.value })} rows={2} placeholder="Brief description shown to customers" /></label>
              <div className="two">
                <label>Price (USD)<input required type="number" min="0" step="0.01" value={planForm.priceUsdCents} onChange={e => setPlanForm({ ...planForm, priceUsdCents: e.target.value })} placeholder="100" /></label>
                <label>Duration (days)<input required type="number" min="1" value={planForm.durationDays} onChange={e => setPlanForm({ ...planForm, durationDays: e.target.value })} /></label>
              </div>
              <div className="two">
                <label>Min Deposit (USD)<input required type="number" min="0" step="0.01" value={planForm.minDepositCents} onChange={e => setPlanForm({ ...planForm, minDepositCents: e.target.value })} /></label>
                <label>Max Deposit (USD)<input type="number" min="0" step="0.01" value={planForm.maxDepositCents} onChange={e => setPlanForm({ ...planForm, maxDepositCents: e.target.value })} placeholder="Leave empty for unlimited" /></label>
              </div>
              <div className="two">
                <label>Weekly Return %<input required type="number" min="0" step="0.01" value={planForm.weeklyReturnPct} onChange={e => setPlanForm({ ...planForm, weeklyReturnPct: e.target.value })} /></label>
                <label>Total Return %<input required type="number" min="0" step="0.01" value={planForm.totalReturnPct} onChange={e => setPlanForm({ ...planForm, totalReturnPct: e.target.value })} /></label>
              </div>
              <div className="two">
                <label>Risk Label<input required value={planForm.riskLabel} onChange={e => setPlanForm({ ...planForm, riskLabel: e.target.value })} /></label>
                <label>Return Frequency
                  <select value={planForm.capitalReturnFreq} onChange={e => setPlanForm({ ...planForm, capitalReturnFreq: e.target.value })}>
                    <option value="weekly">Weekly</option>
                    <option value="daily">Daily</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </label>
              </div>
              <button className="button full" type="submit">{editingPlan ? "Update Plan" : "Create Plan"}</button>
            </form>
          )}

          <div className="plans-table-wrapper">
            <table className="plans-table">
              <thead>
                <tr>
                  <th>Tier</th>
                  <th>Name</th>
                  <th>Price</th>
                  <th>Duration</th>
                  <th>Weekly %</th>
                  <th>Total %</th>
                  <th>Min/Max</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {plans.map(p => (
                  <tr key={p.id} className={!p.active ? "inactive" : ""}>
                    <td>{p.planTier}</td>
                    <td><b>{p.name}</b><br/><small>{p.riskLabel}</small></td>
                    <td>${p.priceUsdCents / 100}</td>
                    <td>{p.durationDays}d</td>
                    <td>{p.weeklyReturnPct}%</td>
                    <td>{p.totalReturnPct}%</td>
                    <td>${p.minDepositCents / 100} / {p.maxDepositCents ? `$${p.maxDepositCents / 100}` : "∞"}</td>
                    <td><span className={`pill ${p.active ? "active" : "inactive"}`}>{p.active ? "Active" : "Inactive"}</span></td>
                    <td>
                      <div className="action-btns">
                        <button className="icon-btn" onClick={() => startEditPlan(p)} title="Edit"><Pencil size={14} /></button>
                        <button className="icon-btn danger" onClick={() => deletePlan(p)} title="Delete"><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Admin Settings */}
      {activeTab === "settings" && (
        <div className="admin-settings">
          <h2>My Account</h2>
          <div className="settings-tabs">
            <button className={settingsTab === "profile" ? "on" : ""} onClick={() => setSettingsTab("profile")}>
              <User size={16} /> Profile
            </button>
            <button className={settingsTab === "security" ? "on" : ""} onClick={() => setSettingsTab("security")}>
              <Lock size={16} /> Password
            </button>
          </div>

          {settingsTab === "profile" && (
            <form className="panel" onSubmit={saveAdminProfile}>
              <div className="two">
                <label>Full Name<input required value={adminProfile.name} onChange={e => setAdminProfile({ ...adminProfile, name: e.target.value })} /></label>
                <label>Phone<input value={adminProfile.phone} onChange={e => setAdminProfile({ ...adminProfile, phone: e.target.value })} /></label>
              </div>
              <label>Email<input value={user.email} disabled /></label>
              <label>Street Address<input value={adminProfile.address} onChange={e => setAdminProfile({ ...adminProfile, address: e.target.value })} /></label>
              <div className="two">
                <label>City<input value={adminProfile.city} onChange={e => setAdminProfile({ ...adminProfile, city: e.target.value })} /></label>
                <label>State/Province<input value={adminProfile.state} onChange={e => setAdminProfile({ ...adminProfile, state: e.target.value })} /></label>
              </div>
              <div className="two">
                <label>Country<input value={adminProfile.country} onChange={e => setAdminProfile({ ...adminProfile, country: e.target.value })} /></label>
                <label>ZIP/Postal Code<input value={adminProfile.zip_code} onChange={e => setAdminProfile({ ...adminProfile, zip_code: e.target.value })} /></label>
              </div>
              <button className="button full" type="submit"><Shield size={16} /> Save Profile</button>
            </form>
          )}

          {settingsTab === "security" && (
            <form className="panel" onSubmit={changeAdminPassword}>
              <label>Current Password
                <div className="password-input">
                  <input type={showPassword.current ? "text" : "password"} required value={passwordForm.currentPassword} onChange={e => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })} />
                  <button type="button" className="toggle-pw" onClick={() => setShowPassword(s => ({ ...s, current: !s.current }))}>
                    {showPassword.current ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </label>
              <label>New Password
                <div className="password-input">
                  <input type={showPassword.new ? "text" : "password"} required minLength={10} value={passwordForm.newPassword} onChange={e => setPasswordForm({ ...passwordForm, newPassword: e.target.value })} />
                  <button type="button" className="toggle-pw" onClick={() => setShowPassword(s => ({ ...s, new: !s.new }))}>
                    {showPassword.new ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </label>
              <label>Confirm New Password
                <div className="password-input">
                  <input type={showPassword.confirm ? "text" : "password"} required value={passwordForm.confirmPassword} onChange={e => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })} />
                  <button type="button" className="toggle-pw" onClick={() => setShowPassword(s => ({ ...s, confirm: !s.confirm }))}>
                    {showPassword.confirm ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </label>
              <button className="button full" type="submit"><Lock size={16} /> Change Password</button>
            </form>
          )}
        </div>
      )}
    </section>
  );
}
