import type {
  AuditLogFilters,
  AuditLogsResponse,
  CreateQrRequest,
  CreateQrResponse,
  ListQrRecordsResponse,
  LoginRequest,
  LoginResponse,
  QrRecordDetailResponse,
  RevokeQrResponse,
  VerifyQrRequest,
  VerifyQrResponse
} from "@prom-event/shared";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

export type GetAuditLogsOptions = Partial<
  Pick<AuditLogFilters, "limit" | "cursor" | "action" | "result" | "organizerId" | "organizerUsername" | "qrCodeId">
>;

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly payload: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

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

export async function getQrRecords(token: string, cursor?: string): Promise<ListQrRecordsResponse> {
  const search = new URLSearchParams({ limit: "50" });
  if (cursor) {
    search.set("cursor", cursor);
  }

  return request(`/qr?${search}`, { method: "GET" }, token);
}

export async function getQrRecord(id: string, token: string): Promise<QrRecordDetailResponse> {
  return request(`/qr/${id}`, { method: "GET" }, token);
}

export async function revokeQrRecord(id: string, token: string): Promise<RevokeQrResponse> {
  return request(`/qr/${id}/revoke`, { method: "POST" }, token);
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

export async function getAuditLogs(token: string, filters: GetAuditLogsOptions = {}): Promise<AuditLogsResponse> {
  const search = new URLSearchParams({ limit: String(filters.limit ?? 50) });

  if (filters.cursor) {
    search.set("cursor", String(filters.cursor));
  }

  const stringFilters = {
    action: filters.action,
    result: filters.result,
    organizerId: filters.organizerId,
    organizerUsername: filters.organizerUsername,
    qrCodeId: filters.qrCodeId
  };

  for (const [key, value] of Object.entries(stringFilters)) {
    const trimmedValue = value?.trim();
    if (trimmedValue) {
      search.set(key, trimmedValue);
    }
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

    throw new ApiError(message, response.status, payload);
  }

  return payload as T;
}
