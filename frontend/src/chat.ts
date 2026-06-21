import { api } from "./api";
import type { ChatSession } from "./types";

const SESSION_KEY = "cgis-chat-session";
const EXAMPLE_QUESTIONS = [
  "How many total grievances are in the database?",
  "Show all open complaints from Karnataka",
  "Which department has the most complaints?",
  "List grievances that mention a proof reference",
  "How many complaints are from female citizens above 50?",
  "What is the breakdown of grievances by status?",
];

let sessionId: string | null = sessionStorage.getItem(SESSION_KEY);

async function init() {
  const messagesEl = document.getElementById("chat-messages")!;
  const form = document.getElementById("chat-form") as HTMLFormElement;
  const input = document.getElementById("chat-input") as HTMLInputElement;
  const newSessionBtn = document.getElementById("new-session-btn");
  const sidebarEl = document.getElementById("sessions-list");
  const hamburger = document.getElementById("sidebar-toggle");
  const sidebar = document.getElementById("chat-sidebar");

  hamburger?.addEventListener("click", () => sidebar?.classList.toggle("open"));

  newSessionBtn?.addEventListener("click", async () => {
    const { session_id } = await api.createChatSession();
    sessionId = session_id;
    sessionStorage.setItem(SESSION_KEY, sessionId);
    messagesEl.innerHTML = "";
    renderChips(messagesEl, input);
    await refreshSidebar(sidebarEl);
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    await sendMessage(text, messagesEl, sidebarEl);
  });

  if (sessionId) {
    await restoreSession(sessionId, messagesEl, input);
  } else {
    renderChips(messagesEl, input);
  }

  await refreshSidebar(sidebarEl);
}

function renderChips(container: HTMLElement, input: HTMLInputElement) {
  const chipsEl = document.createElement("div");
  chipsEl.className = "example-chips";
  chipsEl.id = "example-chips";
  for (const q of EXAMPLE_QUESTIONS) {
    const chip = document.createElement("button");
    chip.className = "chip";
    chip.textContent = q;
    chip.addEventListener("click", () => {
      chipsEl.remove();
      input.value = q;
      input.form?.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
    });
    chipsEl.appendChild(chip);
  }
  container.appendChild(chipsEl);
}

async function restoreSession(id: string, container: HTMLElement, input: HTMLInputElement) {
  try {
    const { messages } = await api.getChatSession(id);
    if (messages.length === 0) {
      renderChips(container, input);
    } else {
      for (const msg of messages) {
        appendMessage(container, msg.role as "user" | "assistant", msg.content, msg.sql_query);
      }
    }
    container.scrollTop = container.scrollHeight;
  } catch {
    renderChips(container, input);
  }
}

async function refreshSidebar(sidebarEl: HTMLElement | null) {
  if (!sidebarEl) return;
  try {
    const sessions: ChatSession[] = await api.listChatSessions();
    sidebarEl.innerHTML = "";
    for (const s of sessions) {
      const item = document.createElement("div");
      item.className = "session-item" + (s.session_id === sessionId ? " active" : "");
      item.dataset.id = s.session_id;
      item.innerHTML = `
        <span class="session-time">${formatRelative(s.last_active)}</span>
        <span class="session-id">${s.session_id.slice(0, 8)}…</span>
      `;
      item.addEventListener("click", async () => {
        sessionId = s.session_id;
        sessionStorage.setItem(SESSION_KEY, sessionId);
        document.querySelectorAll(".session-item").forEach(el => el.classList.remove("active"));
        item.classList.add("active");
        const messagesEl = document.getElementById("chat-messages")!;
        const inputEl = document.getElementById("chat-input") as HTMLInputElement;
        messagesEl.innerHTML = "";
        await restoreSession(s.session_id, messagesEl, inputEl);
      });
      sidebarEl.appendChild(item);
    }
  } catch {
    // sidebar load failure is non-critical
  }
}

async function sendMessage(text: string, container: HTMLElement, sidebarEl: HTMLElement | null) {
  document.getElementById("example-chips")?.remove();
  appendMessage(container, "user", text);
  container.scrollTop = container.scrollHeight;

  const loadingEl = document.createElement("div");
  loadingEl.className = "chat-msg analyst";
  loadingEl.innerHTML = `<div class="msg-avatar"></div><div class="msg-content"><span class="spinner"></span> Thinking...</div>`;
  container.appendChild(loadingEl);
  container.scrollTop = container.scrollHeight;

  try {
    const resp = await api.sendChatMessage(text, sessionId);
    sessionId = resp.session_id;
    sessionStorage.setItem(SESSION_KEY, sessionId);
    loadingEl.remove();
    appendMessage(container, "assistant", resp.answer, resp.sql);
    container.scrollTop = container.scrollHeight;
    await refreshSidebar(sidebarEl);
  } catch (err: unknown) {
    loadingEl.remove();
    const msg = err instanceof Error ? err.message : "Error — please try again.";
    appendMessage(container, "assistant", msg);
    container.scrollTop = container.scrollHeight;
  }
}

function appendMessage(
  container: HTMLElement,
  role: "user" | "assistant",
  content: string,
  sql?: string | null
) {
  const el = document.createElement("div");
  el.className = `chat-msg ${role === "user" ? "user" : "analyst"}`;

  const copyId = `copy-${Date.now()}`;
  const renderedContent = role === "assistant" ? renderMarkdown(content) : escapeHtml(content);
  el.innerHTML = `
    <div class="msg-content">
      <p>${renderedContent}</p>
      ${sql ? `
        <details class="sql-details">
          <summary class="sql-summary">View SQL</summary>
          <pre class="sql-block">${escapeHtml(sql)}</pre>
        </details>` : ""}
      <button class="copy-msg-btn" id="${copyId}" aria-label="Copy response">Copy</button>
    </div>
  `;
  container.appendChild(el);

  document.getElementById(copyId)?.addEventListener("click", () => {
    navigator.clipboard.writeText(content);
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderMarkdown(text: string): string {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>");
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

document.addEventListener("DOMContentLoaded", init);
