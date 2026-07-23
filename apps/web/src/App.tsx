import { FormEvent, useEffect, useMemo, useState } from "react";
import type { AuditLog, CreateQrResponse, VerifyQrResponse } from "@prom-event/shared";
import { createQr, getAuditLogs, login, verifyQr } from "./api";

type Tab = "generate" | "verify" | "logs";

function tomorrowLocalInputValue() {
  const date = new Date(Date.now() + 24 * 60 * 60 * 1000);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem("authToken") ?? "");
  const [activeTab, setActiveTab] = useState<Tab>("generate");

  useEffect(() => {
    if (token) {
      localStorage.setItem("authToken", token);
    } else {
      localStorage.removeItem("authToken");
    }
  }, [token]);

  if (!token) {
    return <LoginScreen onLogin={setToken} />;
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Organizer Console</p>
          <h1>Prom Event QR</h1>
        </div>
        <button className="secondary" onClick={() => setToken("")}>
          Sign out
        </button>
      </header>

      <nav className="tabs" aria-label="Main views">
        <button className={activeTab === "generate" ? "active" : ""} onClick={() => setActiveTab("generate")}>
          Generate
        </button>
        <button className={activeTab === "verify" ? "active" : ""} onClick={() => setActiveTab("verify")}>
          Verify
        </button>
        <button className={activeTab === "logs" ? "active" : ""} onClick={() => setActiveTab("logs")}>
          Audit Logs
        </button>
      </nav>

      {activeTab === "generate" && <GenerateQr token={token} />}
      {activeTab === "verify" && <VerifyQr token={token} />}
      {activeTab === "logs" && <AuditLogs token={token} />}
    </main>
  );
}

function LoginScreen({ onLogin }: { onLogin: (token: string) => void }) {
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
      <form className="panel login-panel" onSubmit={handleSubmit}>
        <div>
          <p className="eyebrow">Organizer Console</p>
          <h1>Sign in</h1>
        </div>

        <label>
          Username
          <input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" />
        </label>

        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
          />
        </label>

        {error && <p className="error">{error}</p>}

        <button disabled={submitting}>{submitting ? "Signing in..." : "Sign in"}</button>
      </form>
    </main>
  );
}

function GenerateQr({ token }: { token: string }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [expiresAt, setExpiresAt] = useState(tomorrowLocalInputValue);
  const [result, setResult] = useState<CreateQrResponse | null>(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setResult(null);
    setSubmitting(true);

    try {
      const isoExpiresAt = new Date(expiresAt).toISOString();
      const response = await createQr({ name, phone: phone || undefined, expiresAt: isoExpiresAt }, token);
      setResult(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "QR generation failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="content-grid">
      <form className="panel" onSubmit={handleSubmit}>
        <h2>Generate QR</h2>
        <label>
          Name
          <input value={name} onChange={(event) => setName(event.target.value)} required />
        </label>
        <label>
          Phone
          <input value={phone} onChange={(event) => setPhone(event.target.value)} />
        </label>
        <label>
          Expires at
          <input
            type="datetime-local"
            value={expiresAt}
            onChange={(event) => setExpiresAt(event.target.value)}
            required
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button disabled={submitting}>{submitting ? "Generating..." : "Generate QR"}</button>
      </form>

      <div className="panel result-panel">
        <h2>Result</h2>
        {result ? (
          <>
            <img className="qr-image" src={result.qrImage} alt="Generated QR code" />
            <dl>
              <dt>QR ID</dt>
              <dd>{result.qrId}</dd>
              <dt>Signed token</dt>
              <dd className="token-output">{result.qrToken}</dd>
            </dl>
          </>
        ) : (
          <p className="muted">Generated QR codes appear here.</p>
        )}
      </div>
    </section>
  );
}

function VerifyQr({ token }: { token: string }) {
  const [qrToken, setQrToken] = useState("");
  const [result, setResult] = useState<VerifyQrResponse | null>(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setResult(null);
    setSubmitting(true);

    try {
      setResult(await verifyQr({ token: qrToken }, token));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="content-grid">
      <form className="panel" onSubmit={handleSubmit}>
        <h2>Verify QR</h2>
        <label>
          Signed token
          <textarea value={qrToken} onChange={(event) => setQrToken(event.target.value)} rows={8} required />
        </label>
        {error && <p className="error">{error}</p>}
        <button disabled={submitting}>{submitting ? "Verifying..." : "Verify"}</button>
      </form>

      <div className="panel result-panel">
        <h2>Verification Result</h2>
        {result ? <VerificationResult result={result} /> : <p className="muted">Verification results appear here.</p>}
      </div>
    </section>
  );
}

function VerificationResult({ result }: { result: VerifyQrResponse }) {
  if (!result.valid) {
    return (
      <div className="status failure">
        <strong>Invalid</strong>
        <span>{result.reason}</span>
      </div>
    );
  }

  return (
    <div className="status success">
      <strong>Valid</strong>
      <span>{result.status}</span>
      <dl>
        <dt>Name</dt>
        <dd>{result.data.name}</dd>
        <dt>Phone</dt>
        <dd>{result.data.phone ?? "Not provided"}</dd>
      </dl>
    </div>
  );
}

function AuditLogs({ token }: { token: string }) {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const hasLogs = useMemo(() => logs.length > 0, [logs.length]);

  async function load(cursor?: number) {
    setError("");
    setLoading(true);

    try {
      const response = await getAuditLogs(token, cursor);
      setLogs((current) => (cursor ? [...current, ...response.logs] : response.logs));
      setNextCursor(response.nextCursor);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load audit logs");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <section className="panel table-panel">
      <div className="section-header">
        <h2>Audit Logs</h2>
        <button className="secondary" onClick={() => load()} disabled={loading}>
          Refresh
        </button>
      </div>

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
                <th>QR</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id}>
                  <td>{new Date(log.createdAt).toLocaleString()}</td>
                  <td>{log.organizerUsername ?? "Unknown"}</td>
                  <td>{log.action}</td>
                  <td>{log.result}</td>
                  <td>{log.qrCodeId ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="muted">{loading ? "Loading audit logs..." : "No audit logs yet."}</p>
      )}

      {nextCursor && (
        <button className="secondary" onClick={() => load(nextCursor)} disabled={loading}>
          Load more
        </button>
      )}
    </section>
  );
}

