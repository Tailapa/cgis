import { api } from "./api";
import type { Grievance } from "./types";

let allGrievances: Grievance[] = [];
let selectedId: string | null = null;
let selectedIdx = -1;
let searchTimer: ReturnType<typeof setTimeout> | null = null;

async function init() {
  try {
    await api.adminCheck();
    showDashboard();
  } catch {
    showLogin();
  }
}

// ── Login ─────────────────────────────────────────────────────────────────────

function showLogin() {
  document.getElementById("login-screen")?.classList.remove("hidden");
  document.getElementById("admin-dashboard")?.classList.add("hidden");

  const form = document.getElementById("login-form") as HTMLFormElement;
  const errorEl = document.getElementById("login-error");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const pw = (document.getElementById("admin-password") as HTMLInputElement).value;
    if (errorEl) errorEl.textContent = "";
    try {
      await api.adminLogin(pw);
      showDashboard();
    } catch {
      if (errorEl) errorEl.textContent = "Invalid password. Try again.";
    }
  });
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

async function showDashboard() {
  document.getElementById("login-screen")?.classList.add("hidden");
  document.getElementById("admin-dashboard")?.classList.remove("hidden");

  // Show logout button only after successful login
  const logoutBtn = document.getElementById("logout-btn") as HTMLElement | null;
  if (logoutBtn) logoutBtn.style.display = "flex";

  logoutBtn?.addEventListener("click", async () => {
    await api.adminLogout();
    location.reload();
  });

  // Mobile back button — returns from detail to sidebar
  document.getElementById("back-btn")?.addEventListener("click", () => {
    document.getElementById("detail-panel")?.classList.add("hidden");
    document.getElementById("detail-empty")?.classList.remove("hidden");
    document.getElementById("admin-sidebar")?.classList.remove("mobile-hidden");
    selectedId = null;
    document.querySelectorAll(".sidebar-item").forEach(el => el.classList.remove("active"));
  });

  await loadGrievances();
  setupSearch();
  setupKeyNav();
}

async function loadGrievances(filters: { search?: string; status?: string } = {}) {
  try {
    const result = await api.listGrievances({
      search: filters.search ?? undefined,
      status: filters.status ?? undefined,
      page_size: 100,
      sort_desc: true,
    });
    allGrievances = result.data;
    renderSidebar(result.data);
    updateStats(result.data);
  } catch (err) {
    console.error("Failed to load grievances:", err);
  }
}

function updateStats(data: Grievance[]) {
  const total = data.length;
  const open = data.filter(g => g.status === "open").length;
  const review = data.filter(g => g.status === "under_review").length;
  const today = new Date().toISOString().slice(0, 10);
  const resolvedToday = data.filter(g => g.status === "resolved" && g.submitted_at?.startsWith(today)).length;

  setEl("stat-total", String(total));
  setEl("stat-open", String(open));
  setEl("stat-review", String(review));
  setEl("stat-resolved-today", String(resolvedToday));
}

function renderSidebar(data: Grievance[]) {
  const list = document.getElementById("admin-sidebar-list");
  if (!list) return;
  list.innerHTML = "";

  for (let i = 0; i < data.length; i++) {
    const g = data[i];
    const item = document.createElement("div");
    item.className = "sidebar-item" + (g.grievance_id === selectedId ? " active" : "");
    item.dataset.id = g.grievance_id;
    item.dataset.idx = String(i);

    const dot = document.createElement("span");
    dot.className = `status-dot dot-${statusClass(g.status)}`;
    item.appendChild(dot);

    const content = document.createElement("div");
    content.className = "sidebar-item-content";
    content.innerHTML = `
      <span class="sidebar-name">${g.username ?? "Anonymous"}</span>
      <span class="sidebar-meta">${g.district ?? ""} · ${g.govt_department ?? ""}</span>
      <span class="sidebar-time">${formatRelative(g.submitted_at)}</span>
    `;
    item.appendChild(content);

    item.addEventListener("click", () => {
      selectedIdx = i;
      selectGrievance(g);
    });

    list.appendChild(item);
  }
}

function selectGrievance(g: Grievance) {
  selectedId = g.grievance_id;
  document.querySelectorAll(".sidebar-item").forEach(el => el.classList.remove("active"));
  document.querySelector(`.sidebar-item[data-id="${g.grievance_id}"]`)?.classList.add("active");
  renderDetail(g);
  // Mobile: hide sidebar, show detail panel
  if (window.innerWidth <= 768) {
    document.getElementById("admin-sidebar")?.classList.add("mobile-hidden");
  }
}

function renderDetail(g: Grievance) {
  const panel = document.getElementById("detail-panel");
  if (!panel) return;
  document.getElementById("detail-empty")?.classList.add("hidden");
  panel.classList.remove("hidden");

  setEl("detail-name", g.username ?? "—");
  setEl("detail-id", g.grievance_id);
  setEl("detail-age", g.age !== null ? String(g.age) : "—");
  setEl("detail-gender", g.gender ?? "—");
  setEl("detail-pin", g.pin_code ?? "—");
  setEl("detail-district", g.district ?? "—");
  setEl("detail-state", g.state ?? "—");
  setEl("detail-dept", g.govt_department ?? "—");
  setEl("detail-summary", g.problem_summary);
  setEl("detail-proof", g.proof_reference ?? "—");
  setEl("detail-submitted", new Date(g.submitted_at).toLocaleString("en-IN"));

  const origEl = document.getElementById("detail-original");
  if (origEl) origEl.textContent = g.original_text;

  const statusSel = document.getElementById("detail-status") as HTMLSelectElement | null;
  if (statusSel) statusSel.value = g.status;

  const notesEl = document.getElementById("detail-notes") as HTMLTextAreaElement | null;
  if (notesEl) notesEl.value = g.internal_notes ?? "";

  const saveBtn = document.getElementById("save-btn");
  saveBtn?.replaceWith(saveBtn.cloneNode(true));
  document.getElementById("save-btn")?.addEventListener("click", async () => {
    try {
      const updates: { status?: string; internal_notes?: string } = {};
      if (statusSel) updates.status = statusSel.value;
      if (notesEl) updates.internal_notes = notesEl.value;
      await api.adminUpdateGrievance(g.grievance_id, updates);
      const idx = allGrievances.findIndex(x => x.grievance_id === g.grievance_id);
      if (idx >= 0) {
        allGrievances[idx] = { ...allGrievances[idx], ...updates } as Grievance;
      }
      renderSidebar(allGrievances);
      showToast("Saved successfully");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Save failed";
      showToast(msg, true);
    }
  });

  const deleteBtn = document.getElementById("delete-btn");
  deleteBtn?.replaceWith(deleteBtn.cloneNode(true));
  document.getElementById("delete-btn")?.addEventListener("click", () => {
    showDeleteConfirm(g.grievance_id);
  });
}

function showDeleteConfirm(id: string) {
  const overlay = document.getElementById("delete-modal");
  overlay?.classList.remove("hidden");

  const confirmBtn = document.getElementById("delete-confirm-btn");
  const cancelBtn = document.getElementById("delete-cancel-btn");

  const fresh = confirmBtn?.cloneNode(true) as HTMLButtonElement;
  confirmBtn?.replaceWith(fresh);
  fresh?.addEventListener("click", async () => {
    try {
      await api.adminDeleteGrievance(id);
      allGrievances = allGrievances.filter(g => g.grievance_id !== id);
      renderSidebar(allGrievances);
      document.getElementById("detail-panel")?.classList.add("hidden");
      overlay?.classList.add("hidden");
      showToast("Grievance deleted");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Delete failed";
      showToast(msg, true);
    }
  });

  cancelBtn?.addEventListener("click", () => overlay?.classList.add("hidden"));
}

function setupSearch() {
  const searchInput = document.getElementById("admin-search") as HTMLInputElement | null;
  const statusFilter = document.getElementById("admin-status-filter") as HTMLSelectElement | null;

  searchInput?.addEventListener("input", () => {
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      loadGrievances({ search: searchInput.value, status: statusFilter?.value });
    }, 300);
  });

  statusFilter?.addEventListener("change", () => {
    loadGrievances({ search: searchInput?.value, status: statusFilter.value });
  });
}

function setupKeyNav() {
  document.addEventListener("keydown", (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const delta = e.key === "ArrowDown" ? 1 : -1;
      const next = Math.max(0, Math.min(allGrievances.length - 1, selectedIdx + delta));
      if (next !== selectedIdx && allGrievances[next]) {
        selectedIdx = next;
        selectGrievance(allGrievances[next]);
        document.querySelector(`.sidebar-item[data-idx="${next}"]`)?.scrollIntoView({ block: "nearest" });
      }
    } else if (e.key === "Enter" && selectedIdx >= 0) {
      const g = allGrievances[selectedIdx];
      if (g) selectGrievance(g);
    }
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function setEl(id: string, text: string) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function statusClass(s: string): string {
  if (s === "under_review") return "review";
  return s;
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function showToast(msg: string, isError = false) {
  const toast = document.createElement("div");
  toast.style.cssText = `position:fixed;bottom:80px;right:24px;z-index:500;padding:10px 16px;border-radius:6px;font-size:13px;font-family:var(--font-mono);background:${isError ? "rgba(196,64,64,0.9)" : "rgba(74,158,92,0.9)"};color:#fff;box-shadow:0 4px 20px rgba(0,0,0,0.5)`;
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

document.addEventListener("DOMContentLoaded", init);
