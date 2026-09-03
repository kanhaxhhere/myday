// ================= SUPABASE CONFIG =================
const SUPABASE_URL = "https://meqcpytdqtezuemgccht.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1lcWNweXRkcXRlenVlbWdjY2h0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgzNTU4ODQsImV4cCI6MjEwMzkzMTg4NH0.kqyMN0eow7jEzJDV0ssapdAfn9DYY2XKWIpgpx7m7ic";
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ================= STATE =================
let currentUser = null; // { username, email }
let viewingDate = new Date();
let calMonth = new Date();
let monthEntries = {};
let selectedMood = null;
let blurred = false;
let pinned = false;

const LOCALE = "en-IN"; // keep everything roman-script (Hinglish), not Devanagari

const MOODS = [
  { emoji: "😊", key: "happy", color: "#E8B94A" },
  { emoji: "🥰", key: "loved", color: "#C97C90" },
  { emoji: "😌", key: "calm",  color: "#8CA888" },
  { emoji: "😢", key: "sad",   color: "#7C93C9" },
  { emoji: "😡", key: "angry", color: "#C96B5C" },
  { emoji: "😰", key: "anxious", color: "#A87CC9" },
  { emoji: "😴", key: "tired", color: "#9B9B9B" },
];

const PROMPTS = [
  "Aaj ka sabse achha pal kaunsa tha?",
  "Kisi cheez ke liye aaj shukar-guzaar ho?",
  "Aaj kisi ne tumhe smile karaya?",
  "Agar aaj ka din ek rang hota, toh kaunsa hota?",
  "Kya cheez aaj mushkil lagi, aur kaise sambhala?",
  "Kal ke liye ek chhoti si umeed likho.",
  "Aaj tumne apne liye kya achha kiya?",
  "Koi baat jo dil mein hai par kisi se nahi kahi?",
];

const dateStr = (d) => {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"), day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};
const todayStr = () => dateStr(new Date());
const fmtLong = (d) => d.toLocaleDateString(LOCALE, { day: "numeric", month: "long", year: "numeric" });
const fmtShort = (d) => d.toLocaleDateString(LOCALE, { day: "numeric", month: "short" });
const fmtWeekday = (d) => d.toLocaleDateString(LOCALE, { weekday: "long" });
const fmtMonthYear = (d) => d.toLocaleDateString(LOCALE, { month: "long", year: "numeric" });

// ================= LOGIN / SESSION =================
function initSession() {
  const saved = localStorage.getItem("diary_user");
  if (saved) {
    currentUser = JSON.parse(saved);
    showApp();
  }
}

document.getElementById("login-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const username = document.getElementById("login-username").value.trim();
  const email = document.getElementById("login-email").value.trim().toLowerCase();
  if (!username || !email) return;
  currentUser = { username, email };
  localStorage.setItem("diary_user", JSON.stringify(currentUser));
  showApp();
});

document.getElementById("signout-btn").addEventListener("click", () => {
  localStorage.removeItem("diary_user");
  currentUser = null;
  document.getElementById("app-shell").hidden = true;
  document.getElementById("login-screen").hidden = false;
  document.getElementById("login-form").reset();
});

function showApp() {
  document.getElementById("login-screen").hidden = true;
  document.getElementById("app-shell").hidden = false;
  document.getElementById("profile-username").textContent = currentUser.username;
  document.getElementById("profile-email").textContent = currentUser.email;
  initMoodRow();
  initTheme();
  renderPromptIfEmpty();
  loadEntryForDate(viewingDate);
  loadMonthEntries();
  loadEntriesList();
  loadMemories();
  loadStats();
}

// ================= NAVIGATION =================
document.querySelectorAll(".nav-btn").forEach((btn) => {
  btn.addEventListener("click", () => switchView(btn.dataset.view));
});
function switchView(view) {
  document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
  document.getElementById("view-" + view).classList.add("active");
  document.querySelectorAll(".nav-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.view === view);
  });
  if (view === "stats") loadStats();
  if (view === "calendar") { renderCalendar(); loadEntriesList(); }
  if (view === "memories") loadMemories();
}

// ================= DARK MODE =================
function initTheme() {
  const dark = localStorage.getItem("diary_theme") === "dark";
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
  document.getElementById("dark-toggle").classList.toggle("on", dark);
}
document.getElementById("dark-toggle").addEventListener("click", () => {
  const isDark = document.documentElement.getAttribute("data-theme") === "dark";
  document.documentElement.setAttribute("data-theme", isDark ? "light" : "dark");
  localStorage.setItem("diary_theme", isDark ? "light" : "dark");
  document.getElementById("dark-toggle").classList.toggle("on", !isDark);
});

// ================= BLUR MODE =================
document.getElementById("blur-toggle").addEventListener("click", () => {
  blurred = !blurred;
  document.getElementById("entry-textarea").classList.toggle("blurred", blurred);
  document.getElementById("blur-toggle").classList.toggle("on", blurred);
});

// ================= MOOD ROW =================
function initMoodRow() {
  const row = document.getElementById("mood-row");
  row.innerHTML = "";
  MOODS.forEach((m) => {
    const btn = document.createElement("button");
    btn.className = "mood-btn";
    btn.type = "button";
    btn.textContent = m.emoji;
    btn.title = m.key;
    btn.addEventListener("click", () => {
      selectedMood = selectedMood === m.key ? null : m.key;
      updateMoodSelection();
    });
    btn.dataset.key = m.key;
    row.appendChild(btn);
  });
}
function updateMoodSelection() {
  document.querySelectorAll(".mood-btn").forEach((b) => {
    b.classList.toggle("selected", b.dataset.key === selectedMood);
  });
}

// ================= DIARY: LOAD / SAVE ENTRY =================
async function loadEntryForDate(d) {
  viewingDate = d;
  const ds = dateStr(d);
  const isToday = ds === todayStr();
  document.getElementById("diary-date-label").textContent = isToday ? "Aaj" : fmtLong(d);
  document.getElementById("diary-date-sub").textContent = fmtWeekday(d);

  const { data } = await sb.from("entries").select("*").eq("email", currentUser.email).eq("entry_date", ds).maybeSingle();

  const textarea = document.getElementById("entry-textarea");
  const tagsInput = document.getElementById("tags-input");
  selectedMood = null;
  pinned = false;

  if (data) {
    textarea.value = data.content || "";
    tagsInput.value = (data.tags || []).join(", ");
    selectedMood = data.mood || null;
    pinned = !!data.pinned;
  } else {
    textarea.value = "";
    tagsInput.value = "";
  }
  updateMoodSelection();
  document.getElementById("pin-toggle").classList.toggle("on", pinned);
  updateWordCount();
  renderPromptIfEmpty();
}

function renderPromptIfEmpty() {
  const box = document.getElementById("prompt-box");
  const textarea = document.getElementById("entry-textarea");
  if (!textarea.value) {
    const idx = Math.floor(Date.now() / 86400000) % PROMPTS.length;
    document.getElementById("prompt-text").textContent = PROMPTS[idx];
    box.hidden = false;
  } else {
    box.hidden = true;
  }
}

document.getElementById("entry-textarea").addEventListener("input", () => {
  updateWordCount();
  document.getElementById("prompt-box").hidden = !!document.getElementById("entry-textarea").value;
});

function updateWordCount() {
  const val = document.getElementById("entry-textarea").value.trim();
  const count = val ? val.split(/\s+/).length : 0;
  document.getElementById("word-count").textContent = `${count} words`;
}

document.getElementById("pin-toggle").addEventListener("click", () => {
  pinned = !pinned;
  document.getElementById("pin-toggle").classList.toggle("on", pinned);
});

document.getElementById("save-entry-btn").addEventListener("click", saveEntry);

async function saveEntry() {
  const content = document.getElementById("entry-textarea").value;
  const tags = document.getElementById("tags-input").value.split(",").map((t) => t.trim()).filter(Boolean);
  const ds = dateStr(viewingDate);

  const { error } = await sb.from("entries").upsert({
    email: currentUser.email,
    username: currentUser.username,
    entry_date: ds,
    content,
    mood: selectedMood,
    tags,
    pinned,
    updated_at: new Date().toISOString(),
  }, { onConflict: "email,entry_date" });

  const status = document.getElementById("save-status");
  status.textContent = error ? "Save nahi hua, dubara try karo." : "Saved ✓";
  if (!error) {
    loadMonthEntries();
    loadEntriesList();
    loadStats();
    setTimeout(() => { status.textContent = ""; }, 2500);
  }
}

async function deleteEntry(entryDate) {
  if (!confirm("Yeh entry delete karni hai? Yeh wapas nahi aayegi.")) return;
  await sb.from("entries").delete().eq("email", currentUser.email).eq("entry_date", entryDate);
  loadMonthEntries();
  loadEntriesList();
  loadStats();
  const ds = dateStr(viewingDate);
  if (ds === entryDate) loadEntryForDate(viewingDate);
}

// ================= SAVED ENTRIES LIST (view / edit / delete) =================
async function loadEntriesList() {
  const { data } = await sb.from("entries").select("entry_date,content,mood,tags")
    .eq("email", currentUser.email).order("entry_date", { ascending: false });

  const list = document.getElementById("entries-list");
  list.innerHTML = "";
  if (!data || data.length === 0) {
    list.innerHTML = `<p class="muted">Abhi tak koi entry save nahi hui.</p>`;
    return;
  }
  data.forEach((row) => {
    const d = new Date(row.entry_date + "T00:00:00");
    const moodObj = MOODS.find((m) => m.key === row.mood);
    const item = document.createElement("div");
    item.className = "entry-row";
    item.innerHTML = `
      <div class="entry-row-main">
        <span class="entry-row-mood">${moodObj ? moodObj.emoji : "📝"}</span>
        <div class="entry-row-text">
          <div class="entry-row-date">${fmtLong(d)}</div>
          <div class="entry-row-snippet">${(row.content || "(khaali)").slice(0, 60)}</div>
        </div>
      </div>
      <div class="entry-row-actions">
        <button class="view-btn" title="View">👁️</button>
        <button class="edit-btn" title="Edit">✏️</button>
        <button class="danger delete-btn" title="Delete">🗑️</button>
      </div>`;
    item.querySelector(".view-btn").addEventListener("click", () => openModal(fmtLong(d), `<p>${(row.content || "(khaali)").replace(/</g, "&lt;")}</p>`));
    item.querySelector(".edit-btn").addEventListener("click", () => { loadEntryForDate(d); switchView("diary"); });
    item.querySelector(".delete-btn").addEventListener("click", () => deleteEntry(row.entry_date));
    list.appendChild(item);
  });
}

// ================= MODAL =================
function openModal(dateLabel, bodyHtml) {
  document.getElementById("modal-date").textContent = dateLabel;
  document.getElementById("modal-body").innerHTML = bodyHtml;
  document.getElementById("view-modal").hidden = false;
}
document.getElementById("modal-close").addEventListener("click", () => {
  document.getElementById("view-modal").hidden = true;
});
document.getElementById("view-modal").addEventListener("click", (e) => {
  if (e.target.id === "view-modal") document.getElementById("view-modal").hidden = true;
});

// ================= CALENDAR =================
document.getElementById("cal-prev").addEventListener("click", () => {
  calMonth.setMonth(calMonth.getMonth() - 1);
  loadMonthEntries();
});
document.getElementById("cal-next").addEventListener("click", () => {
  calMonth.setMonth(calMonth.getMonth() + 1);
  loadMonthEntries();
});

async function loadMonthEntries() {
  const year = calMonth.getFullYear(), month = calMonth.getMonth();
  const start = dateStr(new Date(year, month, 1));
  const end = dateStr(new Date(year, month + 1, 0));
  const { data } = await sb.from("entries").select("entry_date,mood,pinned,content").eq("email", currentUser.email).gte("entry_date", start).lte("entry_date", end);
  monthEntries = {};
  (data || []).forEach((row) => { monthEntries[row.entry_date] = row; });
  renderCalendar();
}

function renderCalendar() {
  const year = calMonth.getFullYear(), month = calMonth.getMonth();
  document.getElementById("cal-month-label").textContent = fmtMonthYear(calMonth);

  const grid = document.getElementById("cal-grid");
  grid.innerHTML = "";
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  for (let i = 0; i < firstDay; i++) {
    const empty = document.createElement("div");
    empty.className = "cal-day empty";
    grid.appendChild(empty);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(year, month, day);
    const ds = dateStr(d);
    const cell = document.createElement("div");
    cell.className = "cal-day";
    cell.textContent = day;

    const entry = monthEntries[ds];
    if (entry) {
      cell.classList.add("has-entry");
      const moodObj = MOODS.find((m) => m.key === entry.mood);
      cell.style.background = moodObj ? moodObj.color : "var(--rose)";
      if (entry.pinned) {
        const dot = document.createElement("span");
        dot.className = "pin-dot";
        dot.textContent = "📌";
        cell.appendChild(dot);
      }
    }
    if (ds === todayStr()) cell.classList.add("today");

    cell.addEventListener("click", () => {
      loadEntryForDate(d);
      switchView("diary");
    });
    grid.appendChild(cell);
  }
}

// ================= SEARCH =================
let searchTimeout;
document.getElementById("search-input").addEventListener("input", (e) => {
  clearTimeout(searchTimeout);
  const q = e.target.value.trim();
  searchTimeout = setTimeout(() => runSearch(q), 350);
});

async function runSearch(q) {
  const resultsBox = document.getElementById("search-results");
  if (!q) { resultsBox.innerHTML = ""; return; }
  const { data } = await sb.from("entries").select("entry_date,content,tags")
    .eq("email", currentUser.email)
    .or(`content.ilike.%${q}%,tags.cs.{${q}}`)
    .order("entry_date", { ascending: false })
    .limit(20);

  resultsBox.innerHTML = "";
  (data || []).forEach((row) => {
    const item = document.createElement("div");
    item.className = "search-result-item";
    const d = new Date(row.entry_date + "T00:00:00");
    item.innerHTML = `<span class="sr-date">${fmtShort(d)}, ${d.getFullYear()}</span><br>${(row.content || "").slice(0, 90)}...`;
    item.addEventListener("click", () => {
      loadEntryForDate(d);
      switchView("diary");
    });
    resultsBox.appendChild(item);
  });
  if (!data || data.length === 0) resultsBox.innerHTML = `<p class="muted">Kuch nahi mila.</p>`;
}

// ================= MEMORIES =================
document.getElementById("memory-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const fileInput = document.getElementById("memory-file");
  const caption = document.getElementById("memory-caption").value.trim();
  const file = fileInput.files[0];
  const status = document.getElementById("memory-status");
  if (!file) return;

  status.textContent = "Upload ho raha hai...";
  const filePath = `${currentUser.email}/${Date.now()}_${file.name}`;
  const { error: uploadError } = await sb.storage.from("memories").upload(filePath, file);
  if (uploadError) { status.textContent = "Upload fail hua."; return; }

  const { data: urlData } = sb.storage.from("memories").getPublicUrl(filePath);
  const { error } = await sb.from("memories").insert({
    email: currentUser.email,
    username: currentUser.username,
    image_url: urlData.publicUrl,
    caption,
    memory_date: todayStr(),
    file_path: filePath,
  });

  status.textContent = error ? "Save nahi hua." : "Memory save ho gayi ✓";
  document.getElementById("memory-form").reset();
  loadMemories();
  loadStats();
  setTimeout(() => { status.textContent = ""; }, 2500);
});

async function loadMemories() {
  const { data } = await sb.from("memories").select("*").eq("email", currentUser.email).order("created_at", { ascending: false });
  const grid = document.getElementById("memories-grid");
  grid.innerHTML = "";
  (data || []).forEach((m) => {
    const d = new Date(m.memory_date + "T00:00:00");
    const card = document.createElement("div");
    card.className = "memory-card";
    card.innerHTML = `
      <img src="${m.image_url}" alt="${(m.caption || 'memory').replace(/"/g, '')}" loading="lazy">
      <div class="cap">
        <span class="m-date">${fmtShort(d)}</span>
        <span class="mem-caption-text">${m.caption || ""}</span>
      </div>
      <div class="mem-actions">
        <button class="mem-view">View</button>
        <button class="mem-edit">Edit</button>
        <button class="danger mem-delete">Delete</button>
      </div>`;
    card.querySelector(".mem-view").addEventListener("click", () => {
      openModal(fmtLong(d), `<img src="${m.image_url}"><p>${m.caption || ""}</p>`);
    });
    card.querySelector(".mem-edit").addEventListener("click", async () => {
      const newCaption = prompt("Naya caption likho:", m.caption || "");
      if (newCaption === null) return;
      await sb.from("memories").update({ caption: newCaption }).eq("id", m.id);
      loadMemories();
    });
    card.querySelector(".mem-delete").addEventListener("click", async () => {
      if (!confirm("Yeh memory delete karni hai?")) return;
      if (m.file_path) await sb.storage.from("memories").remove([m.file_path]);
      await sb.from("memories").delete().eq("id", m.id);
      loadMemories();
      loadStats();
    });
    grid.appendChild(card);
  });
}

// ================= STATS =================
async function loadStats() {
  const { data: entries } = await sb.from("entries").select("entry_date,content").eq("email", currentUser.email);
  const { data: memories } = await sb.from("memories").select("id").eq("email", currentUser.email);

  const total = entries ? entries.length : 0;
  const totalWords = (entries || []).reduce((sum, e) => sum + (e.content ? e.content.trim().split(/\s+/).filter(Boolean).length : 0), 0);

  const dateSet = new Set((entries || []).map((e) => e.entry_date));
  let streak = 0;
  let cursor = new Date();
  if (!dateSet.has(todayStr())) cursor.setDate(cursor.getDate() - 1);
  while (dateSet.has(dateStr(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }

  document.getElementById("stat-streak").textContent = streak;
  document.getElementById("stat-total").textContent = total;
  document.getElementById("stat-words").textContent = totalWords;
  document.getElementById("stat-memories").textContent = memories ? memories.length : 0;
}

// ================= EXPORT =================
document.getElementById("export-btn").addEventListener("click", async () => {
  const { data: entries } = await sb.from("entries").select("*").eq("email", currentUser.email).order("entry_date");
  const { data: memories } = await sb.from("memories").select("*").eq("email", currentUser.email).order("memory_date");
  const blob = new Blob([JSON.stringify({ user: currentUser, entries, memories }, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `dear-diary-${currentUser.username}-export.json`;
  a.click();
  URL.revokeObjectURL(url);
});

// ================= INIT =================
initSession();
