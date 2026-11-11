import React, { useEffect, useState } from "react";
import { Routes, Route, Link, NavLink, useLocation } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { api } from "./api";
import { useScrolled } from "./hooks";
import { HexMark, Wordmark } from "./components/Brand";
import Home from "./pages/Home";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Admin from "./pages/Admin";
import Legal from "./pages/Legal";

const STAFF = ["ADMIN", "FINANCE", "COMPLIANCE", "TRADER"];

function Nav({ user, onLogout }) {
  const [open, setOpen] = useState(false);
  const scrolled = useScrolled();
  const close = () => setOpen(false);
  return (
    <header className={`nav ${scrolled ? "scrolled" : ""}`}>
      <Link to="/" className="brand-link" onClick={close}><HexMark size={34} /><Wordmark /></Link>
      <button className="mobile-toggle" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} onClick={() => setOpen(!open)}>{open ? <X /> : <Menu />}</button>
      <nav className={open ? "nav-links show" : "nav-links"}>
        <Link to="/#markets" onClick={close}>Markets</Link>
        <Link to="/#plans" onClick={close}>Plans</Link>
        <Link to="/#approach" onClick={close}>Our approach</Link>
        <Link to="/#about" onClick={close}>About</Link>
        <Link to="/#contact" onClick={close}>Contact</Link>
        {user ? <>
          <NavLink to={STAFF.includes(user.role) ? "/admin" : "/dashboard"} onClick={close}>{STAFF.includes(user.role) ? "Admin" : "Dashboard"}</NavLink>
          <button className="link-button" onClick={() => { close(); onLogout(); }}>Sign out</button>
        </> : <>
          <NavLink to="/login" onClick={close}>Sign in</NavLink>
          <Link className="button small" to="/register" onClick={close}>Get started</Link>
        </>}
      </nav>
    </header>
  );
}

function ScrollManager() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (hash) setTimeout(() => document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: "smooth" }), 60);
    else window.scrollTo({ top: 0 });
  }, [pathname, hash]);
  return null;
}

export default function App() {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const location = useLocation();
  useEffect(() => { api("/auth/me").then(d => setUser(d.user)).catch(() => {}).finally(() => setReady(true)); }, []);
  async function logout() { await api("/auth/logout", { method: "POST" }); setUser(null); }

  if (!ready) return <div className="loading"><HexMark draw size={72} />NORVEXA</div>;
  const isStaff = user && STAFF.includes(user.role);
  return (
    <>
      <ScrollManager />
      <Nav user={user} onLogout={logout} />
      <Routes location={location} key={location.pathname}>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Auth mode="login" onAuth={setUser} />} />
        <Route path="/register" element={<Auth mode="register" onAuth={setUser} />} />
        <Route path="/dashboard" element={user ? <Dashboard user={user} onUserUpdate={setUser} /> : <Auth mode="login" onAuth={setUser} />} />
        <Route path="/admin" element={isStaff ? <Admin user={user} onUserUpdate={setUser} /> : user ? <Legal title="Staff access required" /> : <Auth mode="login" onAuth={setUser} />} />
        <Route path="/risk" element={<Legal title="Risk disclosure" />} />
        <Route path="/privacy" element={<Legal title="Privacy policy" />} />
        <Route path="/terms" element={<Legal title="Terms of use" />} />
      </Routes>
    </>
  );
}
