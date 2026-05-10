<?php
$pageTitle = 'Iqbal & Zulaikha — our little archive';
$pageDesc  = 'A soft, private memory archive — reels, songs and tiny moments shared between Iqbal & Zulaikha.';
?>
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="#FBD8D9">
  <title><?php echo htmlspecialchars($pageTitle, ENT_QUOTES, 'UTF-8'); ?></title>
  <meta name="description" content="<?php echo htmlspecialchars($pageDesc, ENT_QUOTES, 'UTF-8'); ?>">

  <link rel="icon" href="favicon.ico" sizes="any">
  <link rel="shortcut icon" href="favicon.ico">
  <link rel="apple-touch-icon" href="favicon.ico">

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;1,9..144,400;1,9..144,500&family=Inter:wght@400;500;600&family=Caveat:wght@500;600&display=swap" rel="stylesheet">

  <link rel="stylesheet" href="assets/css/style.css">
</head>
<body>
  <div class="ambient" aria-hidden="true">
    <div class="blob b1"></div>
    <div class="blob b2"></div>
    <div class="blob b3"></div>
    <div id="ambient-floats"></div>
  </div>

  <main class="shell">
    <header class="hero">
      <span class="badge"><span class="dot"></span> Our private archive</span>
      <h1>Iqbal <span class="amp">&amp;</span> Zulaikha</h1>
      <p class="subtitle">A quiet little corner of the internet — for the reels, the songs and the tiny moments we never want to forget.</p>
      <div class="scribble">made with love &#9825;</div>
    </header>

    <nav class="filter-bar" aria-label="Filter memories">
      <button class="filter-pill is-active" data-filter="all" aria-pressed="true">
        <span class="dot all"></span> all <span class="num" data-count="all">0</span>
      </button>
      <button class="filter-pill" data-filter="zulaikha" aria-pressed="false">
        <span class="dot z"></span> Zulaikha&rsquo;s notes <span class="num" data-count="zulaikha">0</span>
      </button>
      <button class="filter-pill" data-filter="iqbal" aria-pressed="false">
        <span class="dot i"></span> Iqbal&rsquo;s notes <span class="num" data-count="iqbal">0</span>
      </button>
      <button class="filter-pill" data-filter="both" aria-pressed="false">
        <span class="dot both"></span> both wrote <span class="num" data-count="both">0</span>
      </button>
    </nav>

    <section class="feed" id="feed" aria-live="polite"></section>

    <div class="empty" id="empty-state" hidden>
      <div class="glyph">&#10047;</div>
      <h3>nothing matches yet</h3>
      <p>try a different filter, or tap <strong>+ Add a memory</strong> to begin.</p>
    </div>

    <p class="kbd-hint">tap <kbd>+</kbd> to leave a new memory &middot; <kbd>esc</kbd> closes the sheet</p>
  </main>

  <button class="fab" id="open-add" aria-haspopup="dialog" aria-controls="add-modal">
    <span class="plus">+</span>
    <span>Add a memory</span>
  </button>

  <div class="modal" id="add-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
    <form class="sheet" id="add-form" novalidate>
      <div class="grabber" aria-hidden="true"></div>
      <h2 id="modal-title">leave a new memory</h2>
      <p class="lede">paste a TikTok, Instagram reel, YouTube or Threads link &mdash; leave a note from either side, or both.</p>

      <div class="field">
        <label for="mem-link">link</label>
        <input id="mem-link" name="url" type="url" inputmode="url" placeholder="https://vt.tiktok.com/&hellip; &middot; instagram.com/reel/&hellip; &middot; threads.com/@&hellip;" required>
      </div>

      <div class="field">
        <label for="z-comment">Zulaikha&rsquo;s note <span class="opt">(optional)</span></label>
        <textarea id="z-comment" name="zulaikhaComment" rows="2" placeholder="say something soft from Zulaikha&hellip;"></textarea>
      </div>

      <div class="field">
        <label for="i-comment">Iqbal&rsquo;s note <span class="opt">(optional)</span></label>
        <textarea id="i-comment" name="iqbalComment" rows="2" placeholder="say something soft from Iqbal&hellip;"></textarea>
      </div>

      <div class="field">
        <label>mood</label>
        <div class="mood-grid" id="mood-grid"></div>
      </div>

      <div class="actions">
        <button type="button" class="btn btn-ghost" data-close>cancel</button>
        <button type="submit" class="btn btn-primary">save memory</button>
      </div>
    </form>
  </div>

  <script type="module" src="assets/js/firebase-init.js"></script>
  <script type="module" src="assets/js/app.js"></script>
</body>
</html>
