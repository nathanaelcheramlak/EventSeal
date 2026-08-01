import { FormEvent, lazy, Suspense, useEffect, useMemo, useState } from "react";
import {
  auditActionValues,
  auditResultValues,
  type AuditAction,
  type AuditLog,
  type AuditResult,
  type CreateQrResponse,
  type QrRecordSummary,
  type VerifyQrResponse
} from "@prom-event/shared";
import {
  ApiError,
  createQr,
  getAuditLogs,
  getQrRecord,
  getQrRecords,
  login,
  revokeQrRecord,
  verifyQr
} from "./api";
import { getJwtExpiresAt, isJwtExpired } from "./auth-token";

type Tab = "generate" | "verify" | "records" | "logs";

type SessionScanItem = {
  id: string;
  time: string;
  valid: boolean;
  name: string;
  reason?: string;
};

const QrScanner = lazy(() => import("./QrScanner").then((module) => ({ default: module.QrScanner })));

const tabs: Array<{ id: Tab; label: string; shortcut: string; icon: React.ReactNode }> = [
  {
    id: "generate",
    label: "Generate",
    shortcut: "G",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 5v14M5 12h14" />
      </svg>
    )
  },
  {
    id: "verify",
    label: "Verify",
    shortcut: "V",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        <path d="m9 12 2 2 4-4" />
      </svg>
    )
  },
  {
    id: "records",
    label: "Records",
    shortcut: "R",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M3 9h18M3 15h18M9 3v18" />
      </svg>
    )
  },
  {
    id: "logs",
    label: "Audit",
    shortcut: "A",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
      </svg>
    )
  }
];

const QR_MAX_TTL_DAYS = Number(import.meta.env.VITE_QR_MAX_TTL_DAYS ?? 30);
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function datetimeLocalInputValue(date: Date) {
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

function defaultExpirationLocalInputValue() {
  return datetimeLocalInputValue(new Date(Date.now() + QR_MAX_TTL_DAYS * MS_PER_DAY));
}

function maxExpirationLocalInputValue() {
  return datetimeLocalInputValue(new Date(Date.now() + QR_MAX_TTL_DAYS * MS_PER_DAY));
}

export default function App() {
  const [token, setToken] = useState(() => readStoredAuthToken());
  const [authNotice, setAuthNotice] = useState("");
  const [activeTab, setActiveTab] = useState<Tab>(() => readInitialTab());

  useEffect(() => {
    if (token) {
      localStorage.setItem("authToken", token);
    } else {
      localStorage.removeItem("authToken");
    }
  }, [token]);

  useEffect(() => {
    if (!token) {
      return;
    }

    const expiresAt = getJwtExpiresAt(token);

    if (!expiresAt) {
      expireSession();
      return;
    }

    const timeout = window.setTimeout(() => {
      expireSession();
    }, Math.max(expiresAt - Date.now(), 0));

    return () => window.clearTimeout(timeout);
  }, [token]);

  useEffect(() => {
    function syncTabFromHash() {
      setActiveTab(readInitialTab());
    }

    window.addEventListener("hashchange", syncTabFromHash);
    return () => window.removeEventListener("hashchange", syncTabFromHash);
  }, []);

  // Keyboard navigation shortcuts (Alt+G, Alt+V, Alt+R, Alt+A)
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.altKey) {
        const key = event.key.toLowerCase();
        if (key === "g") selectTab("generate");
        if (key === "v") selectTab("verify");
        if (key === "r") selectTab("records");
        if (key === "a") selectTab("logs");
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  function expireSession() {
    setAuthNotice("Your session expired. Sign in again.");
    setToken("");
  }

  function handleApiError(error: unknown, fallback: string) {
    if (error instanceof ApiError && error.status === 401) {
      expireSession();
      return "Your session expired. Sign in again.";
    }

    return error instanceof Error ? error.message : fallback;
  }

  function handleLogin(nextToken: string) {
    setAuthNotice("");
    setToken(nextToken);
  }

  function handleSignOut() {
    setAuthNotice("");
    setToken("");
  }

  function selectTab(tab: Tab) {
    setActiveTab(tab);
    window.history.replaceState(null, "", `#${tab}`);
  }

  if (!token) {
    return <LoginScreen notice={authNotice} onLogin={handleLogin} />;
  }

  return (
    <div className="app-container">
      {/* Sidebar Command Dock */}
      <aside className="sidebar-dock">
        <div>
          <div className="sidebar-header">
            <div className="sidebar-logo">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <rect x="3" y="3" width="7" height="7" rx="1.5" />
                <rect x="14" y="3" width="7" height="7" rx="1.5" />
                <rect x="3" y="14" width="7" height="7" rx="1.5" />
                <path d="M14 14h3v3h-3zM18 18h3v3h-3zM14 18h3v3h-3zM18 14h3v3h-3z" />
              </svg>
            </div>
            <div className="sidebar-brand">
              <h2>EventSeal</h2>
              <span>Organizer Console</span>
            </div>
          </div>

          <nav className="sidebar-nav" aria-label="Main navigation">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                className={`nav-item ${activeTab === tab.id ? "active" : ""}`}
                aria-current={activeTab === tab.id ? "page" : undefined}
                onClick={() => selectTab(tab.id)}
              >
                <div className="nav-item-content">
                  {tab.icon}
                  <span>{tab.label}</span>
                </div>
                <span className="nav-shortcut">Alt+{tab.shortcut}</span>
              </button>
            ))}
          </nav>
        </div>

        <div className="sidebar-footer">
          <div className="user-status-card">
            <div className="status-dot" />
            <span>Signed in as Organizer</span>
          </div>

          <button className="secondary" style={{ width: "100%" }} onClick={handleSignOut}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            Sign out
          </button>
        </div>
      </aside>

      {/* Main Workspace Viewport */}
      <div className="main-viewport">
        {/* Top Header Bar */}
        <header className="top-statbar">
          <div className="statbar-heading">
            <h1>
              {activeTab === "generate" && "Issue Pass"}
              {activeTab === "verify" && "Verify Pass"}
              {activeTab === "records" && "Pass Records"}
              {activeTab === "logs" && "Audit Logs"}
            </h1>
            <p>EventSeal Security Console</p>
          </div>

          <div className="statbar-metrics">
            <div className="hud-stat-pill">
              <div className="status-dot" />
              <span>Console Active</span>
            </div>
          </div>
        </header>

        <main className="view-content">
          {activeTab === "generate" && <GenerateQr token={token} onApiError={handleApiError} />}
          {activeTab === "verify" && <VerifyQr token={token} onApiError={handleApiError} />}
          {activeTab === "records" && <QrRecords token={token} onApiError={handleApiError} />}
          {activeTab === "logs" && <AuditLogs token={token} onApiError={handleApiError} />}
        </main>
      </div>
    </div>
  );
}

function readStoredAuthToken() {
  const storedToken = localStorage.getItem("authToken") ?? "";

  if (!storedToken || isJwtExpired(storedToken)) {
    localStorage.removeItem("authToken");
    return "";
  }

  return storedToken;
}

function readInitialTab(): Tab {
  const requestedTab = window.location.hash.replace("#", "");

  if (requestedTab === "generate" || requestedTab === "verify" || requestedTab === "records" || requestedTab === "logs") {
    return requestedTab;
  }

  return "generate";
}

function LoginScreen({ notice, onLogin }: { notice: string; onLogin: (token: string) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const response = await login({ username, password });
      onLogin(response.token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="login-shell">
      <div className="login-container">
        <div className="login-banner">
          <div>
            <div className="brand-mark large">
              <svg viewBox="0 0 24 24">
                <rect x="3" y="3" width="7" height="7" rx="1.5" />
                <rect x="14" y="3" width="7" height="7" rx="1.5" />
                <rect x="3" y="14" width="7" height="7" rx="1.5" />
                <path d="M14 14h3v3h-3zM18 18h3v3h-3zM14 18h3v3h-3zM18 14h3v3h-3z" />
              </svg>
            </div>
            <div className="login-banner-content">
              <p className="eyebrow">Organizer Access</p>
              <h2>EventSeal Console</h2>
              <p className="muted" style={{ marginTop: 8 }}>Secure event pass management and live check-in telemetry.</p>
            </div>
          </div>

          <div className="login-feature-list">
            <div className="login-feature-item">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 6L9 17l-5-5"/></svg>
              <span>Instant Camera Verification</span>
            </div>
            <div className="login-feature-item">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 6L9 17l-5-5"/></svg>
              <span>Signed QR Pass Security</span>
            </div>
            <div className="login-feature-item">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 6L9 17l-5-5"/></svg>
              <span>Real-Time Audit Trail</span>
            </div>
          </div>
        </div>

        <div className="login-panel-wrap">
          <form className="form-panel" onSubmit={handleSubmit}>
            <div style={{ marginBottom: 8 }}>
              <p className="eyebrow">Organizer Sign-in</p>
              <h2>Sign in to Console</h2>
            </div>

            {notice && <p className="notice">{notice}</p>}

            <label>
              Username
              <input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" placeholder="organizer" required />
            </label>

            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                placeholder="••••••••"
                required
              />
            </label>

            {error && <p className="error">{error}</p>}

            <button disabled={submitting} style={{ marginTop: 8 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                <polyline points="10 17 15 12 10 7" />
                <line x1="15" y1="12" x2="3" y2="12" />
              </svg>
              {submitting ? "Signing in..." : "Sign in"}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}

function GenerateQr({ token, onApiError }: { token: string; onApiError: (error: unknown, fallback: string) => string }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [expiresAt, setExpiresAt] = useState(defaultExpirationLocalInputValue);
  const [showCustomExpiry, setShowCustomExpiry] = useState(false);
  const [result, setResult] = useState<CreateQrResponse | null>(null);
  const [resultName, setResultName] = useState("");
  const [error, setError] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [activePreset, setActivePreset] = useState<string>("30d");

  const maxExpiresAt = useMemo(maxExpirationLocalInputValue, []);

  function setTtlPreset(days: number, key: string) {
    setActivePreset(key);
    const targetDate = new Date(Date.now() + days * MS_PER_DAY);
    setExpiresAt(datetimeLocalInputValue(targetDate));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setActionMessage("");
    setResult(null);
    setResultName("");

    const parsedExpiresAt = new Date(expiresAt);
    const now = Date.now();

    if (Number.isNaN(parsedExpiresAt.getTime())) {
      setError("Expiration must be a valid date");
      return;
    }

    if (parsedExpiresAt.getTime() <= now) {
      setError("Expiration must be in the future");
      return;
    }

    if (parsedExpiresAt.getTime() > now + QR_MAX_TTL_DAYS * MS_PER_DAY) {
      setError(`Expiration cannot be more than ${QR_MAX_TTL_DAYS} days in the future`);
      return;
    }

    setSubmitting(true);

    try {
      const isoExpiresAt = parsedExpiresAt.toISOString();
      const response = await createQr({ name, phone: phone || undefined, expiresAt: isoExpiresAt }, token);
      setResult(response);
      setResultName(name.trim());
    } catch (err) {
      setError(onApiError(err, "QR generation failed"));
    } finally {
      setSubmitting(false);
    }
  }

  async function copyToken() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.qrToken);
      setActionMessage("Token copied to clipboard.");
    } catch {
      setActionMessage("Copy failed. Select token manually.");
    }
  }

  function downloadQr() {
    if (!result) return;
    const link = document.createElement("a");
    link.href = result.qrImage;
    link.download = `${safeDownloadName(resultName || result.qrId)}.png`;
    link.click();
    setActionMessage("PNG download initialized.");
  }

  function printQr() {
    if (!result) return;
    window.print();
    setActionMessage("Print prompt initiated.");
  }

  return (
    <div className="generator-studio">
      <form className="panel form-panel" onSubmit={handleSubmit}>
        <div className="panel-heading">
          <div>
            <h2>Issue Event Pass</h2>
            <p className="muted" style={{ margin: "2px 0 0" }}>Generate a signed QR access token</p>
          </div>
          <span className="panel-tag active">Issue</span>
        </div>

        <label>
          Guest Full Name
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Alex Mercer" required />
        </label>

        <label>
          Phone Number (Optional)
          <input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+1 (555) 019-2834" />
        </label>

        {/* Collapsible Clean Expiration Selector */}
        <div className="expiration-control-group">
          <div className="expiration-summary-row">
            <div>
              <span className="eyebrow">Validity Duration</span>
              <p style={{ margin: "2px 0 0", fontSize: "0.88rem", fontWeight: 600, color: "var(--ink)" }}>
                30 Days (1 Month Default)
              </p>
            </div>
            <button
              type="button"
              className="secondary compact"
              onClick={() => setShowCustomExpiry(!showCustomExpiry)}
            >
              {showCustomExpiry ? "Hide Options" : "Customize"}
            </button>
          </div>

          {showCustomExpiry && (
            <div className="expiration-options-drawer" style={{ marginTop: 12, display: "grid", gap: 12 }}>
              <div className="ttl-presets">
                <button
                  type="button"
                  className={`ttl-chip ${activePreset === "24h" ? "active" : ""}`}
                  onClick={() => setTtlPreset(1, "24h")}
                >
                  24 Hours
                </button>
                <button
                  type="button"
                  className={`ttl-chip ${activePreset === "7d" ? "active" : ""}`}
                  onClick={() => setTtlPreset(7, "7d")}
                >
                  7 Days
                </button>
                <button
                  type="button"
                  className={`ttl-chip ${activePreset === "30d" ? "active" : ""}`}
                  onClick={() => setTtlPreset(QR_MAX_TTL_DAYS, "30d")}
                >
                  30 Days (Default)
                </button>
              </div>

              <label>
                Custom Expiration Date & Time
                <input
                  type="datetime-local"
                  value={expiresAt}
                  max={maxExpiresAt}
                  onChange={(event) => {
                    setExpiresAt(event.target.value);
                    setActivePreset("custom");
                  }}
                  required
                />
              </label>
            </div>
          )}
        </div>

        {error && <p className="error">{error}</p>}

        <button disabled={submitting} style={{ marginTop: 6 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M12 5v14M5 12h14" />
          </svg>
          {submitting ? "Generating Signed Pass..." : "Generate Pass"}
        </button>
      </form>

      {/* Live Pass Preview Card */}
      <div className="badge-preview-container">
        <div className="badge-card">
          <div className="badge-card-header">
            <div className="badge-logo-mark">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <rect x="3" y="3" width="7" height="7" rx="1" />
                <rect x="14" y="3" width="7" height="7" rx="1" />
                <rect x="3" y="14" width="7" height="7" rx="1" />
                <path d="M14 14h3v3h-3z" />
              </svg>
              <span>EVENTSEAL PASS</span>
            </div>
            <span className="panel-tag active">PASS PREVIEW</span>
          </div>

          <div className="badge-qr-stage">
            {result ? (
              <img className="badge-qr-image" src={result.qrImage} alt="Generated Pass QR Code" />
            ) : (
              <div style={{ textAlign: "center", padding: "36px 20px" }}>
                <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5" style={{ opacity: 0.4 }}>
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <path d="M7 7h3v3H7zM14 7h3v3h-3zM7 14h3v3H7z" />
                </svg>
                <p className="muted" style={{ marginTop: 10, fontSize: "0.82rem" }}>Fill guest info to generate pass</p>
              </div>
            )}
          </div>

          <div className="badge-guest-info">
            <div>
              <span className="eyebrow">Pass Holder</span>
              <h3 className="badge-guest-name">{name.trim() || "Guest Name"}</h3>
            </div>

            <div className="badge-meta-grid">
              <div className="badge-meta-item">
                <label>Phone</label>
                <span>{phone.trim() || "Not provided"}</span>
              </div>
              <div className="badge-meta-item">
                <label>Expires</label>
                <span>{new Date(expiresAt).toLocaleDateString()}</span>
              </div>
            </div>
          </div>

          {result && (
            <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--line)" }}>
              <div className="actions" style={{ flexDirection: "column", gap: 8 }}>
                {/* Main Prominent Primary Button */}
                <button type="button" onClick={downloadQr} style={{ width: "100%" }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  Download PNG Pass
                </button>
                <div style={{ display: "flex", gap: 8, width: "100%" }}>
                  <button className="secondary compact" type="button" onClick={printQr} style={{ flex: 1 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                    Print
                  </button>
                  <button className="secondary compact" type="button" onClick={copyToken} style={{ flex: 1 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                    Copy Token
                  </button>
                </div>
              </div>
              {actionMessage && <p className="notice" style={{ marginTop: 10, fontSize: "0.8rem" }}>{actionMessage}</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function VerifyQr({ token, onApiError }: { token: string; onApiError: (error: unknown, fallback: string) => string }) {
  const [qrToken, setQrToken] = useState("");
  const [result, setResult] = useState<VerifyQrResponse | null>(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sessionScans, setSessionScans] = useState<SessionScanItem[]>([]);

  async function submitToken(inputToken: string) {
    const tokenToVerify = inputToken.trim();

    if (!tokenToVerify) {
      setError("Signed token is required");
      return;
    }

    setError("");
    setResult(null);
    setSubmitting(true);

    try {
      const res = await verifyQr({ token: tokenToVerify }, token);
      setResult(res);

      // Track recent session scans
      const newItem: SessionScanItem = {
        id: Math.random().toString(36).slice(2, 9),
        time: new Date().toLocaleTimeString(),
        valid: res.valid,
        name: res.valid ? res.data.name : "Invalid Token",
        reason: !res.valid ? formatConstant(res.reason) : undefined
      };
      setSessionScans((prev) => [newItem, ...prev.slice(0, 4)]);
    } catch (err) {
      setError(onApiError(err, "Verification failed"));
    } finally {
      setSubmitting(false);
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    void submitToken(qrToken);
  }

  function handleScan(scannedToken: string) {
    setQrToken(scannedToken);
    void submitToken(scannedToken);
  }

  return (
    <div className="scan-center">
      <form className="panel form-panel scanner-panel" onSubmit={handleSubmit}>
        <div className="panel-heading">
          <div>
            <h2>HUD Camera Viewport</h2>
            <p className="muted" style={{ margin: "2px 0 0" }}>Position QR pass inside camera reticle</p>
          </div>
          <span className="panel-tag active">Scanning</span>
        </div>

        <Suspense fallback={<ScannerFallback />}>
          <QrScanner disabled={submitting} onScan={handleScan} />
        </Suspense>

        <details className="manual-token-panel">
          <summary>Manual Token Override</summary>
          <label>
            Signed Token String
            <textarea value={qrToken} onChange={(event) => setQrToken(event.target.value)} rows={4} placeholder="Paste raw token..." required />
          </label>
          <button disabled={submitting}>{submitting ? "Verifying..." : "Verify Manually"}</button>
        </details>

        {error && <p className="error">{error}</p>}
      </form>

      <div className="panel result-panel">
        <div className="panel-heading">
          <h2>Validation Inspection</h2>
          {result && <span className={`panel-tag ${result.valid ? "active" : "danger"}`}>{result.valid ? "VALID PASS" : "INVALID"}</span>}
        </div>

        {result ? (
          <VerificationResult result={result} />
        ) : (
          <div style={{ textAlign: "center", padding: "40px 20px" }}>
            <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5" style={{ opacity: 0.4 }}>
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            <p className="muted" style={{ marginTop: 12 }}>Scan a QR pass to inspect entry validity</p>
          </div>
        )}

        {/* Session Scans Feed */}
        {sessionScans.length > 0 && (
          <div style={{ marginTop: 24, paddingTop: 16, borderTop: "1px solid var(--line)" }}>
            <span className="eyebrow">Recent Door Scans</span>
            <div className="session-scan-feed">
              {sessionScans.map((scan) => (
                <div key={scan.id} className="session-scan-item">
                  <div className="session-scan-info">
                    <strong>{scan.name}</strong>
                    <span>{scan.time} {scan.reason ? `• ${scan.reason}` : ""}</span>
                  </div>
                  <span className={`status-badge ${scan.valid ? "active" : "revoked"}`}>
                    {scan.valid ? "PASS" : "FAIL"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ScannerFallback() {
  return (
    <div className="scanner">
      <div className="scanner-preview">
        <div className="scanner-frame" aria-hidden="true" />
        <div className="scanner-placeholder">Initializing camera hardware...</div>
      </div>
    </div>
  );
}

function VerificationResult({ result }: { result: VerifyQrResponse }) {
  if (!result.valid) {
    return (
      <div className="status failure">
        <div className="status-header">
          <span className="status-mark" aria-hidden="true">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          </span>
          <div>
            <strong>ACCESS DENIED</strong>
            <span>{formatConstant(result.reason)}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="status success">
      <div className="status-header">
        <span className="status-mark" aria-hidden="true">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 6L9 17l-5-5"/></svg>
        </span>
        <div>
          <strong>ENTRY APPROVED</strong>
          <span>Status: {formatConstant(result.status)}</span>
        </div>
      </div>
      <dl>
        <dt>Guest Name</dt>
        <dd style={{ fontSize: "1.1rem", fontWeight: 700 }}>{result.data.name}</dd>
        <dt>Phone Number</dt>
        <dd>{result.data.phone ?? "Not provided"}</dd>
      </dl>
    </div>
  );
}

function QrRecords({ token, onApiError }: { token: string; onApiError: (error: unknown, fallback: string) => string }) {
  const [records, setRecords] = useState<QrRecordSummary[]>([]);
  const [selected, setSelected] = useState<QrRecordSummary | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [revokingId, setRevokingId] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  async function load(cursor?: string) {
    setError("");
    setLoading(true);

    try {
      const response = await getQrRecords(token, cursor);
      setRecords((current) => (cursor ? [...current, ...response.records] : response.records));
      setNextCursor(response.nextCursor);

      if (!cursor) {
        setSelected(response.records[0] ?? null);
      }
    } catch (err) {
      setError(onApiError(err, "Could not load QR records"));
    } finally {
      setLoading(false);
    }
  }

  async function selectRecord(recordId: string) {
    setError("");
    setActionMessage("");

    try {
      const response = await getQrRecord(recordId, token);
      setSelected(response.record);
      setRecords((current) => current.map((record) => (record.id === recordId ? response.record : record)));
    } catch (err) {
      setError(onApiError(err, "Could not load QR record"));
    }
  }

  async function revoke(recordId: string) {
    setError("");
    setActionMessage("");
    setRevokingId(recordId);

    try {
      const response = await revokeQrRecord(recordId, token);
      setSelected(response.record);
      setRecords((current) => current.map((record) => (record.id === recordId ? response.record : record)));
      setActionMessage("Pass successfully revoked.");
    } catch (err) {
      setError(onApiError(err, "Could not revoke QR record"));
    } finally {
      setRevokingId("");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const filteredRecords = useMemo(() => {
    return records.filter((r) => {
      const matchesStatus = filterStatus === "ALL" || r.status === filterStatus;
      const matchesQuery =
        !searchQuery.trim() ||
        r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (r.phone && r.phone.toLowerCase().includes(searchQuery.toLowerCase())) ||
        r.id.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesStatus && matchesQuery;
    });
  }, [records, filterStatus, searchQuery]);

  return (
    <div className="records-console">
      <div className="panel table-panel">
        <div className="section-header">
          <div className="panel-heading">
            <h2>Pass Management Console</h2>
            <span className="panel-tag">{filteredRecords.length} Passes</span>
          </div>
          <button className="secondary compact" onClick={() => load()} disabled={loading}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
            Refresh Data
          </button>
        </div>

        <div className="records-toolbar">
          <div className="search-input-wrap">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by guest name, phone, or Pass ID..."
            />
          </div>

          <div className="filter-chips">
            {["ALL", "ACTIVE", "USED", "REVOKED", "EXPIRED"].map((status) => (
              <button
                key={status}
                type="button"
                className={`filter-chip ${filterStatus === status ? "active" : ""}`}
                onClick={() => setFilterStatus(status)}
              >
                {status}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="error">{error}</p>}

        {filteredRecords.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Guest Name</th>
                  <th>Status</th>
                  <th>Expiration Date</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecords.map((record) => (
                  <tr
                    key={record.id}
                    className={selected?.id === record.id ? "selected" : ""}
                    onClick={() => selectRecord(record.id)}
                  >
                    <td data-label="Name" style={{ fontWeight: 600, color: "var(--ink)" }}>{record.name}</td>
                    <td data-label="Status">
                      <StatusBadge status={record.status} />
                    </td>
                    <td data-label="Expires">{new Date(record.expiresAt).toLocaleString()}</td>
                    <td data-label="Action">
                      <button className="secondary compact" onClick={(e) => { e.stopPropagation(); selectRecord(record.id); }}>
                        Inspect
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted" style={{ padding: "20px 0" }}>{loading ? "Loading passes..." : "No matching passes found."}</p>
        )}

        {nextCursor && (
          <button className="secondary" onClick={() => load(nextCursor)} disabled={loading}>
            Load More Records
          </button>
        )}
      </div>

      {/* Record Inspector Drawer */}
      <div className="record-inspector">
        <div className="panel result-panel">
          <div className="panel-heading">
            <h2>Pass Inspector</h2>
            {selected && <StatusBadge status={selected.status} />}
          </div>

          {selected ? (
            <>
              <dl>
                <dt>Guest Name</dt>
                <dd style={{ fontSize: "1.1rem", fontWeight: 700 }}>{selected.name}</dd>
                <dt>Phone Contact</dt>
                <dd>{selected.phone ?? "Not provided"}</dd>
                <dt>Status Badge</dt>
                <dd>
                  <StatusBadge status={selected.status} />
                </dd>
                <dt>Issued By</dt>
                <dd>{selected.createdByUsername ?? selected.createdBy}</dd>
                <dt>Created Timestamp</dt>
                <dd>{new Date(selected.createdAt).toLocaleString()}</dd>
                <dt>Expires Timestamp</dt>
                <dd>{new Date(selected.expiresAt).toLocaleString()}</dd>
                <dt>Unique Pass ID</dt>
                <dd className="token-output">{selected.id}</dd>
              </dl>

              <div className="actions" style={{ marginTop: 20 }}>
                <button
                  className="danger"
                  type="button"
                  onClick={() => revoke(selected.id)}
                  disabled={selected.status !== "ACTIVE" || revokingId === selected.id}
                  style={{ width: "100%" }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                  {revokingId === selected.id ? "Revoking Pass..." : "Revoke Access Pass"}
                </button>
              </div>

              {actionMessage && <p className="notice" style={{ marginTop: 12 }}>{actionMessage}</p>}
            </>
          ) : (
            <p className="muted" style={{ padding: "40px 0", textAlign: "center" }}>Select a pass from the list to view telemetry</p>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: QrRecordSummary["status"] }) {
  return <span className={`status-badge ${status.toLowerCase()}`}>{status}</span>;
}

type AuditFilterState = {
  action: "" | AuditAction;
  result: "" | AuditResult;
  organizerUsername: string;
  qrCodeId: string;
};

const emptyAuditFilters: AuditFilterState = {
  action: "",
  result: "",
  organizerUsername: "",
  qrCodeId: ""
};

function AuditLogs({ token, onApiError }: { token: string; onApiError: (error: unknown, fallback: string) => string }) {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [filters, setFilters] = useState<AuditFilterState>(emptyAuditFilters);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const hasLogs = useMemo(() => logs.length > 0, [logs.length]);

  async function load(cursor?: number, filterState = filters) {
    setError("");
    setLoading(true);

    try {
      const response = await getAuditLogs(token, {
        limit: 50,
        cursor,
        action: filterState.action || undefined,
        result: filterState.result || undefined,
        organizerUsername: filterState.organizerUsername.trim() || undefined,
        qrCodeId: filterState.qrCodeId.trim() || undefined
      });
      setLogs((current) => (cursor ? [...current, ...response.logs] : response.logs));
      setNextCursor(response.nextCursor);
    } catch (err) {
      setError(onApiError(err, "Could not load audit logs"));
    } finally {
      setLoading(false);
    }
  }

  function updateFilter<K extends keyof AuditFilterState>(key: K, value: AuditFilterState[K]) {
    setFilters((current) => ({
      ...current,
      [key]: value
    }));
  }

  function applyFilters(event: FormEvent) {
    event.preventDefault();
    void load();
  }

  function clearFilters() {
    setFilters(emptyAuditFilters);
    void load(undefined, emptyAuditFilters);
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="panel table-panel">
      <div className="section-header">
        <div className="panel-heading">
          <div>
            <h2>Security Audit Stream</h2>
            <p className="muted" style={{ margin: "2px 0 0" }}>Immutable log of all authorization actions</p>
          </div>
          <span className="panel-tag">{logs.length} Events</span>
        </div>
        <button className="secondary compact" onClick={() => load()} disabled={loading}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
          Refresh Log
        </button>
      </div>

      <form className="filters" onSubmit={applyFilters}>
        <div className="filter-grid">
          <label>
            Action Type
            <select
              value={filters.action}
              onChange={(event) => updateFilter("action", event.target.value as AuditFilterState["action"])}
            >
              <option value="">All Actions</option>
              {auditActionValues.map((action) => (
                <option key={action} value={action}>
                  {action}
                </option>
              ))}
            </select>
          </label>

          <label>
            Audit Result
            <select
              value={filters.result}
              onChange={(event) => updateFilter("result", event.target.value as AuditFilterState["result"])}
            >
              <option value="">All Results</option>
              {auditResultValues.map((result) => (
                <option key={result} value={result}>
                  {result}
                </option>
              ))}
            </select>
          </label>

          <label>
            Organizer Username
            <input
              value={filters.organizerUsername}
              onChange={(event) => updateFilter("organizerUsername", event.target.value)}
              placeholder="e.g. admin"
            />
          </label>

          <label>
            Pass ID
            <input value={filters.qrCodeId} onChange={(event) => updateFilter("qrCodeId", event.target.value)} placeholder="Filter ID..." />
          </label>
        </div>

        <div className="actions">
          <button type="submit" disabled={loading}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
            Apply Filters
          </button>
          <button className="secondary" type="button" onClick={clearFilters} disabled={loading}>
            Reset Filters
          </button>
        </div>
      </form>

      {error && <p className="error">{error}</p>}

      {hasLogs ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Organizer</th>
                <th>Action</th>
                <th>Result</th>
                <th>Pass ID</th>
                <th>Metadata Detail</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id}>
                  <td data-label="Time">{new Date(log.createdAt).toLocaleString()}</td>
                  <td data-label="Organizer" style={{ fontWeight: 600, color: "var(--ink)" }}>{log.organizerUsername ?? "System"}</td>
                  <td data-label="Action">{formatConstant(log.action)}</td>
                  <td data-label="Result">
                    <span className={`status-badge ${log.result === "SUCCESS" ? "active" : "revoked"}`}>
                      {formatConstant(log.result)}
                    </span>
                  </td>
                  <td data-label="Pass ID">{log.qrCodeId ?? "-"}</td>
                  <td data-label="Detail">{auditLogDetail(log)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="muted" style={{ padding: "20px 0" }}>{loading ? "Loading audit trail..." : "No audit records matched."}</p>
      )}

      {nextCursor && (
        <button className="secondary" onClick={() => load(nextCursor)} disabled={loading}>
          Load Older Events
        </button>
      )}
    </div>
  );
}

function auditLogDetail(log: AuditLog) {
  if ("reason" in log.metadata && typeof log.metadata.reason === "string") {
    return formatConstant(log.metadata.reason);
  }

  if (
    "previousStatus" in log.metadata &&
    typeof log.metadata.previousStatus === "string" &&
    "nextStatus" in log.metadata &&
    typeof log.metadata.nextStatus === "string"
  ) {
    return `${log.metadata.previousStatus} -> ${log.metadata.nextStatus}`;
  }

  return "-";
}

function formatConstant(value: string) {
  return value
    .split("_")
    .map((part) => (part === "QR" ? "QR" : `${part.slice(0, 1)}${part.slice(1).toLowerCase()}`))
    .join(" ");
}

function safeDownloadName(value: string) {
  const cleaned = value
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "")
    .replace(/\s+/g, "-")
    .replace(/[.]+$/g, "")
    .slice(0, 80);

  return cleaned || "qr-pass";
}
