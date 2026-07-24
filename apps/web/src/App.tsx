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

const QrScanner = lazy(() => import("./QrScanner").then((module) => ({ default: module.QrScanner })));

const tabs: Array<{ id: Tab; label: string }> = [
  { id: "generate", label: "Generate" },
  { id: "verify", label: "Verify" },
  { id: "records", label: "Records" },
  { id: "logs", label: "Audit" }
];

const QR_MAX_TTL_DAYS = Number(import.meta.env.VITE_QR_MAX_TTL_DAYS ?? 30);
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function datetimeLocalInputValue(date: Date) {
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

function tomorrowLocalInputValue() {
  return datetimeLocalInputValue(new Date(Date.now() + MS_PER_DAY));
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
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true">
            QR
          </div>
          <div>
            <p className="eyebrow">Organizer Console</p>
            <h1>EventSeal</h1>
          </div>
        </div>
        <div className="topbar-actions">
          <span className="session-pill">Signed in</span>
          <button className="secondary" onClick={handleSignOut}>
            Sign out
          </button>
        </div>
      </header>

      <nav className="tabs" aria-label="Main views">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={activeTab === tab.id ? "active" : ""}
            aria-current={activeTab === tab.id ? "page" : undefined}
            onClick={() => selectTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {activeTab === "generate" && <GenerateQr token={token} onApiError={handleApiError} />}
      {activeTab === "verify" && <VerifyQr token={token} onApiError={handleApiError} />}
      {activeTab === "records" && <QrRecords token={token} onApiError={handleApiError} />}
      {activeTab === "logs" && <AuditLogs token={token} onApiError={handleApiError} />}
    </main>
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
      <form className="panel login-panel" onSubmit={handleSubmit}>
        <div className="login-brand">
          <div className="brand-mark large" aria-hidden="true">
            QR
          </div>
          <div>
            <p className="eyebrow">Organizer Console</p>
            <h1>Sign in</h1>
          </div>
        </div>

        {notice && <p className="notice">{notice}</p>}

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

function GenerateQr({ token, onApiError }: { token: string; onApiError: (error: unknown, fallback: string) => string }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [expiresAt, setExpiresAt] = useState(tomorrowLocalInputValue);
  const [result, setResult] = useState<CreateQrResponse | null>(null);
  const [error, setError] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const maxExpiresAt = useMemo(maxExpirationLocalInputValue, []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setActionMessage("");
    setResult(null);

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
    } catch (err) {
      setError(onApiError(err, "QR generation failed"));
    } finally {
      setSubmitting(false);
    }
  }

  async function copyToken() {
    if (!result) {
      return;
    }

    try {
      await navigator.clipboard.writeText(result.qrToken);
      setActionMessage("Token copied.");
    } catch {
      setActionMessage("Copy failed. Select the token manually.");
    }
  }

  function downloadQr() {
    if (!result) {
      return;
    }

    const link = document.createElement("a");
    link.href = result.qrImage;
    link.download = `qr-${result.qrId}.png`;
    link.click();
    setActionMessage("QR image download started.");
  }

  function printQr() {
    if (!result) {
      return;
    }

    window.print();
    setActionMessage("Print dialog opened.");
  }

  return (
    <section className="content-grid generate-grid">
      <form className="panel form-panel" onSubmit={handleSubmit}>
        <div className="panel-heading">
          <h2>Generate QR</h2>
          <span className="panel-tag">Create</span>
        </div>
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
            max={maxExpiresAt}
            onChange={(event) => setExpiresAt(event.target.value)}
            required
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button disabled={submitting}>{submitting ? "Generating..." : "Generate QR"}</button>
      </form>

      <div className="panel result-panel qr-output-panel">
        <div className="panel-heading">
          <h2>QR Output</h2>
          {result && <span className="panel-tag active">Ready</span>}
        </div>
        {result ? (
          <>
            <div className="qr-stage">
              <img className="qr-image" src={result.qrImage} alt="Generated QR code" />
            </div>
            <div className="actions">
              <button className="secondary" type="button" onClick={downloadQr}>
                Download PNG
              </button>
              <button className="secondary" type="button" onClick={printQr}>
                Print
              </button>
              <button className="secondary" type="button" onClick={copyToken}>
                Copy token
              </button>
            </div>
            {actionMessage && <p className="notice">{actionMessage}</p>}
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

function VerifyQr({ token, onApiError }: { token: string; onApiError: (error: unknown, fallback: string) => string }) {
  const [qrToken, setQrToken] = useState("");
  const [result, setResult] = useState<VerifyQrResponse | null>(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

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
      setResult(await verifyQr({ token: tokenToVerify }, token));
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
    <section className="content-grid verify-grid">
      <form className="panel form-panel scanner-panel" onSubmit={handleSubmit}>
        <div className="panel-heading">
          <h2>Verify QR</h2>
          <span className="panel-tag">Camera</span>
        </div>
        <Suspense fallback={<ScannerFallback />}>
          <QrScanner disabled={submitting} onScan={handleScan} />
        </Suspense>

        <details className="manual-token-panel">
          <summary>Manual token</summary>
          <label>
            Signed token
            <textarea value={qrToken} onChange={(event) => setQrToken(event.target.value)} rows={5} required />
          </label>
          <button disabled={submitting}>{submitting ? "Verifying..." : "Verify manually"}</button>
        </details>
        {error && <p className="error">{error}</p>}
      </form>

      <div className="panel result-panel verification-panel">
        <div className="panel-heading">
          <h2>Verification Result</h2>
          {result && <span className={`panel-tag ${result.valid ? "active" : "danger"}`}>{result.valid ? "Valid" : "Check"}</span>}
        </div>
        {result ? <VerificationResult result={result} /> : <p className="muted">Verification results appear here.</p>}
      </div>
    </section>
  );
}

function ScannerFallback() {
  return (
    <div className="scanner">
      <div className="scanner-preview">
        <div className="scanner-frame" aria-hidden="true" />
        <div className="scanner-placeholder">Camera loading</div>
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
            !
          </span>
          <div>
            <strong>Invalid QR</strong>
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
            OK
          </span>
          <div>
            <strong>Valid entry</strong>
          <span>{formatConstant(result.status)}</span>
        </div>
      </div>
      <dl>
        <dt>Name</dt>
        <dd>{result.data.name}</dd>
        <dt>Phone</dt>
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
      setActionMessage("QR revoked.");
    } catch (err) {
      setError(onApiError(err, "Could not revoke QR record"));
    } finally {
      setRevokingId("");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <section className="content-grid records-grid">
      <div className="panel table-panel">
        <div className="section-header">
          <div className="panel-heading">
            <h2>QR Records</h2>
            <span className="panel-tag">{records.length}</span>
          </div>
          <button className="secondary" onClick={() => load()} disabled={loading}>
            Refresh
          </button>
        </div>

        {error && <p className="error">{error}</p>}

        {records.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Status</th>
                  <th>Expires</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {records.map((record) => (
                  <tr key={record.id}>
                    <td data-label="Name">{record.name}</td>
                    <td data-label="Status">
                      <StatusBadge status={record.status} />
                    </td>
                    <td data-label="Expires">{new Date(record.expiresAt).toLocaleString()}</td>
                    <td data-label="Action">
                      <button className="secondary compact" onClick={() => selectRecord(record.id)}>
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">{loading ? "Loading QR records..." : "No QR records yet."}</p>
        )}

        {nextCursor && (
          <button className="secondary" onClick={() => load(nextCursor)} disabled={loading}>
            Load more
          </button>
        )}
      </div>

      <div className="panel result-panel">
        <div className="panel-heading">
          <h2>Record Detail</h2>
          {selected && <StatusBadge status={selected.status} />}
        </div>
        {selected ? (
          <>
            <dl>
              <dt>Name</dt>
              <dd>{selected.name}</dd>
              <dt>Phone</dt>
              <dd>{selected.phone ?? "Not provided"}</dd>
              <dt>Status</dt>
              <dd>
                <StatusBadge status={selected.status} />
              </dd>
              <dt>Created by</dt>
              <dd>{selected.createdByUsername ?? selected.createdBy}</dd>
              <dt>Created</dt>
              <dd>{new Date(selected.createdAt).toLocaleString()}</dd>
              <dt>Expires</dt>
              <dd>{new Date(selected.expiresAt).toLocaleString()}</dd>
              <dt>QR ID</dt>
              <dd>{selected.id}</dd>
            </dl>

            <div className="actions">
              <button
                className="danger"
                type="button"
                onClick={() => revoke(selected.id)}
                disabled={selected.status !== "ACTIVE" || revokingId === selected.id}
              >
                {revokingId === selected.id ? "Revoking..." : "Revoke"}
              </button>
            </div>
            {actionMessage && <p className="notice">{actionMessage}</p>}
          </>
        ) : (
          <p className="muted">Select a QR record.</p>
        )}
      </div>
    </section>
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
    <section className="panel table-panel">
      <div className="section-header">
        <div className="panel-heading">
          <h2>Audit Logs</h2>
          <span className="panel-tag">{logs.length}</span>
        </div>
        <button className="secondary" onClick={() => load()} disabled={loading}>
          Refresh
        </button>
      </div>

      <form className="filters" onSubmit={applyFilters}>
        <div className="filter-grid">
          <label>
            Action
            <select
              value={filters.action}
              onChange={(event) => updateFilter("action", event.target.value as AuditFilterState["action"])}
            >
              <option value="">All actions</option>
              {auditActionValues.map((action) => (
                <option key={action} value={action}>
                  {action}
                </option>
              ))}
            </select>
          </label>

          <label>
            Result
            <select
              value={filters.result}
              onChange={(event) => updateFilter("result", event.target.value as AuditFilterState["result"])}
            >
              <option value="">All results</option>
              {auditResultValues.map((result) => (
                <option key={result} value={result}>
                  {result}
                </option>
              ))}
            </select>
          </label>

          <label>
            Organizer username
            <input
              value={filters.organizerUsername}
              onChange={(event) => updateFilter("organizerUsername", event.target.value)}
            />
          </label>

          <label>
            QR ID
            <input value={filters.qrCodeId} onChange={(event) => updateFilter("qrCodeId", event.target.value)} />
          </label>
        </div>

        <div className="actions">
          <button type="submit" disabled={loading}>
            Apply filters
          </button>
          <button className="secondary" type="button" onClick={clearFilters} disabled={loading}>
            Clear
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
                <th>QR</th>
                <th>Detail</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id}>
                  <td data-label="Time">{new Date(log.createdAt).toLocaleString()}</td>
                  <td data-label="Organizer">{log.organizerUsername ?? "Unknown"}</td>
                  <td data-label="Action">{formatConstant(log.action)}</td>
                  <td data-label="Result">{formatConstant(log.result)}</td>
                  <td data-label="QR">{log.qrCodeId ?? "-"}</td>
                  <td data-label="Detail">{auditLogDetail(log)}</td>
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
