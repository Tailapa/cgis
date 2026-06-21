export interface Grievance {
  grievance_id: string;
  username: string | null;
  age: number | null;
  gender: "male" | "female" | "other" | null;
  pin_code: string | null;
  district: string | null;
  state: string | null;
  govt_department: string | null;
  problem_summary: string;
  proof_reference: string | null;
  original_text: string;
  internal_notes: string | null;
  submitted_at: string;
  status: "open" | "under_review" | "resolved" | "rejected";
}

export interface DashboardStats {
  kpis: {
    total: number;
    open: number;
    resolved: number;
    this_week: number;
    departments_count: number;
    trend_total: number;
    trend_open: number;
  };
  status_breakdown: { status: string; count: number }[];
  by_state: { state: string; count: number; open: number; resolved: number }[];
  by_department: { dept: string; count: number }[];
  submissions_over_time: { date: string; count: number }[];
  gender_breakdown: { gender: string; count: number }[];
  age_distribution: { bin: string; count: number }[];
}

export interface ChatResponse {
  answer: string;
  sql: string;
  row_count: number;
  session_id: string;
}

export interface GrievanceListResponse {
  data: Grievance[];
  total: number;
  page: number;
  page_size: number;
}

export interface ChatMessage {
  id?: number;
  session_id: string;
  role: "user" | "assistant";
  content: string;
  sql_query?: string | null;
  created_at?: string;
}

export interface ChatSession {
  session_id: string;
  created_at: string;
  last_active: string;
}

export interface DashboardFilters {
  state: string | null;
  department: string | null;
  status: string | null;
}
