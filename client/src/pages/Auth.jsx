import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { HexMark } from "../components/Brand";
import { 
  User, Mail, Lock, Phone, MapPin, Home, Globe, Hash, 
  ArrowRight, Shield, Eye, EyeOff, CheckCircle 
} from "lucide-react";

export default function Auth({ mode, onAuth }) {
  const [form, setForm] = useState({ 
    name: "", email: "", password: "", confirmPassword: "",
    phone: "", address: "", city: "", state: "", country: "", zip_code: "" 
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [step, setStep] = useState(1);
  const nav = useNavigate();
  const login = mode === "login";
  const set = k => e => setForm({ ...form, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();

    if (!login && form.password !== form.confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setError(""); 
    setBusy(true);
    try {
      const payload = login 
        ? { email: form.email, password: form.password }
        : {
            name: form.name, email: form.email, password: form.password,
            phone: form.phone, address: form.address, city: form.city,
            state: form.state, country: form.country, zip_code: form.zip_code
          };
      const d = await api(`/auth/${mode}`, { method: "POST", body: JSON.stringify(payload) });
if (d.token) localStorage.setItem("norvexa_token", d.token);
onAuth(d.user);
      nav(["ADMIN", "FINANCE", "COMPLIANCE", "TRADER"].includes(d.user.role) ? "/admin" : "/dashboard");
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  const nextStep = () => {
    if (step === 1 && (!form.name || !form.email || !form.phone)) {
      setError("Please fill in all personal information");
      return;
    }
    if (step === 2 && (!form.address || !form.city || !form.state || !form.country)) {
      setError("Please fill in all address information");
      return;
    }
    setError("");
    setStep(step + 1);
  };

  const prevStep = () => {
    setError("");
    setStep(step - 1);
  };

  return (
    <main className="auth-page">
      {/* Background Effects */}
      <div className="auth-bg">
        <div className="auth-grid" />
        <div className="auth-glow auth-glow-1" />
        <div className="auth-glow auth-glow-2" />
      </div>

      <div className="auth-container">
        {/* Left Panel - Branding */}
        <div className="auth-brand-panel">
          <Link to="/" className="auth-logo">
            <HexMark size={48} draw />
            <div className="auth-logo-text">
              <span className="brand-name">NORVEXA</span>
              <span className="brand-tag">INVEST GLOBAL</span>
            </div>
          </Link>

          <div className="auth-brand-content">
            <h1>{login ? "Welcome Back" : "Start Your Investment Journey"}</h1>
            <p>{login 
              ? "Access your portfolio and continue building your financial future with institutional-grade trading." 
              : "Join thousands of investors trading crypto, forex, and commodities on a secure, professional platform."}
            </p>

            <div className="auth-features">
              <div className="auth-feature">
                <CheckCircle size={20} />
                <span>Bank-grade security & encryption</span>
              </div>
              <div className="auth-feature">
                <CheckCircle size={20} />
                <span>24/7 dedicated support</span>
              </div>
              <div className="auth-feature">
                <CheckCircle size={20} />
                <span>Multi-asset trading platform</span>
              </div>
            </div>
          </div>

          <div className="auth-stats">
            <div className="auth-stat">
              <b>$50M+</b>
              <span>Assets Managed</span>
            </div>
            <div className="auth-stat">
              <b>10K+</b>
              <span>Active Traders</span>
            </div>
            <div className="auth-stat">
              <b>99.9%</b>
              <span>Uptime</span>
            </div>
          </div>
        </div>

        {/* Right Panel - Form */}
        <div className="auth-form-panel">
          <form className="auth-form" onSubmit={submit}>
            <div className="auth-form-header">
              <h2>{login ? "Sign In" : "Create Account"}</h2>
              <p>{login ? "Enter your credentials to access your account" : `Step ${step} of ${login ? 1 : 3}`}</p>
            </div>

            {/* Progress Bar for Registration */}
            {!login && (
              <div className="auth-progress">
                <div className="auth-progress-bar">
                  <div className="auth-progress-fill" style={{ width: `${(step / 3) * 100}%` }} />
                </div>
                <div className="auth-progress-steps">
                  <span className={step >= 1 ? "active" : ""}>Personal</span>
                  <span className={step >= 2 ? "active" : ""}>Address</span>
                  <span className={step >= 3 ? "active" : ""}>Security</span>
                </div>
              </div>
            )}

            {error && <div className="auth-error"><Shield size={16} /> {error}</div>}

            {/* Step 1: Personal Info */}
            {!login && step === 1 && (
              <div className="auth-step">
                <div className="form-group">
                  <label>Full Name</label>
                  <div className="input-wrapper">
                    <User size={18} className="input-icon" />
                    <input 
                      required 
                      minLength="2" 
                      autoComplete="name" 
                      value={form.name} 
                      onChange={set("name")} 
                      placeholder="John Doe" 
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label>Email Address</label>
                  <div className="input-wrapper">
                    <Mail size={18} className="input-icon" />
                    <input 
                      required 
                      type="email" 
                      autoComplete="email" 
                      value={form.email} 
                      onChange={set("email")} 
                      placeholder="you@example.com" 
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label>Phone Number</label>
                  <div className="input-wrapper">
                    <Phone size={18} className="input-icon" />
                    <input 
                      required 
                      minLength="7" 
                      autoComplete="tel" 
                      value={form.phone} 
                      onChange={set("phone")} 
                      placeholder="+1 (555) 123-4567" 
                    />
                  </div>
                </div>

                <button type="button" className="btn-primary" onClick={nextStep}>
                  Continue <ArrowRight size={18} />
                </button>
              </div>
            )}

            {/* Step 2: Address */}
            {!login && step === 2 && (
              <div className="auth-step">
                <div className="form-group">
                  <label>Street Address</label>
                  <div className="input-wrapper">
                    <Home size={18} className="input-icon" />
                    <input 
                      required 
                      value={form.address} 
                      onChange={set("address")} 
                      placeholder="123 Main Street" 
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>City</label>
                    <input required value={form.city} onChange={set("city")} placeholder="New York" />
                  </div>
                  <div className="form-group">
                    <label>State</label>
                    <input required value={form.state} onChange={set("state")} placeholder="NY" />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Country</label>
                    <div className="input-wrapper">
                      <Globe size={18} className="input-icon" />
                      <input required value={form.country} onChange={set("country")} placeholder="United States" />
                    </div>
                  </div>
                  <div className="form-group">
                    <label>ZIP Code</label>
                    <div className="input-wrapper">
                      <Hash size={18} className="input-icon" />
                      <input required value={form.zip_code} onChange={set("zip_code")} placeholder="10001" />
                    </div>
                  </div>
                </div>

                <div className="form-actions">
                  <button type="button" className="btn-secondary" onClick={prevStep}>
                    Back
                  </button>
                  <button type="button" className="btn-primary" onClick={nextStep}>
                    Continue <ArrowRight size={18} />
                  </button>
                </div>
              </div>
            )}

            {/* Step 3: Security / Login */}
            {(login || step === 3) && (
              <div className="auth-step">
                {!login && (
                  <>
                    <div className="form-group">
                      <label>Create Password</label>
                      <div className="input-wrapper">
                        <Lock size={18} className="input-icon" />
                        <input 
                          required 
                          type={showPassword ? "text" : "password"}
                          minLength="10" 
                          autoComplete="new-password" 
                          value={form.password} 
                          onChange={set("password")} 
                          placeholder="Minimum 10 characters" 
                        />
                        <button 
                          type="button" 
                          className="password-toggle"
                          onClick={() => setShowPassword(!showPassword)}
                        >
                          {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                      </div>
                      <small className="form-hint">Use at least 10 characters with letters, numbers & symbols</small>
                    </div>

                    <div className="form-group">
                      <label>Confirm Password</label>
                      <div className="input-wrapper">
                        <Lock size={18} className="input-icon" />
                        <input 
                          required 
                          type={showPassword ? "text" : "password"}
                          minLength="10" 
                          autoComplete="new-password" 
                          value={form.confirmPassword} 
                          onChange={set("confirmPassword")} 
                          placeholder="Repeat your password" 
                        />
                      </div>
                    </div>
                  </>
                )}

                {login && (
                  <>
                    <div className="form-group">
                      <label>Email Address</label>
                      <div className="input-wrapper">
                        <Mail size={18} className="input-icon" />
                        <input 
                          required 
                          type="email" 
                          autoComplete="email" 
                          value={form.email} 
                          onChange={set("email")} 
                          placeholder="you@example.com" 
                        />
                      </div>
                    </div>

                    <div className="form-group">
                      <label>Password</label>
                      <div className="input-wrapper">
                        <Lock size={18} className="input-icon" />
                        <input 
                          required 
                          type={showPassword ? "text" : "password"}
                          autoComplete="current-password" 
                          value={form.password} 
                          onChange={set("password")} 
                          placeholder="Your password" 
                        />
                        <button 
                          type="button" 
                          className="password-toggle"
                          onClick={() => setShowPassword(!showPassword)}
                        >
                          {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                      </div>
                    </div>
                  </>
                )}

                <div className="form-actions">
                  {!login && (
                    <button type="button" className="btn-secondary" onClick={prevStep}>
                      Back
                    </button>
                  )}
                  <button type="submit" className={`btn-primary ${busy ? "loading" : ""}`} disabled={busy}>
                    {busy ? "Please wait..." : login ? "Sign In" : "Create Account"} 
                    {!busy && <ArrowRight size={18} />}
                  </button>
                </div>
              </div>
            )}

            <div className="auth-footer">
              <p>
                {login ? (
                  <>Don't have an account? <Link to="/register">Create one now</Link></>
                ) : (
                  <>Already have an account? <Link to="/login">Sign in</Link></>
                )}
              </p>
              <p className="auth-terms">
                By continuing, you agree to our <Link to="/terms">Terms of Service</Link> and <Link to="/privacy">Privacy Policy</Link>
              </p>
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}
