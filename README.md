# Iqbal & Zulaikha — our little archive

A soft, dreamy, mobile-first private archive for shared moments — TikToks, Instagram reels, YouTube clips — with a note from each side.

> _"this space belongs only to us."_

---

## Visual direction

- **Mood:** warm, cozy, romantic-without-cringe, dreamy.
- **Surfaces:** glassmorphism, soft shadows, blurred ambient blobs.
- **Shape language:** generous radii (16 → 32px), pill buttons, rounded fields.
- **Motion:** subtle float, fade-in cards, bottom-sheet modal — `prefers-reduced-motion` respected.

### Color palette (in `assets/css/style.css`)

| Token | Value | Use |
| --- | --- | --- |
| `--cream` | `#FFF7F2` | Page base |
| `--blush` | `#FBD8D9` | Soft surfaces |
| `--rose` | `#F4A6BC` | Primary accent |
| `--rose-deep` | `#E58AA6` | Hover/text accent |
| `--lavender` | `#E9DCF7` | Iqbal accents |
| `--lavender-deep` | `#C9B7EC` | Iqbal stronger accents |
| `--ink` | `#4A3B45` | Body text (never pure black) |

Comment bubbles:
- **Zulaikha** → blush → rose gradient
- **Iqbal** → lavender → soft violet gradient

### Typography

- Display / headings: `Fraunces` (italic for emotional accents)
- UI / body: `Inter`
- Handwritten accents: `Caveat`

Loaded via Google Fonts in `index.html` / `index.php`.

---

## Data model

Each memory is a single shared moment with optional notes from each side:

```jsonc
{
  "url":             "https://vt.tiktok.com/…",
  "platform":        "tiktok" | "instagram" | "youtube" | "threads",
  "uploadedBy":      "iqbal" | "zulaikha" | null,
  "iqbalComment":    "string | null",
  "zulaikhaComment": "string | null",
  "iqbalEmoji":      "string | null",
  "zulaikhaEmoji":   "string | null",
  "mood":            "sad | very_sad | broken | soft_emotional | neutral_soft | cute | cute_reaction |
                      reflection | warning_reflection | mixed_emotion | reaction_confused |
                      lighthearted | funny_reaction |
                      emotional_conflict | anger_emotional | anger_debate | controversial",
  "reactions":       0,
  "createdAt":       Timestamp,
  "order":           number,
  "seeded":          true   // present on entries pushed by the seeder
}
```

Stored in Firestore collection: **`memories`**.

Mood palette → see `MOODS` in `assets/js/app.js`.

---

## File structure

```
.
├── index.html              # static entry (GitHub Pages)
├── index.php               # local PHP entry (Laragon)
├── firestore.rules         # ready-to-paste Firestore rules
├── favicon.ico             # tab icon (visual identity anchor)
├── assets/
│   ├── css/style.css       # full design system
│   └── js/
│       ├── firebase-init.js  # Firebase + Firestore init (named exports)
│       ├── seed-data.js      # the 32-memory dataset (one-time seed)
│       └── app.js            # live Firestore, render, modal, embeds
└── README.md
```

---

## Sections

1. **Hero** — eyebrow badge, big italic title with gradient ampersand, soft subtitle, handwritten "made with love ♡".
2. **Filter bar** — `All / Zulaikha's notes / Iqbal's notes / Both wrote` (horizontally swipeable on mobile, centered on desktop).
3. **Feed** — responsive masonry-like grid: 1 col on mobile, 2 on tablet, 3 on desktop.
4. **Memory card** — platform pill, mood pill, timestamp, embedded video, dual chat-style bubbles for Z and I, original-link, soft heart reaction.
5. **Add Memory bottom-sheet modal** — link, both note fields, mood emoji grid, gradient primary button.
6. **Empty state** — soft glyph + gentle copy.
7. **Floating ambient layer** — drifting blurred blobs + occasional floating hearts/sparkles.

---

## Embed support

`assets/js/app.js → buildEmbed(url, platform)` understands:

- **TikTok** — including short links (`vt.tiktok.com/…`) via TikTok's official `embed.js` blockquote.
- **Instagram** — `instagram.com/reel/…`, `/p/…`, `/tv/…` via the official `/embed/` endpoint.
- **YouTube** — `youtube.com/watch?v=…`, `youtu.be/…`, `youtube.com/shorts/…` (auto 9:16 for Shorts).
- **Threads** — `threads.com/@user/post/…` and `threads.net/…` via Meta's official `embed.js` blockquote (URLs are auto-normalized to `threads.net` for the embed).

Portrait formats (TikTok / Reels / Shorts) auto-render in 9:16. TikTok and Threads cards use a taller flexible host so their native embeds aren't cropped.

---

## Firebase / Firestore

Already initialized with your config in `assets/js/firebase-init.js`.

### Smart hash-based seeder (idempotent)

The app uses a **content-hash sync** so it's safe to re-run any time you grow `seed-data.js`:

1. Open `index.html` (or `index.php`) in a browser.
2. For each entry in `seed-data.js`, the app computes a SHA-256 of `url + iqbalComment + zulaikhaComment + mood`. That hash is the Firestore doc id.
3. The seeder fetches every existing doc, builds a set of hashes already in the cloud, then **uploads only the entries that are missing**.
4. **First run** → `archive uploaded ♡`.
   **Adding new entries to `seed-data.js`** → `added N new memories ♡`.
   **Nothing new** → silent.
5. Manually-added entries (via the modal) keep auto-ids and are ignored by the seeder, so the seeder never touches your hand-typed notes.

> Adding a duplicate URL in `seed-data.js` is fine — as long as the comments or mood differ, it's a different content hash and gets its own card. Identical entries are deduped automatically.

> If the seed fails with permission errors, your Firestore rules are blocking writes — see below.

### Firestore rules

Open the [Firebase console → Firestore → Rules](https://console.firebase.google.com/project/iqbal-zulaikha-archive/firestore/rules) and paste the contents of `firestore.rules`.

There are **two modes** — use **MODE A first** to allow the seed to run:

```ruby
// MODE A — Open writes (use this for the initial seed)
match /memories/{id} {
  allow read, write: if true;
}
```

After your archive is seeded and you've added Firebase Auth, switch to **MODE B**:

```ruby
// MODE B — Lock to two emails (recommended afterwards)
match /memories/{id} {
  allow read, write: if request.auth != null
    && request.auth.token.email in [
      'iqbal@example.com',
      'zulaikha@example.com'
    ];
}
```

### Removing all data (e.g. to re-seed)

Firebase console → Firestore → `memories` collection → ⋮ → **Delete collection**. Refresh the app and it will re-seed automatically.

---

## Run locally

### With Laragon / PHP

Open: `http://localhost/IqbalZulaikhaArchive/`

### Static (no PHP)

Just open `index.html`, or run any static server:

```bash
npx serve .
```

> Browsers occasionally block third-party iframes when opened via `file://`. Prefer running through `localhost` or a static server.

---

## Deploy to GitHub Pages

1. Push the repo to GitHub.
2. **Settings → Pages → Build and deployment → Branch: `main` / root**.
3. Add your Pages URL to **Firebase → Authentication → Settings → Authorized domains** (only required once you wire up Auth).
4. Open the published URL — `index.html` is served automatically.

---

## Notes

- The visual identity is built around the existing `favicon.ico` at the project root — keep its blush/lavender hues if you ever swap it.
- No build step. No Tailwind. Class names are intentionally semantic so migrating to Tailwind utilities later is straightforward.
