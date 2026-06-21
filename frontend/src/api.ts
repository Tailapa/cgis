import type {
  ChatMessage,
  ChatResponse,
  ChatSession,
  DashboardStats,
  Grievance,
  GrievanceListResponse,
} from "./types";

const API_BASE = "/api";

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(path, {
    credentials: "include",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers as Record<string, string> | undefined),
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(body.detail ?? `HTTP ${res.status}`);
  }

  return res.json();
}

export const api = {
  submitGrievance(text: string): Promise<Grievance> {
    return request(`${API_BASE}/grievances/submit`, {
      method: "POST",
      body: JSON.stringify({ text }),
    });
  },

  getDashboardStats(): Promise<DashboardStats> {
    return request(`${API_BASE}/dashboard/stats`);
  },

  listGrievances(params: {
    state?: string | null;
    department?: string | null;
    status?: string | null;
    search?: string | null;
    page?: number;
    page_size?: number;
    sort_by?: string;
    sort_desc?: boolean;
  } = {}): Promise<GrievanceListResponse> {
    const qs = new URLSearchParams();
    if (params.state) qs.set("state", params.state);
    if (params.department) qs.set("department", params.department);
    if (params.status) qs.set("status", params.status);
    if (params.search) qs.set("search", params.search);
    if (params.page) qs.set("page", String(params.page));
    if (params.page_size) qs.set("page_size", String(params.page_size));
    if (params.sort_by) qs.set("sort_by", params.sort_by);
    if (params.sort_desc !== undefined) qs.set("sort_desc", String(params.sort_desc));
    return request(`${API_BASE}/grievances/?${qs}`);
  },

  getGrievance(id: string): Promise<Grievance> {
    return request(`${API_BASE}/grievances/${id}`);
  },

  sendChatMessage(question: string, sessionId: string | null): Promise<ChatResponse> {
    return request(`${API_BASE}/chat/message`, {
      method: "POST",
      body: JSON.stringify({ question, session_id: sessionId }),
    });
  },

  createChatSession(): Promise<{ session_id: string }> {
    return request(`${API_BASE}/chat/session`, { method: "POST" });
  },

  getChatSession(sessionId: string): Promise<{ session_id: string; messages: ChatMessage[] }> {
    return request(`${API_BASE}/chat/session/${sessionId}`);
  },

  listChatSessions(): Promise<ChatSession[]> {
    return request(`${API_BASE}/chat/sessions`);
  },

  // Admin routes
  adminLogin(password: string): Promise<{ status: string }> {
    return request("/admin/login", {
      method: "POST",
      body: JSON.stringify({ password }),
    });
  },

  adminLogout(): Promise<{ status: string }> {
    return request("/admin/logout", { method: "POST" });
  },

  adminCheck(): Promise<{ authenticated: boolean }> {
    return request("/admin/check");
  },

  adminUpdateGrievance(
    id: string,
    updates: { status?: string; internal_notes?: string }
  ): Promise<Grievance> {
    return request(`${API_BASE}/grievances/${id}`, {
      method: "PATCH",
      body: JSON.stringify(updates),
    });
  },

  adminDeleteGrievance(id: string): Promise<{ deleted: string }> {
    return request(`${API_BASE}/grievances/${id}`, { method: "DELETE" });
  },
};
