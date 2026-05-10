/* =========================================================
   Iqbal & Zulaikha Archive — App logic (Firestore-backed)
   - Live Firestore subscription
   - Smart hash-based seeder: uploads only entries that
     aren't already in Firestore (safe to re-run any time
     you grow seed-data.js)
   - Dual-comment memory cards (Iqbal + Zulaikha bubbles)
   - Mood-aware visuals, filter pills
   - Embed support: TikTok (short links via embed.js),
     Instagram reels, YouTube, Threads (via embed.js)
   ========================================================= */

import { db, fs } from "./firebase-init.js";
import { SEED_MEMORIES } from "./seed-data.js";

const COL_NAME = "memories";

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
   Embed parsing
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

function buildEmbed(url, platform) {
  if (!url) return null;
  let u;
  try { u = new URL(url.trim()); } catch { return null; }

  if (platform === "youtube" || u.hostname.endsWith("youtube.com") || u.hostname === "youtu.be") {
    let id = null, portrait = false;
    if (u.hostname === "youtu.be") id = u.pathname.split("/").filter(Boolean)[0];
    else if (u.pathname.startsWith("/shorts/")) { id = u.pathname.split("/")[2]; portrait = true; }
    else id = u.searchParams.get("v");
    if (id) return { kind: "iframe", src: `https://www.youtube.com/embed/${id}`, portrait };
  }

  if (platform === "tiktok" || u.hostname.endsWith("tiktok.com")) {
    return { kind: "tiktok-blockquote", url: u.href, portrait: true };
  }

  if (platform === "instagram" || u.hostname.endsWith("instagram.com")) {
    const parts = u.pathname.split("/").filter(Boolean);
    const idx = parts.findIndex(p => ["p", "reel", "reels", "tv"].includes(p));
    const code = idx >= 0 ? parts[idx + 1] : null;
    if (code) {
      const portrait = parts[idx] !== "p";
      return { kind: "iframe", src: `https://www.instagram.com/reel/${code}/embed/`, portrait };
    }
  }

  if (platform === "threads" || u.hostname.endsWith("threads.com") || u.hostname.endsWith("threads.net")) {
    // Normalize to threads.net so the official embed.js processes it cleanly.
    const normalized = u.href.replace("://www.threads.com/", "://www.threads.net/")
                              .replace("://threads.com/",     "://threads.net/");
    return { kind: "threads-blockquote", url: normalized, portrait: false };
  }

  return { kind: "link", url: u.href };
}

function embedHTML(embed, fallbackUrl) {
  if (!embed) return embedFallback(fallbackUrl);

  if (embed.kind === "iframe") {
    return `<div class="embed${embed.portrait ? " portrait" : ""}">
      <iframe src="${escapeAttr(embed.src)}" loading="lazy"
        allow="autoplay; encrypted-media; picture-in-picture; clipboard-write"
        allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>
    </div>`;
  }

  if (embed.kind === "tiktok-blockquote") {
    return `<div class="embed portrait tiktok-host">
      <blockquote class="tiktok-embed" cite="${escapeAttr(embed.url)}" data-video-id="">
        <section><a target="_blank" rel="noopener" href="${escapeAttr(embed.url)}">Watch on TikTok</a></section>
      </blockquote>
    </div>`;
  }

  if (embed.kind === "threads-blockquote") {
    return `<div class="embed threads-host">
      <blockquote class="text-post-media" data-text-post-permalink="${escapeAttr(embed.url)}" data-text-post-version="0" style="background:transparent;border:0;margin:0;padding:0;">
        <a target="_blank" rel="noopener" href="${escapeAttr(embed.url)}">View on Threads</a>
      </blockquote>
    </div>`;
  }

  return embedFallback(fallbackUrl);
}

function embedFallback(url) {
  return `<div class="embed">
    <div class="embed-fallback">
      couldn't preview this — <a href="${escapeAttr(url || "#")}" target="_blank" rel="noopener">open it instead</a>
    </div>
  </div>`;
}

/* ----- Third-party embed scripts (load once, re-process on render) ----- */
function loadOnce(id, src) {
  if (document.getElementById(id)) return;
  const s = document.createElement("script");
  s.id = id; s.src = src; s.async = true;
  document.body.appendChild(s);
}
function reinjectScript(src) {
  // Re-injecting the script forces these embed libs to scan the DOM again.
  const s = document.createElement("script");
  s.src = src; s.async = true;
  document.body.appendChild(s);
}
function reprocessEmbeds(platforms) {
  if (platforms.has("tiktok")) {
    if (window.tiktokEmbedLoad) { try { window.tiktokEmbedLoad(); } catch {} }
    else reinjectScript("https://www.tiktok.com/embed.js");
  }
  if (platforms.has("threads")) {
    // Threads embed.js processes blockquotes on load; re-inject to refresh.
    reinjectScript("https://www.threads.net/embed.js");
  }
}

/* =========================================================
   Card rendering
   ========================================================= */
function bubbleHTML(owner, text) {
  if (!text) return "";
  const who = owner === "iqbal" ? "Iqbal" : "Zulaikha";
  const initial = owner === "iqbal" ? "I" : "Z";
  return `
    <div class="bubble ${owner}">
      <div class="bubble-av">${initial}</div>
      <div class="bubble-body">
        <span class="bubble-who">${who}</span>
        <p>${escapeHTML(text)}</p>
      </div>
    </div>
  `;
}

function moodPillHTML(moodId) {
  const m = moodById[moodId] || { emoji: "✿", label: moodId || "soft", tone: "cream" };
  return `<span class="mood-pill tone-${m.tone}">
    <span class="emo">${m.emoji}</span>${escapeHTML(m.label)}
  </span>`;
}

function memoryCardHTML(m) {
  const platform = detectPlatform(m.url, m.platform);
  const embed = buildEmbed(m.url, platform);
  const both = m.iqbalComment && m.zulaikhaComment;
  const ownerTag = both ? "both" : (m.iqbalComment ? "iqbal" : (m.zulaikhaComment ? "zulaikha" : "none"));

  return `
    <article class="memory" data-id="${escapeAttr(m.id)}" data-mood="${escapeAttr(m.mood || "")}" data-owner="${ownerTag}">
      <div class="top">
        <span class="platform pl-${platform}">${platform}</span>
        ${moodPillHTML(m.mood)}
        <span class="timestamp">${fmtTime(m.createdAt)}</span>
      </div>
      ${embedHTML(embed, m.url)}
      <div class="bubbles">
        ${bubbleHTML("zulaikha", m.zulaikhaComment)}
        ${bubbleHTML("iqbal",    m.iqbalComment)}
      </div>
      <div class="card-foot">
        <a class="open-link" href="${escapeAttr(m.url)}" target="_blank" rel="noopener">open original ↗</a>
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

  if (!list.length) {
    grid.innerHTML = "";
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  grid.innerHTML = list.map(memoryCardHTML).join("");

  // Re-process platform-specific embeds after DOM injection
  const platforms = new Set(list.map(m => detectPlatform(m.url, m.platform)));
  if (platforms.has("tiktok"))  loadOnce("tiktok-embed-js",  "https://www.tiktok.com/embed.js");
  if (platforms.has("threads")) loadOnce("threads-embed-js", "https://www.threads.net/embed.js");
  setTimeout(() => reprocessEmbeds(platforms), 60);

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
  document.addEventListener("keydown", e => { if (e.key === "Escape") close(); });

  form.addEventListener("submit", async e => {
    e.preventDefault();
    const data = new FormData(form);
    const payload = {
      url: (data.get("url") || "").toString().trim(),
      iqbalComment:    (data.get("iqbalComment")    || "").toString().trim() || null,
      zulaikhaComment: (data.get("zulaikhaComment") || "").toString().trim() || null,
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
  setupModal(addMemoryToFirestore);
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
