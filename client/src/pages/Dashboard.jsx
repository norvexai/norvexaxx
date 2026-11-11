import React, { useEffect, useState, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { money, shortDate, toCents } from "../format";
import { useCountUp } from "../hooks";
import { useToast } from "../toast";
import Plans from "./Plans";
import { HexMark } from "../components/Brand";
import {
  Bitcoin, Copy, Check, Wallet, TrendingUp, Clock, ArrowUpRight, ArrowDownRight,
  MessageCircle, Send, X, User, Camera, Shield, Hash, CreditCard,
  PieChart, Activity, Bell, Settings, LogOut, ChevronRight,
  Home, Briefcase, BarChart3, History, HelpCircle
} from "lucide-react";

const Row = ({ i, children }) => <div className="row" style={{ "--i": i }}>{children}</div>;

const CRYPTO_ICONS = { BTC: Bitcoin, USDT: Wallet, ETH: Wallet };
const CRYPTO_COLORS = { BTC: "#F7931A", USDT: "#26A17B", ETH: "#627EEA" };

function StatCard({ icon: Icon, label, value, subtext, color, trend }) {
  return (
    <div className="stat-card" style={{ "--stat-color": color }}>
      <div className="stat-icon"><Icon size={22} /></div>
      <div className="stat-content">
        <span className="stat-label">{label}</span>
        <span className="stat-value">{value}</span>
        {subtext && <span className="stat-subtext">{subtext}</span>}
      </div>
      {trend && (
        <div className={`stat-trend ${trend > 0 ? 'up' : 'down'}`}>
          {trend > 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
          {Math.abs(trend)}%
        </div>
      )}
    </div>
  );
}

function DepositAddressCard({ addr }) {
  const [copied, setCopied] = useState(false);
  const Icon = CRYPTO_ICONS[addr.currency] || Wallet;
  const color = CRYPTO_COLORS[addr.currency] || "#4FC3F7";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(addr.address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = addr.address;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="deposit-addr-card" style={{ "--crypto-color": color }}>
      <div className="deposit-addr-header">
        <div className="crypto-icon" style={{ background: `${color}20`, color }}>
          <Icon size={24} />
        </div>
        <div>
          <b>{addr.currency}</b>
          <span className="deposit-network">{addr.network}</span>
        </div>
      </div>
      <div className="deposit-addr-body">
        <code className="deposit-addr-text">{addr.address}</code>
        <button className="copy-btn" onClick={copy} title="Copy address">
          {copied ? <Check size={16} /> : <Copy size={16} />}
        </button>
      </div>
    </div>
  );
}

function ChatWidget({ user, onClose, unreadCount }) {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    loadMessages();
    const interval = setInterval(loadMessages, 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function loadMessages() {
    try {
      const d = await api("/chat");
      setMessages(d.messages);
    } catch (e) {}
  }

  async function sendMessage(e) {
    e.preventDefault();
    if (!newMessage.trim()) return;
    setSending(true);
    try {
      await api("/chat", { method: "POST", body: JSON.stringify({ message: newMessage }) });
      setNewMessage("");
      loadMessages();
    } catch (err) {
      console.error(err);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="chat-widget">
      <div className="chat-header">
        <div className="chat-header-info">
          <div className="chat-avatar"><MessageCircle size={18} /></div>
          <div>
            <b>Support Team</b>
            <span className="chat-status">Online</span>
          </div>
        </div>
        <button className="chat-close" onClick={onClose}><X size={18} /></button>
      </div>
      <div className="chat-messages">
        {messages.length === 0 && (
          <div className="chat-empty">
            <MessageCircle size={32} />
            <p>How can we help you today?</p>
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`chat-msg ${m.senderType === "CUSTOMER" ? "out" : "in"}`}>
            <div className="chat-bubble">{m.message}</div>
            <span className="chat-time">{new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
      <form className="chat-input" onSubmit={sendMessage}>
        <input
          value={newMessage}
          onChange={e => setNewMessage(e.target.value)}
          placeholder="Type your message..."
          maxLength={1000}
        />
        <button type="submit" disabled={sending || !newMessage.trim()}>
          <Send size={18} />
        </button>
      </form>
    </div>
  );
}

function SettingsPanel({ user, onUpdate, onClose }) {
  const [form, setForm] = useState({
    name: user.name || "", phone: user.phone || "", address: user.address || "",
    city: user.city || "", state: user.state || "", country: user.country || "", zip_code: user.zip_code || ""
  });
  const [passwordForm, setPasswordForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [activeTab, setActiveTab] = useState("profile");
  const [saving, setSaving] = useState(false);
  const [showPw, setShowPw] = useState({ cur: false, new: false, conf: false });
  const toast = useToast();

  async function saveProfile(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const d = await api("/profile", { method: "PUT", body: JSON.stringify(form) });
      onUpdate(d.user);
      toast("Profile updated successfully!");
    } catch (err) {
      toast(err.message, "err");
    } finally {
      setSaving(false);
    }
  }

  async function changePassword(e) {
    e.preventDefault();
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast("New passwords do not match", "err");
      return;
    }
    setSaving(true);
    try {
      await api("/profile/password", {
        method: "PUT",
        body: JSON.stringify({
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword
        })
      });
      toast("Password changed successfully!");
      setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
    } catch (err) {
      toast(err.message, "err");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="settings-panel">
      <div className="settings-header">
        <h2>Account Settings</h2>
        <button className="icon-btn" onClick={onClose}><X size={20} /></button>
      </div>

      <div className="settings-tabs">
        <button className={activeTab === "profile" ? "on" : ""} onClick={() => setActiveTab("profile")}>
          <User size={16} /> Profile
        </button>
        <button className={activeTab === "security" ? "on" : ""} onClick={() => setActiveTab("security")}>
          <Shield size={16} /> Security
        </button>
      </div>

      {activeTab === "profile" && (
        <form className="settings-form" onSubmit={saveProfile}>
          <div className="form-row">
            <div className="form-group">
              <label>Full Name</label>
              <input value={form.name} onChange={e => setForm({...form, name: e.target.value})} />
            </div>
            <div className="form-group">
              <label>Phone Number</label>
              <input value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} />
            </div>
          </div>

          <div className="form-group">
            <label>Email Address</label>
            <input value={user.email} disabled className="disabled" />
            <small className="form-hint">Email cannot be changed</small>
          </div>

          <div className="form-group">
            <label>Street Address</label>
            <input value={form.address} onChange={e => setForm({...form, address: e.target.value})} />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>City</label>
              <input value={form.city} onChange={e => setForm({...form, city: e.target.value})} />
            </div>
            <div className="form-group">
              <label>State/Province</label>
              <input value={form.state} onChange={e => setForm({...form, state: e.target.value})} />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Country</label>
              <input value={form.country} onChange={e => setForm({...form, country: e.target.value})} />
            </div>
            <div className="form-group">
              <label>ZIP/Postal Code</label>
              <input value={form.zip_code} onChange={e => setForm({...form, zip_code: e.target.value})} />
            </div>
          </div>

          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </form>
      )}

      {activeTab === "security" && (
        <form className="settings-form" onSubmit={changePassword}>
          <div className="form-group">
            <label>Current Password</label>
            <div className="password-input">
              <input type={showPw.cur ? "text" : "password"} value={passwordForm.currentPassword} onChange={e => setPasswordForm({...passwordForm, currentPassword: e.target.value})} required />
              <button type="button" className="toggle-pw" onClick={() => setShowPw(s => ({...s, cur: !s.cur}))}>
                {showPw.cur ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div className="form-group">
            <label>New Password</label>
            <div className="password-input">
              <input type={showPw.new ? "text" : "password"} value={passwordForm.newPassword} onChange={e => setPasswordForm({...passwordForm, newPassword: e.target.value})} minLength={10} required />
              <button type="button" className="toggle-pw" onClick={() => setShowPw(s => ({...s, new: !s.new}))}>
                {showPw.new ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <small className="form-hint">Minimum 10 characters</small>
          </div>

          <div className="form-group">
            <label>Confirm New Password</label>
            <div className="password-input">
              <input type={showPw.conf ? "text" : "password"} value={passwordForm.confirmPassword} onChange={e => setPasswordForm({...passwordForm, confirmPassword: e.target.value})} required />
              <button type="button" className="toggle-pw" onClick={() => setShowPw(s => ({...s, conf: !s.conf}))}>
                {showPw.conf ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? "Changing..." : "Change Password"}
          </button>
        </form>
      )}
    </div>
  );
}

function ProfileCard({ user, onUpdate, onSettings }) {
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);
  const toast = useToast();

  async function uploadImage(e) {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('image', file);
      const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:4000/api'}/profile/image`, {
        method: 'POST',
        body: formData,
        credentials: 'include'
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      onUpdate(data.user);
      toast("Profile photo updated!");
    } catch (err) {
      toast(err.message, "err");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="profile-card">
      <div className="profile-cover" />
      <div className="profile-main">
        <div className="profile-avatar-large" onClick={() => fileInputRef.current?.click()}>
          {user.profile_image ? (
            <img src={user.profile_image} alt="Profile" />
          ) : (
            <User size={40} />
          )}
          <div className="avatar-overlay">
            <Camera size={18} />
          </div>
          <input
            type="file"
            ref={fileInputRef}
            onChange={uploadImage}
            accept="image/jpeg,image/png,image/webp"
            style={{ display: 'none' }}
          />
        </div>
        <div className="profile-info">
          <h2>{user.name}</h2>
          <p className="profile-email">{user.email}</p>
          <div className="profile-badges">
            {user.email_verified ? (
              <span className="badge verified"><Shield size={12} /> Verified</span>
            ) : (
              <span className="badge pending"><Clock size={12} /> Pending</span>
            )}
            <span className={`badge kyc-${user.kyc_status?.toLowerCase() || 'pending'}`}>
              KYC {user.kyc_status || 'Pending'}
            </span>
          </div>
        </div>
        <div className="profile-actions">
          <button className="icon-btn" onClick={onSettings} title="Settings"><Settings size={18} /></button>
        </div>
      </div>
      {uploading && <div className="upload-overlay">Uploading...</div>}
    </div>
  );
}

export default function Dashboard({ user, onUserUpdate }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [dep, setDep] = useState({ amount: "", currency: "BTC", txid: "" });
  const [wd, setWd] = useState({ amount: "", destination: "" });
  const [busy, setBusy] = useState("");
  const [showDeposit, setShowDeposit] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  const toast = useToast();
  const nav = useNavigate();

  const balance = useCountUp(data?.totalBalanceCents ?? 0);
  const invested = useCountUp(data?.totalInvestedCents ?? 0);
  const activeSubs = data?.subscriptions.filter(s => s.status === "ACTIVE").length ?? 0;
  const tradeCount = data?.accounts.reduce((n, a) => n + a.trades.length, 0) ?? 0;

  async function load() { try { setData(await api("/dashboard")); } catch (e) { setErr(e.message); } }
  useEffect(() => { load(); }, []);

  async function submit(kind, body, after) {
    setBusy(kind);
    try {
      const d = await api(`/${kind}`, { method: "POST", body: JSON.stringify({ accountId: data.accounts[0].id, ...body }) });
      toast(d.message); after?.(); await load();
    } catch (e) { toast(e.message, "err"); } finally { setBusy(""); }
  }

  async function logout() {
    await api("/auth/logout", { method: "POST" });
    nav("/login");
  }

  if (err) return (
    <div className="dashboard-error">
      <Shield size={48} />
      <h2>Unable to load dashboard</h2>
      <p>{err}</p>
      <button className="btn-primary" onClick={load}>Try Again</button>
    </div>
  );

  if (!data) return (
    <div className="dashboard-loading">
      <div className="loading-spinner" />
      <p>Loading your dashboard...</p>
    </div>
  );

  const selectedAddr = data.depositAddresses?.find(a => a.currency === dep.currency);

  const NAV_ITEMS = [
    { key: "overview", icon: Home, label: "Home" },
    { key: "invest", icon: Briefcase, label: "Invest" },
    { key: "wallet", icon: Wallet, label: "Wallet" },
    { key: "activity", icon: History, label: "Activity" },
  ];

  const renderOverview = () => (
    <>
      {/* Stats Grid */}
      <div className="stats-grid">
        <StatCard icon={Wallet} label="Total Balance" value={money(balance)} subtext="Available for trading" color="#4FC3F7" trend={2.5} />
        <StatCard icon={TrendingUp} label="Total Invested" value={money(invested)} subtext={`${activeSubs} active plans`} color="#5FD3A1" trend={5.2} />
        <StatCard icon={Activity} label="Active Plans" value={activeSubs} subtext="Running investments" color="#F2C26B" />
        <StatCard icon={CreditCard} label="Total Trades" value={tradeCount} subtext="Recorded trades" color="#B8E0F5" />
      </div>

      {/* Main Grid */}
      <div className="content-grid">
        {/* Left Column */}
        <div className="content-main">
          {/* Quick Actions */}
          <div className="quick-actions">
            <button className="quick-action" onClick={() => setShowDeposit(true)}>
              <div className="qa-icon" style={{ background: "#4FC3F720", color: "#4FC3F7" }}><ArrowDownRight size={20} /></div>
              <span>Deposit Funds</span><ChevronRight size={16} />
            </button>
            <button className="quick-action" onClick={() => setActiveTab("invest")}>
              <div className="qa-icon" style={{ background: "#5FD3A120", color: "#5FD3A1" }}><TrendingUp size={20} /></div>
              <span>Invest in Plan</span><ChevronRight size={16} />
            </button>
            <button className="quick-action">
              <div className="qa-icon" style={{ background: "#F2C26B20", color: "#F2C26B" }}><ArrowUpRight size={20} /></div>
              <span>Withdraw</span><ChevronRight size={16} />
            </button>
          </div>

          {/* Active Investments */}
          <section className="content-section">
            <div className="section-header">
              <h2>Active Investments</h2>
              <button className="link-btn" onClick={() => setActiveTab("invest")}>View All</button>
            </div>
            {data.subscriptions.filter(s => s.status === "ACTIVE").length === 0 ? (
              <div className="empty-state">
                <TrendingUp size={40} />
                <p>No active investments yet</p>
                <button className="btn-primary" onClick={() => setActiveTab("invest")}>Start Investing</button>
              </div>
            ) : (
              <div className="investments-list">
                {data.subscriptions.filter(s => s.status === "ACTIVE").map((s, i) => (
                  <div key={s.id} className="investment-card" style={{ "--i": i }}>
                    <div className="investment-info">
                      <div className="investment-plan">
                        <b>{s.planName}</b>
                        <span className={`pill ${s.status}`}>{s.status}</span>
                      </div>
                      <span className="investment-amount">{money(s.amountCents)}</span>
                    </div>
                    <div className="investment-progress">
                      <div className="progress-bar">
                        <div className="progress-fill" style={{ width: `${(s.returnsPaid / 4) * 100}%` }} />
                      </div>
                      <span className="progress-text">{s.returnsPaid}/4 returns paid</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Recent Activity */}
          <section className="content-section">
            <div className="section-header">
              <h2>Recent Activity</h2>
              <button className="link-btn" onClick={() => setActiveTab("activity")}>View All</button>
            </div>
            <div className="activity-list">
              {data.ledger.slice(0, 5).map((l, i) => (
                <div key={l.id} className="activity-item" style={{ "--i": i }}>
                  <div className={`activity-icon ${l.direction === "CREDIT" ? "credit" : "debit"}`}>
                    {l.direction === "CREDIT" ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
                  </div>
                  <div className="activity-details">
                    <b>{l.description}</b>
                    <span>{shortDate(l.createdAt)} · {l.type.replace(/_/g, " ").toLowerCase()}</span>
                  </div>
                  <span className={`activity-amount ${l.direction === "CREDIT" ? "credit" : "debit"}`}>
                    {l.direction === "CREDIT" ? "+" : "−"}{money(l.amountCents)}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Right Column */}
        <div className="content-sidebar">
          <ProfileCard user={user} onUpdate={onUserUpdate} onSettings={() => setShowSettings(true)} />

          {/* Deposit Panel */}
          {showDeposit && (
            <div className="panel deposit-panel">
              <div className="panel-header">
                <h3>Deposit Funds</h3>
                <button className="icon-btn" onClick={() => setShowDeposit(false)}><X size={18} /></button>
              </div>
              <div className="deposit-currency-tabs">
                {data.depositAddresses?.map(a => (
                  <button key={a.currency} className={`deposit-tab ${dep.currency === a.currency ? "on" : ""}`} onClick={() => setDep({ ...dep, currency: a.currency })}>
                    {a.currency}
                  </button>
                ))}
              </div>
              {selectedAddr && <DepositAddressCard addr={selectedAddr} />}
              <div className="form-group">
                <label>Amount (USD)</label>
                <input type="number" min="1" placeholder="100" value={dep.amount} onChange={e => setDep({ ...dep, amount: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Transaction ID (TXID)</label>
                <input placeholder="Enter blockchain transaction hash" value={dep.txid} onChange={e => setDep({ ...dep, txid: e.target.value })} />
              </div>
              <button className={`btn-primary full ${busy === "deposits" ? "loading" : ""}`} disabled={busy === "deposits" || !dep.amount} onClick={() => submit("deposits", { amountCents: toCents(dep.amount), currency: dep.currency, txid: dep.txid || undefined }, () => setDep({ amount: "", currency: dep.currency, txid: "" }))}>
                {busy === "deposits" ? "Submitting..." : "Submit Deposit"}
              </button>
            </div>
          )}

          {/* Withdrawal Form */}
          <div className="panel">
            <div className="panel-header"><h3>Quick Withdrawal</h3></div>
            <div className="form-group">
              <label>Amount (USD)</label>
              <input type="number" min="1" placeholder="50" value={wd.amount} onChange={e => setWd({ ...wd, amount: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Destination Address</label>
              <input placeholder="Your BTC / USDT / ETH address" value={wd.destination} onChange={e => setWd({ ...wd, destination: e.target.value })} />
            </div>
            <button className={`btn-secondary full ${busy === "withdrawals" ? "loading" : ""}`} disabled={busy === "withdrawals" || !wd.amount || !wd.destination} onClick={() => submit("withdrawals", { amountCents: toCents(wd.amount), destination: wd.destination }, () => setWd({ amount: "", destination: "" }))}>
              {busy === "withdrawals" ? "Processing..." : "Request Withdrawal"}
            </button>
          </div>
        </div>
      </div>
    </>
  );

  const renderInvest = () => (
    <div className="dashboard-tab-content">
      <div className="content-header">
        <div><h1>Investment Plans</h1><p>Choose a plan that fits your goals.</p></div>
      </div>
      <Plans user={user} />
    </div>
  );

  const renderWallet = () => (
    <div className="dashboard-tab-content">
      <div className="content-header">
        <div><h1>My Wallet</h1><p>Manage your funds and deposits.</p></div>
        <div className="header-actions">
          <button className="btn-primary" onClick={() => setShowDeposit(true)}><Wallet size={16} /> Deposit</button>
        </div>
      </div>
      <div className="content-grid single">
        <div className="content-main">
          <section className="content-section">
            <h2>Deposit Addresses</h2>
            <div className="deposit-addresses-grid">
              {data.depositAddresses?.map(a => <DepositAddressCard key={a.currency} addr={a} />)}
            </div>
          </section>
          <section className="content-section">
            <h2>Recent Deposits</h2>
            {data.deposits.length === 0 ? <p className="empty">No deposits yet.</p> : (
              <div className="activity-list">
                {data.deposits.map(d => (
                  <div key={d.id} className="activity-item">
                    <div className="activity-icon credit"><ArrowUpRight size={16} /></div>
                    <div className="activity-details"><b>{d.currency} Deposit</b><span>{shortDate(d.createdAt)}</span></div>
                    <span className={`activity-amount credit`}>+{money(d.amountCents)}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );

  const renderActivity = () => (
    <div className="dashboard-tab-content">
      <div className="content-header">
        <div><h1>Activity History</h1><p>All your transactions in one place.</p></div>
      </div>
      <div className="content-grid single">
        <div className="content-main">
          <section className="content-section">
            <h2>All Transactions</h2>
            <div className="activity-list full">
              {data.ledger.map((l, i) => (
                <div key={l.id} className="activity-item" style={{ "--i": i }}>
                  <div className={`activity-icon ${l.direction === "CREDIT" ? "credit" : "debit"}`}>
                    {l.direction === "CREDIT" ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
                  </div>
                  <div className="activity-details">
                    <b>{l.description}</b>
                    <span>{shortDate(l.createdAt)} · {l.type.replace(/_/g, " ").toLowerCase()}</span>
                  </div>
                  <span className={`activity-amount ${l.direction === "CREDIT" ? "credit" : "debit"}`}>
                    {l.direction === "CREDIT" ? "+" : "−"}{money(l.amountCents)}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );

  return (
    <div className="dashboard">
      {/* Sidebar - Desktop */}
      <aside className="sidebar desktop-only">
        <Link to="/" className="sidebar-logo">
          <HexMark size={36} />
          <span>NORVEXA</span>
        </Link>
        <nav className="sidebar-nav">
          {NAV_ITEMS.map(item => (
            <button key={item.key} className={activeTab === item.key ? "active" : ""} onClick={() => setActiveTab(item.key)}>
              <item.icon size={18} /> {item.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <button className="sidebar-btn" onClick={() => setShowChat(true)}>
            <MessageCircle size={18} /> Support
            {data.unreadMessages > 0 && <span className="badge-count">{data.unreadMessages}</span>}
          </button>
          <button className="sidebar-btn" onClick={() => setShowSettings(true)}>
            <Settings size={18} /> Settings
          </button>
          <button className="sidebar-btn logout" onClick={logout}>
            <LogOut size={18} /> Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        {activeTab === "overview" && (
          <>
            <header className="content-header">
              <div>
                <h1>Welcome back, {user.name.split(" ")[0]}</h1>
                <p>Here&apos;s what&apos;s happening with your investments today.</p>
              </div>
              <div className="header-actions">
                <button className="btn-secondary" onClick={() => setShowDeposit(true)}><Wallet size={16} /> Deposit</button>
                <button className="btn-primary" onClick={() => setActiveTab("invest")}><TrendingUp size={16} /> Invest Now</button>
              </div>
            </header>
            {renderOverview()}
          </>
        )}
        {activeTab === "invest" && renderInvest()}
        {activeTab === "wallet" && renderWallet()}
        {activeTab === "activity" && renderActivity()}
      </main>

      {/* Mobile Bottom Navigation */}
      <nav className="mobile-nav">
        {NAV_ITEMS.map(item => (
          <button key={item.key} className={activeTab === item.key ? "on" : ""} onClick={() => setActiveTab(item.key)}>
            <item.icon size={20} />
            <span>{item.label}</span>
          </button>
        ))}
        <button onClick={() => setShowChat(true)}>
          <MessageCircle size={20} />
          <span>Support</span>
          {data.unreadMessages > 0 && <span className="nav-badge">{data.unreadMessages}</span>}
        </button>
      </nav>

      {/* Settings Modal */}
      {showSettings && (
        <div className="modal-overlay" onClick={() => setShowSettings(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <SettingsPanel user={user} onUpdate={onUserUpdate} onClose={() => setShowSettings(false)} />
          </div>
        </div>
      )}

      {/* Chat Widget */}
      {showChat && <ChatWidget user={user} onClose={() => setShowChat(false)} unreadCount={data.unreadMessages} />}
    </div>
  );
}
