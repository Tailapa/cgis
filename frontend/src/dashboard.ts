import {
  Chart,
  ArcElement,
  BarElement,
  BarController,
  CategoryScale,
  DoughnutController,
  Filler,
  Legend,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
  type ActiveElement,
  type ChartEvent,
} from "chart.js";

import { api } from "./api";
import { initBubble } from "./bubble";
import type { DashboardFilters, DashboardStats, Grievance } from "./types";

Chart.register(
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  DoughnutController,
  Filler,
  Legend,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip
);

// Light palette: dark sage primary, warm gold secondary, sage mid, red error
const CHART_COLORS = ["#4a6b5e", "#c8a96e", "#8fa89a", "#c44040", "#7c9e7a", "#5a7c9e"];

// Shared axis tick config — JetBrains Mono, muted sage
const TICK_OPTS = {
  color: "#7a8a7e",
  font: { family: "JetBrains Mono", size: 10 },
  padding: 8,
};

const DARK_OPTS = {
  plugins: {
    legend: {
      labels: {
        color: "#7a8a7e",
        font: { family: "JetBrains Mono", size: 10 },
        padding: 14,
        boxWidth: 8,
        boxHeight: 8,
        usePointStyle: true,
      },
    },
    // Light mode tooltip — white card, sage border
    tooltip: {
      backgroundColor: "rgba(255, 255, 255, 0.98)",
      borderColor: "rgba(74, 107, 94, 0.28)",
      borderWidth: 1,
      titleColor: "#4a6b5e",
      bodyColor: "#4a5548",
      footerColor: "#7a8a7e",
      titleFont: { family: "JetBrains Mono", size: 11, weight: "500" as const },
      bodyFont:  { family: "JetBrains Mono", size: 11 },
      padding: 12,
      cornerRadius: 4,
      caretSize: 5,
      displayColors: true,
      boxWidth: 8,
      boxHeight: 8,
    },
  },
  scales: {
    x: {
      grid: { color: "rgba(74, 107, 94, 0.08)", drawTicks: false },
      border: { display: false },
      ticks: TICK_OPTS,
    },
    y: {
      grid: { color: "rgba(74, 107, 94, 0.08)", drawTicks: false },
      border: { display: false },
      ticks: TICK_OPTS,
    },
  },
  responsive: true,
  maintainAspectRatio: false,
};

let filters: DashboardFilters = { state: null, department: null, status: null };
let currentPage = 1;
let sortBy = "submitted_at";
let sortDesc = true;
const PAGE_SIZE = 20;

let chartInstances: Record<string, Chart> = {};

// ── Init ─────────────────────────────────────────────────────────────────────

async function init() {
  initBubble();
  initSubmitModal();
  await loadStats();
  await loadTable(1);
  setupTableControls();
  setInterval(refreshStats, 60_000);
}

// ── Stats & Charts ────────────────────────────────────────────────────────────

async function loadStats() {
  try {
    const stats = await api.getDashboardStats();
    renderKPIs(stats);
    renderCharts(stats);
    populateFilterDropdowns(stats);
  } catch (err) {
    console.error("Failed to load stats:", err);
  }
}

function populateFilterDropdowns(stats: DashboardStats) {
  const stateSelect = document.getElementById("filter-state") as HTMLSelectElement | null;
  const deptSelect = document.getElementById("filter-dept") as HTMLSelectElement | null;

  if (stateSelect && stateSelect.options.length <= 1) {
    for (const s of stats.by_state) {
      const opt = document.createElement("option");
      opt.value = s.state ?? "";
      opt.textContent = s.state ?? "Unknown";
      stateSelect.appendChild(opt);
    }
  }

  if (deptSelect && deptSelect.options.length <= 1) {
    for (const d of stats.by_department) {
      const opt = document.createElement("option");
      opt.value = d.dept ?? "";
      opt.textContent = d.dept ?? "Unknown";
      deptSelect.appendChild(opt);
    }
  }
}

async function refreshStats() {
  try {
    const stats = await api.getDashboardStats();
    renderKPIs(stats);
    updateCharts(stats);
    updateTabTitle(stats.kpis.open);
  } catch {
    // silent refresh failure
  }
}

function updateTabTitle(open: number) {
  document.title = `CGIS Dashboard (${open} open)`;
}

function renderKPIs(stats: DashboardStats) {
  const { kpis } = stats;
  renderKPICard("kpi-total", kpis.total, "Total Grievances", kpis.trend_total);
  renderKPICard("kpi-open", kpis.open, "Open", kpis.trend_open);
  renderKPICard("kpi-resolved", kpis.resolved, "Resolved", 0);
  renderKPICard("kpi-week", kpis.this_week, "This Week", 0);
  renderKPICard("kpi-depts", kpis.departments_count, "Departments", 0);
}

function renderKPICard(id: string, value: number, label: string, trend: number) {
  const el = document.getElementById(id);
  if (!el) return;
  const valEl = el.querySelector(".kpi-value");
  const lblEl = el.querySelector(".kpi-label");
  const trendEl = el.querySelector(".kpi-trend");
  if (valEl) valEl.textContent = value.toLocaleString();
  if (lblEl) lblEl.textContent = label;
  if (trendEl) {
    trendEl.textContent = `${trend >= 0 ? "+" : ""}${trend.toFixed(1)}%`;
    trendEl.className = "kpi-trend " + (trend >= 0 ? "positive" : "negative");
  }
}

function renderCharts(stats: DashboardStats) {
  buildStatusDonut(stats);
  buildStateBar(stats);
  buildDeptBar(stats);
  buildTimelineChart(stats);
  buildGenderDonut(stats);
  buildAgeHistogram(stats);
}

function updateCharts(stats: DashboardStats) {
  // Destroy and rebuild for simplicity
  Object.values(chartInstances).forEach(c => c.destroy());
  chartInstances = {};
  renderCharts(stats);
}

function getCanvas(id: string): HTMLCanvasElement | null {
  return document.getElementById(id) as HTMLCanvasElement | null;
}

function buildStatusDonut(stats: DashboardStats) {
  const ctx = getCanvas("chart-status");
  if (!ctx) return;
  const labels = stats.status_breakdown.map(s => s.status);
  const data = stats.status_breakdown.map(s => s.count);
  chartInstances["status"] = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels,
      datasets: [{ data, backgroundColor: CHART_COLORS, borderWidth: 0, hoverOffset: 6 }],
    },
    options: {
      ...DARK_OPTS,
      scales: {},
      cutout: "68%",
      onClick: (_e: ChartEvent, elements: ActiveElement[]) => {
        if (elements.length > 0) applyFilter("status", labels[elements[0].index]);
      },
    } as never,
  });
}

function buildStateBar(stats: DashboardStats) {
  const ctx = getCanvas("chart-state");
  if (!ctx) return;
  const labels = stats.by_state.map(s => s.state ?? "Unknown");
  chartInstances["state"] = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [
        { label: "Open",     data: stats.by_state.map(s => s.open),                          backgroundColor: CHART_COLORS[0], borderRadius: 2 },
        { label: "Resolved", data: stats.by_state.map(s => s.resolved),                      backgroundColor: CHART_COLORS[2], borderRadius: 2 },
        { label: "Other",    data: stats.by_state.map(s => s.count - s.open - s.resolved),   backgroundColor: CHART_COLORS[1], borderRadius: 2 },
      ],
    },
    options: {
      ...DARK_OPTS,
      indexAxis: "y" as const,
      onClick: (_e: ChartEvent, elements: ActiveElement[]) => {
        if (elements.length > 0) applyFilter("state", labels[elements[0].index]);
      },
    } as never,
  });
}

function buildDeptBar(stats: DashboardStats) {
  const ctx = getCanvas("chart-dept");
  if (!ctx) return;
  const labels = stats.by_department.map(d => d.dept ?? "Unknown");
  const data = stats.by_department.map(d => d.count);
  chartInstances["dept"] = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [{ label: "Grievances", data, backgroundColor: CHART_COLORS[0], borderRadius: 3, borderSkipped: false as const }],
    },
    options: {
      ...DARK_OPTS,
      onClick: (_e: ChartEvent, elements: ActiveElement[]) => {
        if (elements.length > 0) applyFilter("department", labels[elements[0].index]);
      },
    } as never,
  });
}

function buildTimelineChart(stats: DashboardStats) {
  const ctx = getCanvas("chart-timeline");
  if (!ctx) return;
  chartInstances["timeline"] = new Chart(ctx, {
    type: "line",
    data: {
      labels: stats.submissions_over_time.map(d => d.date),
      datasets: [
        {
          label: "Submissions",
          data: stats.submissions_over_time.map(d => d.count),
          borderColor: CHART_COLORS[0],
          backgroundColor: "rgba(232, 160, 32, 0.08)",
          fill: true,
          tension: 0.3,
          pointRadius: 3,
        },
      ],
    },
    options: DARK_OPTS as never,
  });
}

function buildGenderDonut(stats: DashboardStats) {
  const ctx = getCanvas("chart-gender");
  if (!ctx) return;
  const labels = stats.gender_breakdown.map(g => g.gender);
  const data = stats.gender_breakdown.map(g => g.count);
  chartInstances["gender"] = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels,
      datasets: [{ data, backgroundColor: CHART_COLORS, borderWidth: 0, hoverOffset: 6 }],
    },
    options: { ...DARK_OPTS, scales: {}, cutout: "68%" } as never,
  });
}

function buildAgeHistogram(stats: DashboardStats) {
  const ctx = getCanvas("chart-age");
  if (!ctx) return;
  chartInstances["age"] = new Chart(ctx, {
    type: "bar",
    data: {
      labels: stats.age_distribution.map(a => a.bin),
      datasets: [{
        label: "Count",
        data: stats.age_distribution.map(a => a.count),
        backgroundColor: CHART_COLORS[1],
        borderRadius: 3,
        borderSkipped: false as const,
      }],
    },
    options: DARK_OPTS as never,
  });
}

// ── Table ─────────────────────────────────────────────────────────────────────

async function loadTable(page: number) {
  currentPage = page;
  const tbody = document.getElementById("grievances-tbody");
  const paginationEl = document.getElementById("pagination");
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:20px;color:var(--text-muted)"><span class="spinner"></span> Loading...</td></tr>`;

  try {
    const result = await api.listGrievances({
      state: filters.state ?? undefined,
      department: filters.department ?? undefined,
      status: filters.status ?? undefined,
      page,
      page_size: PAGE_SIZE,
      sort_by: sortBy,
      sort_desc: sortDesc,
    });

    renderTableRows(tbody, result.data);
    if (paginationEl) renderPagination(paginationEl, result.total);
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="8" class="msg-error" style="padding:12px">Failed to load grievances.</td></tr>`;
  }
}

function renderTableRows(tbody: HTMLElement, data: Grievance[]) {
  if (data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:20px;color:var(--text-muted)">No grievances found.</td></tr>`;
    return;
  }

  tbody.innerHTML = "";
  for (const g of data) {
    const tr = document.createElement("tr");
    tr.dataset.id = g.grievance_id;
    tr.innerHTML = `
      <td class="id-cell">${g.grievance_id.slice(0, 8)}&hellip;</td>
      <td>${g.username ?? "<em style='color:var(--text-muted)'>—</em>"}</td>
      <td>${g.govt_department ?? "—"}</td>
      <td>${g.district ?? "—"}</td>
      <td>${g.state ?? "—"}</td>
      <td><span class="badge badge-${statusClass(g.status)}">${g.status}</span></td>
      <td class="date-cell">${formatDate(g.submitted_at)}</td>
      <td style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text-muted)">${g.problem_summary}</td>
    `;
    tr.addEventListener("click", () => toggleRowDetail(tr, g));
    tbody.appendChild(tr);
  }
}

function toggleRowDetail(tr: HTMLTableRowElement, g: Grievance) {
  const existing = tr.nextElementSibling;
  if (existing?.classList.contains("row-detail-row")) {
    existing.remove();
    return;
  }
  // Remove any other open detail rows
  document.querySelectorAll(".row-detail-row").forEach(el => el.remove());

  const detailRow = document.createElement("tr");
  detailRow.className = "row-detail-row";
  detailRow.innerHTML = `
    <td colspan="8" class="row-detail">
      <div class="row-detail-grid">
        <div class="detail-field"><label>Full ID</label><span style="font-family:var(--font-mono);font-size:12px">${g.grievance_id}</span></div>
        <div class="detail-field"><label>Age / Gender</label><span>${g.age ?? "—"} / ${g.gender ?? "—"}</span></div>
        <div class="detail-field"><label>PIN Code</label><span>${g.pin_code ?? "—"}</span></div>
        <div class="detail-field" style="grid-column:1/-1"><label>Problem Summary</label><span>${g.problem_summary}</span></div>
        ${g.proof_reference ? `<div class="detail-field"><label>Proof Reference</label><span style="font-family:var(--font-mono)">${g.proof_reference}</span></div>` : ""}
      </div>
    </td>
  `;
  tr.after(detailRow);
}

function renderPagination(container: HTMLElement, total: number) {
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  container.innerHTML = "";

  const prevBtn = document.createElement("button");
  prevBtn.textContent = "Prev";
  prevBtn.disabled = currentPage <= 1;
  prevBtn.addEventListener("click", () => loadTable(currentPage - 1));
  container.appendChild(prevBtn);

  const info = document.createElement("span");
  info.style.cssText = "color:var(--text-muted);font-size:13px;font-family:var(--font-mono);padding:0 8px";
  info.textContent = `${currentPage} / ${totalPages} (${total} total)`;
  container.appendChild(info);

  const nextBtn = document.createElement("button");
  nextBtn.textContent = "Next";
  nextBtn.disabled = currentPage >= totalPages;
  nextBtn.addEventListener("click", () => loadTable(currentPage + 1));
  container.appendChild(nextBtn);
}

function setupTableControls() {
  document.getElementById("filter-state")?.addEventListener("change", (e) => {
    applyFilter("state", (e.target as HTMLSelectElement).value || null);
  });
  document.getElementById("filter-dept")?.addEventListener("change", (e) => {
    applyFilter("department", (e.target as HTMLSelectElement).value || null);
  });
  document.getElementById("filter-status")?.addEventListener("change", (e) => {
    applyFilter("status", (e.target as HTMLSelectElement).value || null);
  });
  document.getElementById("clear-filters")?.addEventListener("click", () => {
    filters = { state: null, department: null, status: null };
    (document.getElementById("filter-state") as HTMLSelectElement).value = "";
    (document.getElementById("filter-dept") as HTMLSelectElement).value = "";
    (document.getElementById("filter-status") as HTMLSelectElement).value = "";
    renderFilterChips();
    loadTable(1);
  });

  document.querySelectorAll(".data-table th[data-sort]").forEach(th => {
    th.addEventListener("click", () => {
      const col = (th as HTMLElement).dataset.sort!;
      if (sortBy === col) {
        sortDesc = !sortDesc;
      } else {
        sortBy = col;
        sortDesc = true;
      }
      loadTable(1);
    });
  });
}

function applyFilter(key: keyof DashboardFilters, value: string | null) {
  filters[key] = value;
  renderFilterChips();
  loadTable(1);
}

function renderFilterChips() {
  const container = document.getElementById("filter-chips");
  if (!container) return;
  container.innerHTML = "";
  for (const [k, v] of Object.entries(filters)) {
    if (!v) continue;
    const chip = document.createElement("div");
    chip.className = "filter-chip";
    chip.innerHTML = `<span>${k}: ${v}</span><span>x</span>`;
    chip.addEventListener("click", () => applyFilter(k as keyof DashboardFilters, null));
    container.appendChild(chip);
  }
}

// ── Submit Modal ──────────────────────────────────────────────────────────────

function initSubmitModal() {
  const openBtns = document.querySelectorAll("[data-open-modal='submit']");
  const overlay = document.getElementById("submit-modal");
  const closeBtn = document.getElementById("modal-close");
  const form = document.getElementById("submit-form") as HTMLFormElement | null;
  const textarea = document.getElementById("submission-text") as HTMLTextAreaElement | null;
  const resultEl = document.getElementById("submit-result");
  const submitBtn = document.getElementById("submit-btn") as HTMLButtonElement | null;

  openBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      overlay?.classList.remove("hidden");
      if (resultEl) resultEl.innerHTML = "";
      textarea?.focus();
    });
  });

  closeBtn?.addEventListener("click", () => overlay?.classList.add("hidden"));
  overlay?.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.classList.add("hidden");
  });

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = textarea?.value.trim();
    if (!text) return;

    submitBtn!.disabled = true;
    submitBtn!.innerHTML = `<span class="spinner"></span> Processing...`;
    if (resultEl) resultEl.innerHTML = "";

    try {
      const rec = await api.submitGrievance(text);
      if (resultEl) {
        resultEl.innerHTML = renderConfirmCard(rec);
        resultEl.querySelector(".copy-btn")?.addEventListener("click", () => {
          navigator.clipboard.writeText(rec.grievance_id);
        });
      }
      textarea!.value = "";
      await loadTable(1);
      await loadStats();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Submission failed";
      if (resultEl) resultEl.innerHTML = `<div class="msg-error">${msg}</div>`;
    } finally {
      submitBtn!.disabled = false;
      submitBtn!.textContent = "Submit";
    }
  });
}

function renderConfirmCard(rec: Grievance): string {
  return `
    <div class="confirm-card" style="margin-top:16px">
      <div style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted);margin-bottom:8px;text-transform:uppercase">Grievance Registered</div>
      <div class="confirm-id">
        <span>${rec.grievance_id}</span>
        <button class="copy-btn">Copy</button>
      </div>
      <div class="confirm-fields">
        ${fieldRow("Name", rec.username)}
        ${fieldRow("Age", rec.age !== null ? String(rec.age) : null)}
        ${fieldRow("Gender", rec.gender)}
        ${fieldRow("State", rec.state)}
        ${fieldRow("District", rec.district)}
        ${fieldRow("Department", rec.govt_department)}
        ${fieldRow("Status", rec.status)}
        ${fieldRow("Proof Ref", rec.proof_reference)}
      </div>
      <div style="margin-top:12px">
        <div class="detail-field"><label>Problem Summary</label><span>${rec.problem_summary}</span></div>
      </div>
      <div class="msg-info" style="margin-top:12px;font-size:12px">Your grievance has been registered. Keep this reference ID for follow-up.</div>
    </div>`;
}

function fieldRow(label: string, value: string | null | undefined): string {
  if (!value) return "";
  return `<div class="detail-field"><label>${label}</label><span>${value}</span></div>`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function statusClass(status: string): string {
  if (status === "under_review") return "review";
  return status;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

document.addEventListener("DOMContentLoaded", init);
