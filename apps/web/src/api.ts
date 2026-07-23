import type {
  AuditLogsResponse,
  CreateQrRequest,
  CreateQrResponse,
  LoginRequest,
  LoginResponse,
  VerifyQrRequest,
  VerifyQrResponse
} from "@prom-event/shared";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

export async function login(input: LoginRequest): Promise<LoginResponse> {
  return request("/login", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function createQr(input: CreateQrRequest, token: string): Promise<CreateQrResponse> {
  return request(
    "/qr",
    {
      method: "POST",
      body: JSON.stringify(input)
    },
    token
  );
}

export async function verifyQr(input: VerifyQrRequest, token: string): Promise<VerifyQrResponse> {
  return request(
    "/qr/verify",
    {
      method: "POST",
      body: JSON.stringify(input)
    },
    token
  );
}

export async function getAuditLogs(token: string, cursor?: number): Promise<AuditLogsResponse> {
  const search = new URLSearchParams({ limit: "50" });
  if (cursor) {
    search.set("cursor", String(cursor));
  }

  return request(`/logs?${search}`, { method: "GET" }, token);
}

async function request<T>(path: string, init: RequestInit, token?: string): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers
    }
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message =
      typeof payload === "object" &&
      payload !== null &&
      "message" in payload &&
      typeof payload.message === "string"
        ? payload.message
        : "Request failed";

    throw new Error(message);
  }

  return payload as T;
}

