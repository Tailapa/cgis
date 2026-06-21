import { api } from "./api";

const SESSION_KEY = "cgis-chat-session";

let sessionId: string | null = sessionStorage.getItem(SESSION_KEY);
let isOpen = false;

export function initBubble(): void {
  const trigger = document.getElementById("bubble-trigger");
  const panel = document.getElementById("bubble-panel");
  const closeBtn = document.getElementById("bubble-close");
  const resetBtn = document.getElementById("bubble-reset");
  const expandBtn = document.getElementById("bubble-expand");
  const form = document.getElementById("bubble-form") as HTMLFormElement | null;
  const input = document.getElementById("bubble-input") as HTMLInputElement | null;
  const messagesEl = document.getElementById("bubble-messages");
  const badge = document.getElementById("bubble-badge");

  if (!trigger || !panel || !form || !input || !messagesEl) return;

  expandBtn?.addEventListener("click", () => {
    // Save current session before navigating so /chat can restore it
    if (sessionId) sessionStorage.setItem(SESSION_KEY, sessionId);
    window.location.href = "/chat";
  });

  trigger.addEventListener("click", () => {
    isOpen = !isOpen;
    panel!.classList.toggle("hidden", !isOpen);
    trigger.setAttribute("aria-expanded", String(isOpen));
    if (isOpen) {
      badge!.classList.add("hidden");
      scrollMessages(messagesEl);
      input.focus();
    }
  });

  closeBtn?.addEventListener("click", () => {
    isOpen = false;
    panel!.classList.add("hidden");
    trigger.setAttribute("aria-expanded", "false");
  });

  resetBtn?.addEventListener("click", () => {
    sessionId = null;
    sessionStorage.removeItem(SESSION_KEY);
    messagesEl.innerHTML = "";
    appendWelcomeMessage(messagesEl);
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    await sendBubbleMessage(text, messagesEl, badge!);
  });

  // Restore previous session if exists
  if (sessionId) {
    loadSession(sessionId, messagesEl);
  } else {
    appendWelcomeMessage(messagesEl);
  }
}

function appendWelcomeMessage(container: HTMLElement): void {
  const el = document.createElement("div");
  el.className = "bubble-msg analyst";
  el.innerHTML = `<span>Ask me anything about the grievance database — counts, statuses, departments, or trends.</span>`;
  container.appendChild(el);
}

async function loadSession(id: string, container: HTMLElement): Promise<void> {
  try {
    const { messages: msgs } = await api.getChatSession(id);
    container.innerHTML = "";
    if (msgs.length === 0) {
      appendWelcomeMessage(container);
    } else {
      for (const msg of msgs) {
        appendMessage(container, msg.role as "user" | "assistant", msg.content, msg.sql_query);
      }
    }
    scrollMessages(container);
  } catch {
    appendWelcomeMessage(container);
  }
}

async function sendBubbleMessage(
  text: string,
  container: HTMLElement,
  badge: HTMLElement
): Promise<void> {
  appendMessage(container, "user", text);
  scrollMessages(container);

  const loadingEl = appendLoading(container);
  scrollMessages(container);

  try {
    const resp = await api.sendChatMessage(text, sessionId);
    sessionId = resp.session_id;
    sessionStorage.setItem(SESSION_KEY, sessionId);
    loadingEl.remove();
    appendMessage(container, "assistant", resp.answer, resp.sql);
    scrollMessages(container);
    if (!isOpen) {
      badge.classList.remove("hidden");
    }
  } catch (err: unknown) {
    loadingEl.remove();
    const msg = err instanceof Error ? err.message : "Error — please try again.";
    appendMessage(container, "assistant", msg);
    scrollMessages(container);
  }
}

function renderMarkdown(text: string): string {
  return text
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>");
}

function appendMessage(
  container: HTMLElement,
  role: "user" | "assistant",
  content: string,
  sql?: string | null
): void {
  const el = document.createElement("div");
  el.className = `bubble-msg ${role === "user" ? "user" : "analyst"}`;

  const textEl = document.createElement("span");
  if (role === "assistant") {
    textEl.innerHTML = renderMarkdown(content);
  } else {
    textEl.textContent = content;
  }
  el.appendChild(textEl);

  if (sql && role === "assistant") {
    const details = document.createElement("details");
    details.className = "sql-details";
    const summary = document.createElement("summary");
    summary.className = "sql-summary";
    summary.textContent = "View SQL";
    const pre = document.createElement("pre");
    pre.className = "sql-block";
    pre.textContent = sql;
    details.appendChild(summary);
    details.appendChild(pre);
    el.appendChild(details);
  }

  container.appendChild(el);
}

function appendLoading(container: HTMLElement): HTMLElement {
  const el = document.createElement("div");
  el.className = "bubble-msg analyst loading";
  el.innerHTML = `<span class="spinner"></span><span>Thinking...</span>`;
  container.appendChild(el);
  return el;
}

function scrollMessages(container: HTMLElement): void {
  container.scrollTop = container.scrollHeight;
}
