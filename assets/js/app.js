/* =========================================================
   Iqbal & Zulaikha Archive — App logic (Firestore-backed)
   - Live Firestore subscription + smart hash-based seeder
   - Feed uses platform logo tiles (no video embeds)
   - Per-device identity: each person adds/edits their note + emoji
   ========================================================= */

import { db, fs } from "./firebase-init.js";
import { SEED_MEMORIES } from "./seed-data.js";

const COL_NAME = "memories";
const IDENTITY_KEY = "iz-archive:identity";

/** Quick emoji picker for per-person “emotion” on a note */
const NOTE_EMOJIS = ["🥹", "😭", "💔", "😞", "🥰", "😤", "🤭", "✿", "♡", "☁️", "🔥", "😵‍💫", "🪞", "🧸", "☺️", "🫣"];

/* =========================================================
   Mood vocabulary
   ========================================================= */
const MOODS = [
  // soft & gentle
  { id: "soft_emotional",     emoji: "🥹",   label: "soft",          tone: "blush"    },
  { id: "neutral_soft",       emoji: "☁️",   label: "soft & quiet",  tone: "cream"    },
  { id: "lighthearted",       emoji: "☺️",   label: "lighthearted",  tone: "blush"    },
  { id: "cute",               emoji: "🧸",   label: "cute",          tone: "lavender" },
  { id: "cute_reaction",      emoji: "🥰",   label: "cute reaction", tone: "blush"    },

  // sad
  { id: "sad",                emoji: "😞",   label: "sad",           tone: "blush"    },
  { id: "very_sad",           emoji: "😭",   label: "very sad",      tone: "rose"     },
  { id: "broken",             emoji: "💔",   label: "broken",        tone: "rose"     },

  // emotional / reflective
  { id: "reflection",         emoji: "🪞",   label: "reflection",    tone: "cream"    },
  { id: "warning_reflection", emoji: "🫣",   label: "soft warning",  tone: "cream"    },
  { id: "emotional_conflict", emoji: "😖",   label: "torn",          tone: "rose"     },
  { id: "mixed_emotion",      emoji: "🥲",   label: "mixed",         tone: "lavender" },
  { id: "reaction_confused",  emoji: "😵‍💫", label: "confused",      tone: "lavender" },

  // playful & spicy
  { id: "funny_reaction",     emoji: "🤭",   label: "funny",         tone: "blush"    },
  { id: "anger_emotional",    emoji: "😤",   label: "fired up",      tone: "rose"     },
  { id: "anger_debate",       emoji: "😠",   label: "heated",        tone: "rose"     },
  { id: "controversial",      emoji: "🔥",   label: "controversial", tone: "rose"     },
];
const moodById = Object.fromEntries(MOODS.map(m => [m.id, m]));

/* =========================================================
   Helpers
   ========================================================= */
const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function escapeHTML(str = "") {
  return String(str ?? "").replace(/[&<>"']/g, s => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;",
  }[s]));
}
const escapeAttr = escapeHTML;

function fmtTime(ts) {
  if (!ts) return "";
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

async function sha256Hex(str) {
  const buf = new TextEncoder().encode(str);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, "0")).join("");
}
function contentKey(m) {
  return [
    (m.url || "").trim(),
    (m.iqbalComment || "").trim(),
    (m.zulaikhaComment || "").trim(),
    (m.mood || "").trim(),
  ].join("\u0001");
}

/* =========================================================
   Platform detection + logo tile (no video embeds)
   ========================================================= */
function detectPlatform(url, declared) {
  if (declared) return declared;
  try {
    const h = new URL(url).hostname.replace(/^www\./, "");
    if (h.endsWith("tiktok.com"))    return "tiktok";
    if (h.endsWith("instagram.com")) return "instagram";
    if (h.endsWith("youtube.com") || h === "youtu.be") return "youtube";
    if (h.endsWith("threads.com") || h.endsWith("threads.net")) return "threads";
  } catch {}
  return "link";
}

function platformDisplayName(p) {
  return { tiktok: "TikTok", instagram: "Instagram", youtube: "YouTube", threads: "Threads", link: "Link" }[p] || "Link";
}

function platformGlyphSVG(p) {
  switch (p) {
    case "tiktok":
      return `<svg class="glyph-svg" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.69 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/></svg>`;
    case "instagram":
      return `<svg class="glyph-svg ig" viewBox="0 0 24 24" aria-hidden="true"><path fill="#E4405F" d="M12 2.2c3.2 0 3.6 0 4.9.1 1.2.1 1.9.2 2.4.4.6.2 1 .5 1.5 1 .5.5.8.9 1 1.5.2.5.4 1.2.4 2.4.1 1.3.1 1.7.1 4.9s0 3.6-.1 4.9c-.1 1.2-.2 1.9-.4 2.4-.2.6-.5 1-1 1.5-.5.5-.9.8-1.5 1-.5.2-1.2.4-2.4.4-1.3.1-1.7.1-4.9.1s-3.6 0-4.9-.1c-1.2-.1-1.9-.2-2.4-.4-.6-.2-1-.5-1.5-1-.5-.5-.8-.9-1-1.5-.2-.5-.4-1.2-.4-2.4-.1-1.3-.1-1.7-.1-4.9s0-3.6.1-4.9c.1-1.2.2-1.9.4-2.4.2-.6.5-1 1-1.5.5-.5.9-.8 1.5-1 .5-.2 1.2-.4 2.4-.4 1.3-.1 1.7-.1 4.9-.1zm0 2.2c-3.1 0-3.5 0-4.7.1-.9 0-1.4.2-1.7.3-.4.2-.7.4-1 .7-.3.3-.5.6-.7 1-.1.3-.3.8-.3 1.7-.1 1.2-.1 1.6-.1 4.7s0 3.5.1 4.7c0 .9.2 1.4.3 1.7.2.4.4.7.7 1 .3.3.6.5 1 .7.3.1.8.3 1.7.3 1.2.1 1.6.1 4.7.1s3.5 0 4.7-.1c.9 0 1.4-.2 1.7-.3.4-.2.7-.4 1-.7.3-.3.5-.6.7-1 .1-.3.3-.8.3-1.7.1-1.2.1-1.6.1-4.7s0-3.5-.1-4.7c0-.9-.2-1.4-.3-1.7-.2-.4-.4-.7-.7-1-.3-.3-.6-.5-1-.7-.3-.1-.8-.3-1.7-.3-1.2-.1-1.6-.1-4.7-.1zm0 3.3a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13zm0 10.7a4.2 4.2 0 1 0 0-8.4 4.2 4.2 0 0 0 0 8.4zm6.6-11a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0z"/></svg>`;
    case "youtube":
      return `<svg class="glyph-svg" viewBox="0 0 24 24" aria-hidden="true"><path fill="#FF0033" d="M21.8 8.2s-.2-1.6-.8-2.3c-.8-.8-1.7-.8-2.1-.9C16.5 4.5 12 4.5 12 4.5s-4.5 0-6.9.5c-.4.1-1.3.1-2.1.9-.6.7-.8 2.3-.8 2.3S2 10 2 11.8v.4c0 1.8.3 3.6.3 3.6s.2 1.6.8 2.3c.8.8 1.9.8 2.4.9 1.7.2 7.5.5 7.5.5s4.5 0 6.9-.5c.4-.1 1.3-.1 2.1-.9.6-.7.8-2.3.8-2.3s.3-1.8.3-3.6v-.4c0-1.8-.3-3.6-.3-3.6z"/><path fill="#fff" d="M10 15V9l6 3-6 3z"/></svg>`;
    case "threads":
      return `<svg class="glyph-svg threads-at" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 4a8 8 0 1 0 8 8h-2a6 6 0 1 1-6-6V4zm2 4c1.66 0 3 1 3 3 0 2.5-2 4-5 4H9v-2h3c1.6 0 2.5-.8 2.5-2 0-.9-.7-1.5-1.8-1.5S11 9.7 11 11v7H9V11c0-2 1.6-3.5 4-3.5z"/></svg>`;
    default:
      return `<svg class="glyph-svg" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/></svg>`;
  }
}

function platformTileHTML(url, platform) {
  const label = platformDisplayName(platform);
  const safeUrl = escapeAttr(url || "#");
  return `
    <a class="platform-tile pl-${platform}" href="${safeUrl}" target="_blank" rel="noopener noreferrer">
      <span class="platform-tile-icon" aria-hidden="true">${platformGlyphSVG(platform)}</span>
      <span class="platform-tile-meta">
        <span class="platform-tile-name">${escapeHTML(label)}</span>
        <span class="platform-tile-hint">open link ↗</span>
      </span>
    </a>`;
}

/* =========================================================
   Who is on this device?
   ========================================================= */
function getIdentity() {
  try {
    const v = localStorage.getItem(IDENTITY_KEY);
    if (v === "iqbal" || v === "zulaikha") return v;
  } catch {}
  return null;
}

function setIdentity(who) {
  try {
    if (who === "iqbal" || who === "zulaikha") localStorage.setItem(IDENTITY_KEY, who);
    else localStorage.removeItem(IDENTITY_KEY);
  } catch {}
}

function syncIdentityBarUI() {
  const who = getIdentity();
  $$(".identity-pill").forEach(btn => {
    const on = btn.dataset.identity === who;
    btn.classList.toggle("is-active", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  });
}

function setupIdentityBar(getMemories, rerender) {
  $$(".identity-pill").forEach(btn => {
    btn.addEventListener("click", () => {
      setIdentity(btn.dataset.identity);
      syncIdentityBarUI();
      rerender(getMemories(), activeFilter);
    });
  });
  syncIdentityBarUI();
}

/** One-shot emoji strip for add-memory modal */
function bindEmojiStrip(containerSel, hiddenSel) {
  const container = $(containerSel);
  const hidden = $(hiddenSel);
  if (!container || !hidden) return;
  container.innerHTML = NOTE_EMOJIS.map(e =>
    `<button type="button" class="emoji-opt" data-emoji="${escapeAttr(e)}">${e}</button>`
  ).join("");
  container.onclick = ev => {
    const b = ev.target.closest(".emoji-opt");
    if (!b) return;
    const em = b.dataset.emoji;
    if (hidden.value === em) {
      hidden.value = "";
      $$(".emoji-opt", container).forEach(x => x.classList.remove("is-selected"));
    } else {
      hidden.value = em;
      $$(".emoji-opt", container).forEach(x => x.classList.remove("is-selected"));
      b.classList.add("is-selected");
    }
  };
}

/** Rebuild strip + selection for note-edit modal */
function fillEmojiStrip(containerId, hiddenInputId, selectedVal = "") {
  const container = document.getElementById(containerId);
  const hidden = document.getElementById(hiddenInputId);
  if (!container || !hidden) return;
  hidden.value = selectedVal || "";
  container.innerHTML = NOTE_EMOJIS.map(e => {
    const sel = e === selectedVal ? " is-selected" : "";
    return `<button type="button" class="emoji-opt${sel}" data-emoji="${escapeAttr(e)}">${e}</button>`;
  }).join("");
  container.onclick = ev => {
    const b = ev.target.closest(".emoji-opt");
    if (!b) return;
    const em = b.dataset.emoji;
    if (hidden.value === em) {
      hidden.value = "";
      $$(".emoji-opt", container).forEach(x => x.classList.remove("is-selected"));
    } else {
      hidden.value = em;
      $$(".emoji-opt", container).forEach(x => x.classList.remove("is-selected"));
      b.classList.add("is-selected");
    }
  };
}

function setupNoteEditorModal(getMemories) {
  const modal = $("#note-edit-modal");
  const form = $("#note-edit-form");
  if (!modal || !form) return;

  const closeNote = () => {
    modal.classList.remove("is-open");
    if (!$("#add-modal")?.classList.contains("is-open")) document.body.style.overflow = "";
  };

  const openNote = ({ memoryId, owner, comment, emoji }) => {
    $("#note-edit-memory-id").value = memoryId || "";
    $("#note-edit-owner").value = owner || "";
    $("#note-edit-comment").value = comment || "";
    const lede = $("#note-edit-lede");
    if (lede) {
      lede.textContent = owner === "iqbal"
        ? "Iqbal — your note and emoji."
        : "Zulaikha — your note and emoji.";
    }
    fillEmojiStrip("note-edit-emoji-strip", "note-edit-emoji-val", emoji || "");
    modal.classList.add("is-open");
    document.body.style.overflow = "hidden";
    setTimeout(() => $("#note-edit-comment")?.focus(), 120);
  };

  document.addEventListener("click", e => {
    const addBtn = e.target.closest("[data-add-note]");
    if (addBtn) {
      e.preventDefault();
      openNote({
        memoryId: addBtn.dataset.memoryId,
        owner: addBtn.dataset.owner,
        comment: "",
        emoji: "",
      });
      return;
    }
    const edBtn = e.target.closest("[data-edit-note]");
    if (edBtn) {
      const mem = getMemories().find(m => m.id === edBtn.dataset.memoryId);
      if (!mem) return;
      const owner = edBtn.dataset.owner;
      const comment = owner === "iqbal" ? mem.iqbalComment : mem.zulaikhaComment;
      const emoji = owner === "iqbal" ? (mem.iqbalEmoji || "") : (mem.zulaikhaEmoji || "");
      openNote({
        memoryId: mem.id,
        owner,
        comment: comment || "",
        emoji: emoji || "",
      });
    }
  });

  modal.addEventListener("click", e => { if (e.target === modal) closeNote(); });
  modal.querySelectorAll("[data-close-note]").forEach(el => el.addEventListener("click", closeNote));

  form.addEventListener("submit", async e => {
    e.preventDefault();
    const memoryId = $("#note-edit-memory-id").value;
    const owner = $("#note-edit-owner").value;
    const comment = ($("#note-edit-comment").value || "").trim();
    const emojiRaw = ($("#note-edit-emoji-val").value || "").trim();
    if (!comment || !memoryId || !owner) return;

    const submitBtn = form.querySelector(".btn-primary");
    submitBtn.disabled = true;
    try {
      const ref = fs.doc(db, COL_NAME, memoryId);
      const patch = {};
      if (owner === "iqbal") {
        patch.iqbalComment = comment;
        patch.iqbalEmoji = emojiRaw || null;
      } else {
        patch.zulaikhaComment = comment;
        patch.zulaikhaEmoji = emojiRaw || null;
      }
      await fs.updateDoc(ref, patch);
      closeNote();
      toast("saved ♡");
    } catch (err) {
      console.error(err);
      toast("couldn't save note", true);
    } finally {
      submitBtn.disabled = false;
    }
  });
}

function setupGlobalEscape() {
  document.addEventListener("keydown", e => {
    if (e.key !== "Escape") return;
    const noteM = $("#note-edit-modal");
    const addM = $("#add-modal");
    if (noteM?.classList.contains("is-open")) {
      noteM.classList.remove("is-open");
      document.body.style.overflow = addM?.classList.contains("is-open") ? "hidden" : "";
      return;
    }
    if (addM?.classList.contains("is-open")) {
      addM.classList.remove("is-open");
      document.body.style.overflow = "";
    }
  });
}

/* =========================================================
   Card rendering — bubbles + optional per-side emoji
   ========================================================= */
function moodPillHTML(moodId) {
  const m = moodById[moodId] || { emoji: "✿", label: moodId || "soft", tone: "cream" };
  return `<span class="mood-pill tone-${m.tone}">
    <span class="emo">${m.emoji}</span>${escapeHTML(m.label)}
  </span>`;
}

function bubbleFilled(owner, text, emoji, memoryId, canEdit) {
  const who = owner === "iqbal" ? "Iqbal" : "Zulaikha";
  const initial = owner === "iqbal" ? "I" : "Z";
  const em = emoji ? `<span class="bubble-emoji" aria-hidden="true">${escapeHTML(emoji)}</span>` : "";
  const edit = canEdit
    ? `<button type="button" class="bubble-edit" data-edit-note data-memory-id="${escapeAttr(memoryId)}" data-owner="${owner}" aria-label="Edit your note">edit</button>`
    : "";
  return `
    <div class="bubble ${owner} has-text">
      <div class="bubble-av">${initial}</div>
      <div class="bubble-body">
        <div class="bubble-top">
          <span class="bubble-who">${who}</span>
          ${em}
          ${edit}
        </div>
        <p>${escapeHTML(text)}</p>
      </div>
    </div>`;
}

function bubbleWaiting(owner) {
  const who = owner === "iqbal" ? "Iqbal" : "Zulaikha";
  const initial = owner === "iqbal" ? "I" : "Z";
  return `
    <div class="bubble slot-waiting ${owner}">
      <div class="bubble-av ghost">${initial}</div>
      <p class="slot-waiting-text"><span class="na">${who}</span> hasn’t added a note yet</p>
    </div>`;
}

function bubbleAddButton(memoryId, owner) {
  return `
    <div class="bubble slot-add ${owner}">
      <button type="button" class="bubble-add-btn" data-add-note data-memory-id="${escapeAttr(memoryId)}" data-owner="${owner}">
        <span class="plus-soft">+</span> Add your note
      </button>
    </div>`;
}

function slotForOwner(m, owner, identity) {
  const commentKey = owner === "iqbal" ? "iqbalComment" : "zulaikhaComment";
  const emojiKey   = owner === "iqbal" ? "iqbalEmoji"   : "zulaikhaEmoji";
  const text = m[commentKey];
  const emo  = m[emojiKey] || "";

  if (text) {
    const canEdit = identity === owner;
    return bubbleFilled(owner, text, emo, m.id, canEdit);
  }
  if (identity === owner) return bubbleAddButton(m.id, owner);
  return bubbleWaiting(owner);
}

function memoryCardHTML(m, identity) {
  const platform = detectPlatform(m.url, m.platform);
  const both = m.iqbalComment && m.zulaikhaComment;
  const ownerTag = both ? "both" : (m.iqbalComment ? "iqbal" : (m.zulaikhaComment ? "zulaikha" : "none"));
  const idBanner = !identity
    ? `<div class="identity-banner" role="note">Choose <strong>who you are</strong> above first — then you can leave your note here.</div>`
    : "";

  return `
    <article class="memory" data-id="${escapeAttr(m.id)}" data-mood="${escapeAttr(m.mood || "")}" data-owner="${ownerTag}">
      <div class="top">
        <span class="platform-tag pl-${platform}">${escapeHTML(platform)}</span>
        ${moodPillHTML(m.mood)}
        <span class="timestamp">${fmtTime(m.createdAt)}</span>
      </div>
      ${platformTileHTML(m.url, platform)}
      <div class="bubbles">
        ${idBanner}
        ${slotForOwner(m, "zulaikha", identity)}
        ${slotForOwner(m, "iqbal", identity)}
      </div>
      <div class="card-foot">
        <span class="open-link muted-link" title="Use the tile above">watch on ${escapeHTML(platformDisplayName(platform))} ↗</span>
        <button class="react" type="button" data-react="${escapeAttr(m.id)}">
          <span class="heart">♡</span><span class="count">${Number(m.reactions || 0)}</span>
        </button>
      </div>
    </article>
  `;
}

function renderFeed(memories, filter) {
  const grid = $("#feed");
  const empty = $("#empty-state");
  const list = applyFilter(memories, filter);
  const identity = getIdentity();

  if (!list.length) {
    grid.innerHTML = "";
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  grid.innerHTML = list.map(m => memoryCardHTML(m, identity)).join("");
  syncIdentityBarUI();

  updateFilterCounts(memories);
}

function applyFilter(list, filter) {
  if (!filter || filter === "all") return list;
  if (filter === "iqbal")    return list.filter(m => m.iqbalComment);
  if (filter === "zulaikha") return list.filter(m => m.zulaikhaComment);
  if (filter === "both")     return list.filter(m => m.iqbalComment && m.zulaikhaComment);
  if (filter.startsWith("mood:")) {
    const mood = filter.slice(5);
    return list.filter(m => m.mood === mood);
  }
  return list;
}

function updateFilterCounts(memories) {
  const set = (sel, n) => { const el = $(sel); if (el) el.textContent = n; };
  set('[data-count="all"]',      memories.length);
  set('[data-count="zulaikha"]', memories.filter(m => m.zulaikhaComment).length);
  set('[data-count="iqbal"]',    memories.filter(m => m.iqbalComment).length);
  set('[data-count="both"]',     memories.filter(m => m.iqbalComment && m.zulaikhaComment).length);
}

/* =========================================================
   Filter pills
   ========================================================= */
let activeFilter = "all";
function setupFilters(getMemories, rerender) {
  $$(".filter-pill").forEach(btn => {
    btn.addEventListener("click", () => {
      $$(".filter-pill").forEach(b => { b.classList.remove("is-active"); b.setAttribute("aria-pressed", "false"); });
      btn.classList.add("is-active");
      btn.setAttribute("aria-pressed", "true");
      activeFilter = btn.dataset.filter;
      rerender(getMemories(), activeFilter);
    });
  });
}

/* =========================================================
   Modal — add memory
   ========================================================= */
function setupModal(onSubmit) {
  const modal = $("#add-modal");
  const openBtn = $("#open-add");
  const form = $("#add-form");

  const grid = $("#mood-grid");
  grid.innerHTML = MOODS.map((m, i) => `
    <input type="radio" id="mood-${m.id}" name="mood" value="${escapeAttr(m.id)}" ${i === 0 ? "checked" : ""}>
    <label for="mood-${m.id}" title="${escapeAttr(m.label)}">
      <span class="emo">${m.emoji}</span>
      <span class="lbl">${escapeHTML(m.label)}</span>
    </label>
  `).join("");

  const open = () => {
    modal.classList.add("is-open");
    document.body.style.overflow = "hidden";
    setTimeout(() => $("#mem-link")?.focus(), 200);
  };
  const close = () => {
    modal.classList.remove("is-open");
    document.body.style.overflow = "";
  };

  openBtn.addEventListener("click", open);
  modal.addEventListener("click", e => { if (e.target === modal) close(); });
  modal.querySelectorAll("[data-close]").forEach(el => el.addEventListener("click", close));

  bindEmojiStrip("#emoji-strip-z", "#field-z-emoji");
  bindEmojiStrip("#emoji-strip-i", "#field-i-emoji");

  form.addEventListener("submit", async e => {
    e.preventDefault();
    const data = new FormData(form);
    const zEmo = (data.get("zulaikhaEmoji") || "").toString().trim();
    const iEmo = (data.get("iqbalEmoji") || "").toString().trim();
    const payload = {
      url: (data.get("url") || "").toString().trim(),
      iqbalComment:    (data.get("iqbalComment")    || "").toString().trim() || null,
      zulaikhaComment: (data.get("zulaikhaComment") || "").toString().trim() || null,
      iqbalEmoji:    iEmo || null,
      zulaikhaEmoji: zEmo || null,
      mood: (data.get("mood") || "soft_emotional").toString(),
    };
    if (!payload.url) { $("#mem-link")?.focus(); return; }
    payload.platform = detectPlatform(payload.url);

    const submitBtn = form.querySelector(".btn-primary");
    submitBtn.disabled = true; submitBtn.textContent = "saving…";
    try {
      await onSubmit(payload);
      form.reset();
      grid.querySelector("input")?.click();
      bindEmojiStrip("#emoji-strip-z", "#field-z-emoji");
      bindEmojiStrip("#emoji-strip-i", "#field-i-emoji");
      close();
      toast("saved to our archive ♡");
    } catch (err) {
      console.error(err);
      toast("couldn't save — check Firestore rules", true);
    } finally {
      submitBtn.disabled = false; submitBtn.textContent = "save memory";
    }
  });
}

/* =========================================================
   Toast
   ========================================================= */
function toast(message, isError = false) {
  let host = $("#toast-host");
  if (!host) {
    host = document.createElement("div");
    host.id = "toast-host";
    document.body.appendChild(host);
  }
  const el = document.createElement("div");
  el.className = "toast" + (isError ? " is-error" : "");
  el.textContent = message;
  host.appendChild(el);
  setTimeout(() => el.classList.add("show"), 20);
  setTimeout(() => { el.classList.remove("show"); setTimeout(() => el.remove(), 400); }, 2600);
}

/* =========================================================
   Reactions
   ========================================================= */
function setupReactions(getMemories) {
  document.addEventListener("click", async e => {
    const btn = e.target.closest("[data-react]");
    if (!btn) return;
    const id = btn.dataset.react;
    const mem = getMemories().find(m => m.id === id);
    if (!mem) return;

    const next = (mem.reactions || 0) + 1;
    const span = btn.querySelector(".count");
    if (span) span.textContent = next;
    btn.animate(
      [{ transform: "scale(1)" }, { transform: "scale(1.18)" }, { transform: "scale(1)" }],
      { duration: 280, easing: "cubic-bezier(.2,.8,.2,1)" }
    );

    try {
      const ref = fs.doc(db, COL_NAME, id);
      await fs.setDoc(ref, { reactions: next }, { merge: true });
    } catch (err) {
      console.warn("reaction save failed", err);
    }
  });
}

/* =========================================================
   Ambient floating hearts
   ========================================================= */
function spawnAmbient() {
  const host = $("#ambient-floats");
  if (!host) return;
  const symbols = ["♡", "✿", "✧", "❀", "✦"];
  const colors  = ["#F4A6BC", "#C9B7EC", "#FBD0DA", "#E9DCF7"];
  const make = () => {
    const el = document.createElement("span");
    el.className = Math.random() > 0.5 ? "heart" : "sparkle";
    el.textContent = symbols[Math.floor(Math.random() * symbols.length)];
    el.style.left = Math.random() * 100 + "vw";
    el.style.bottom = "-20px";
    el.style.color = colors[Math.floor(Math.random() * colors.length)];
    el.style.animationDuration = (16 + Math.random() * 12) + "s";
    el.style.fontSize = (10 + Math.random() * 12) + "px";
    host.appendChild(el);
    setTimeout(() => el.remove(), 30000);
  };
  for (let i = 0; i < 4; i++) setTimeout(make, i * 800);
  setInterval(make, 3200);
}

/* =========================================================
   Firestore: live data + smart hash-based seeder
   - For each entry in seed-data.js, we compute a stable
     content-hash and use it as the Firestore document id.
   - On every load we upload only entries whose content
     hash isn't already present in Firestore.
   - Manually-added entries (modal) keep auto-ids and are
     ignored by the seeder.
   ========================================================= */
async function syncSeed() {
  const col = fs.collection(db, COL_NAME);
  const snap = await fs.getDocs(col);
  const wasEmpty = snap.empty;

  // Build set of existing content hashes (covers both
  // hash-id docs and any older auto-id docs from a previous seed)
  const existingHashes = new Set();
  for (const d of snap.docs) {
    const data = d.data();
    existingHashes.add(await sha256Hex(contentKey(data)));
  }

  // Find seed entries whose content isn't yet in the cloud
  const toAdd = [];
  for (let i = 0; i < SEED_MEMORIES.length; i++) {
    const m = SEED_MEMORIES[i];
    const h = await sha256Hex(contentKey(m));
    if (existingHashes.has(h)) continue;
    existingHashes.add(h); // dedupe within seed-data.js too
    toAdd.push({ m, hash: h, index: i });
  }

  if (!toAdd.length) return { added: 0, wasEmpty };

  if (wasEmpty) toast("uploading our archive to the cloud…");
  else          toast(`syncing ${toAdd.length} new ${toAdd.length === 1 ? "memory" : "memories"}…`);

  const now = Date.now();
  const batch = fs.writeBatch(db);
  for (const { m, hash, index } of toAdd) {
    const ref = fs.doc(col, hash);
    batch.set(ref, {
      url: m.url,
      platform: m.platform,
      iqbalComment:    m.iqbalComment    ?? null,
      zulaikhaComment: m.zulaikhaComment ?? null,
      mood: m.mood,
      reactions: 0,
      createdAt: fs.Timestamp.fromMillis(now - index * 60_000),
      order: SEED_MEMORIES.length - index,
      seeded: true,
    }, { merge: true });
  }
  await batch.commit();

  if (wasEmpty) toast("archive uploaded ♡");
  else          toast(`added ${toAdd.length} new ${toAdd.length === 1 ? "memory" : "memories"} ♡`);

  return { added: toAdd.length, wasEmpty };
}

function subscribeMemories(onChange) {
  const q = fs.query(fs.collection(db, COL_NAME), fs.orderBy("createdAt", "desc"));
  return fs.onSnapshot(
    q,
    snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      onChange(list);
    },
    err => {
      console.error("[firestore] subscribe error", err);
      toast("couldn't read from cloud — check Firestore rules", true);
    }
  );
}

async function addMemoryToFirestore(payload) {
  const col = fs.collection(db, COL_NAME);
  await fs.addDoc(col, {
    ...payload,
    reactions: 0,
    createdAt: fs.serverTimestamp(),
    order: Date.now(),
  });
}

/* =========================================================
   Boot
   ========================================================= */
async function boot() {
  let memories = [];
  const getMemories = () => memories;
  const rerender = (list, filter = activeFilter) => renderFeed(list, filter);

  setupFilters(getMemories, rerender);
  setupIdentityBar(getMemories, rerender);
  setupModal(addMemoryToFirestore);
  setupNoteEditorModal(getMemories);
  setupGlobalEscape();
  setupReactions(getMemories);
  spawnAmbient();

  $("#feed").innerHTML = `<div class="feed-loading">loading our little archive…</div>`;

  try {
    await syncSeed();
  } catch (err) {
    console.error("[seed] failed", err);
    toast("seed failed — see console & Firestore rules", true);
  }

  subscribeMemories(list => {
    memories = list;
    rerender(list, activeFilter);
  });
}

document.addEventListener("DOMContentLoaded", boot);
