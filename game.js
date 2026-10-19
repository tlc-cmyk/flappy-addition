(() => {
  "use strict";

  // ─── Defaults / settings ───────────────────────────────────────────
  const DEFAULTS = {
    difficulty: "auto", // "auto" | "1".."10"
    spacing: 450,       // px between pipe groups (thinking time)
    gravity: 0.40,
    jump: 6.5,
    speed: 1.6,
    gap: 140,           // vertical gap height per choice pipe
    showViz: true,
    sumMin: 5,          // addition sum range (inclusive)
    sumMax: 15,
  };

  const SUM_ABS_MIN = 2;
  const SUM_ABS_MAX = 20;

  const STORAGE_KEY = "flappy-addition-settings-v1";
  const MAX_LIVES = 3;
  const POINTS_PER_LEVEL = 10;
  const MAX_LEVEL = 10;

  let settings = loadSettings();

  function clampSum(n) {
    const v = Number(n);
    if (!Number.isFinite(v)) return DEFAULTS.sumMin;
    return Math.max(SUM_ABS_MIN, Math.min(SUM_ABS_MAX, Math.round(v)));
  }

  function normalizeSumRange(s) {
    let lo = clampSum(s.sumMin);
    let hi = clampSum(s.sumMax);
    if (lo > hi) {
      const t = lo;
      lo = hi;
      hi = t;
    }
    s.sumMin = lo;
    s.sumMax = hi;
    return s;
  }

  function loadSettings() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return normalizeSumRange({ ...DEFAULTS });
      return normalizeSumRange({ ...DEFAULTS, ...JSON.parse(raw) });
    } catch {
      return normalizeSumRange({ ...DEFAULTS });
    }
  }

  function saveSettings() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch { /* ignore */ }
  }

  // ─── DOM ───────────────────────────────────────────────────────────
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const hud = document.getElementById("hud");
  const scoreVal = document.getElementById("scoreVal");
  const levelVal = document.getElementById("levelVal");
  const livesEl = document.getElementById("livesEl");
  const eqText = document.getElementById("eqText");
  const eqViz = document.getElementById("eqViz");
  const startScreen = document.getElementById("startScreen");
  const overScreen = document.getElementById("overScreen");
  const settingsPanel = document.getElementById("settingsPanel");
  const toast = document.getElementById("toast");
  const btnMute = document.getElementById("btnMute");
  const btnSettings = document.getElementById("btnSettings");
  const btnStart = document.getElementById("btnStart");
  const btnRetry = document.getElementById("btnRetry");
  const btnHome = document.getElementById("btnHome");
  const btnDefaults = document.getElementById("btnDefaults");
  const btnCloseSettings = document.getElementById("btnCloseSettings");
  const finalScore = document.getElementById("finalScore");
  const finalLevel = document.getElementById("finalLevel");

  const setDifficulty = document.getElementById("setDifficulty");
  const setSpacing = document.getElementById("setSpacing");
  const setGravity = document.getElementById("setGravity");
  const setJump = document.getElementById("setJump");
  const setSpeed = document.getElementById("setSpeed");
  const setGap = document.getElementById("setGap");
  const setViz = document.getElementById("setViz");
  const setSumMin = document.getElementById("setSumMin");
  const setSumMax = document.getElementById("setSumMax");
  const outSpacing = document.getElementById("outSpacing");
  const outGravity = document.getElementById("outGravity");
  const outJump = document.getElementById("outJump");
  const outSpeed = document.getElementById("outSpeed");
  const outGap = document.getElementById("outGap");
  const outSumMin = document.getElementById("outSumMin");
  const outSumMax = document.getElementById("outSumMax");
  const startSumMin = document.getElementById("startSumMin");
  const startSumMax = document.getElementById("startSumMax");
  const outStartSumMin = document.getElementById("outStartSumMin");
  const outStartSumMax = document.getElementById("outStartSumMax");
  const sumRangePreview = document.getElementById("sumRangePreview");

  // ─── Audio (soft blips) ────────────────────────────────────────────
  let muted = false;
  let audioCtx = null;

  function ensureAudio() {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) audioCtx = new AC();
    }
    if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
  }

  function blip(freq, dur, type, vol) {
    if (muted || !audioCtx) return;
    const t0 = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type || "sine";
    osc.frequency.setValueAtTime(freq, t0);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol || 0.08, t0 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function sfxFlap() {
    blip(520, 0.07, "triangle", 0.06);
    blip(380, 0.09, "sine", 0.04);
  }
  function sfxScore() {
    blip(660, 0.08, "sine", 0.07);
    setTimeout(() => blip(880, 0.1, "sine", 0.06), 70);
  }
  function sfxHit() {
    blip(160, 0.18, "sawtooth", 0.05);
    blip(90, 0.22, "triangle", 0.04);
  }
  function sfxLevel() {
    blip(523, 0.08, "sine", 0.06);
    setTimeout(() => blip(659, 0.08, "sine", 0.06), 80);
    setTimeout(() => blip(784, 0.12, "sine", 0.07), 160);
  }

  // ─── Math generation (align with prior product prefs) ──────────────
  // Prefer: doubles, crossing-10; fewer pure 湊十; both addends often ≥ 4
  function randInt(a, b) {
    return a + Math.floor(Math.random() * (b - a + 1));
  }

  function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function makeQ(a, b) {
    return { a, b, answer: a + b };
  }

  function genWithin10() {
    // sums 2–10, prefer both ≥ 2
    let a = randInt(1, 8);
    let b = randInt(1, 10 - a);
    if (Math.random() < 0.35 && a >= 2 && b >= 2) {
      // occasional small double
      const d = randInt(2, 5);
      return makeQ(d, d);
    }
    return makeQ(a, b);
  }

  function genSmallAdd() {
    // both 2–6, sum ≤ 10
    let a = randInt(2, 6);
    let b = randInt(2, Math.min(6, 10 - a));
    return makeQ(a, b);
  }

  function genDoubles() {
    const d = randInt(2, 9);
    return makeQ(d, d);
  }

  function genCross10Light() {
    // crossing ten, both 3–8, sum 11–14
    for (let i = 0; i < 20; i++) {
      const a = randInt(4, 8);
      const b = randInt(4, 8);
      const s = a + b;
      if (s >= 11 && s <= 14) return makeQ(a, b);
    }
    return makeQ(5, 7);
  }

  function genCross10() {
    // crossing ten, prefer both ≥ 4, sum 11–16; avoid pure 湊十 (x + (10-x))
    for (let i = 0; i < 30; i++) {
      const a = randInt(4, 9);
      const b = randInt(4, 9);
      const s = a + b;
      if (s < 11 || s > 16) continue;
      if (a + b === 10) continue; // skip pure make-10
      return makeQ(a, b);
    }
    return makeQ(6, 7);
  }

  function genCross10Big() {
    for (let i = 0; i < 30; i++) {
      const a = randInt(5, 9);
      const b = randInt(5, 9);
      const s = a + b;
      if (s >= 12 && s <= 18 && a + b !== 10) return makeQ(a, b);
    }
    return makeQ(8, 7);
  }

  function genMixed(level) {
    const r = Math.random();
    if (r < 0.28) return genDoubles();
    if (r < 0.55) return genCross10();
    if (r < 0.75) return genCross10Big();
    if (level <= 3) return genWithin10();
    return genCross10Light();
  }

  function genHard() {
    const r = Math.random();
    if (r < 0.3) {
      const d = randInt(6, 9);
      return makeQ(d, d);
    }
    if (r < 0.55) return genCross10Big();
    // uneven crossing
    const a = randInt(6, 9);
    const b = randInt(4, 9);
    return makeQ(a, b);
  }

  function genInSumRange(lo, hi) {
    const sum = randInt(lo, hi);
    if (sum <= 2) return makeQ(1, Math.max(1, sum - 1));
    const a = randInt(1, sum - 1);
    return makeQ(a, sum - a);
  }

  function generateQuestionRaw(level) {
    switch (level) {
      case 1: return genWithin10();
      case 2: return genSmallAdd();
      case 3: return Math.random() < 0.7 ? genDoubles() : genWithin10();
      case 4: return Math.random() < 0.55 ? genCross10Light() : genDoubles();
      case 5: return genCross10();
      case 6: return genCross10Big();
      case 7: return genMixed(7);
      case 8: return genHard();
      case 9: return Math.random() < 0.4 ? genDoubles() : genHard();
      case 10:
      default: return genHard();
    }
  }

  function generateQuestion(level) {
    normalizeSumRange(settings);
    const lo = settings.sumMin;
    const hi = settings.sumMax;
    for (let i = 0; i < 48; i++) {
      const q = generateQuestionRaw(level);
      if (q.answer >= lo && q.answer <= hi) return q;
    }
    return genInSumRange(lo, hi);
  }

  function wrongAnswers(correct, count) {
    const set = new Set([correct]);
    const out = [];
    let guard = 0;
    while (out.length < count && guard++ < 80) {
      let w;
      const mode = Math.random();
      if (mode < 0.35) w = correct + pick([-2, -1, 1, 2]);
      else if (mode < 0.6) w = correct + pick([-3, 3, -4, 4]);
      else w = randInt(Math.max(1, correct - 6), correct + 6);
      if (w < 1 || w > 20 || set.has(w)) continue;
      set.add(w);
      out.push(w);
    }
    while (out.length < count) {
      const w = randInt(1, 18);
      if (!set.has(w)) {
        set.add(w);
        out.push(w);
      }
    }
    return out;
  }

  // ─── Game state ────────────────────────────────────────────────────
  let W = 0, H = 0, dpr = 1;
  let state = "menu"; // menu | playing | paused | feedback | over
  let bird = null;
  let pipes = []; // each: { x, choices:[{gapY, value, correct}], scored, width }
  let groundY = 0;
  let score = 0;
  let level = 1;
  let lives = MAX_LIVES;
  let currentQ = null;
  let animId = 0;
  let lastTs = 0;
  let cloudSeed = [];
  let feedbackTimer = 0;
  let pipeWidth = 64;
  let choiceCount = 2; // 2 or 3 gaps
  let pendingNext = false;

  function effectiveLevel() {
    if (settings.difficulty === "auto") {
      return Math.min(MAX_LEVEL, 1 + Math.floor(score / POINTS_PER_LEVEL));
    }
    return Math.max(1, Math.min(MAX_LEVEL, parseInt(settings.difficulty, 10) || 1));
  }

  function resize() {
    const app = document.getElementById("app");
    const rect = app.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    W = rect.width;
    H = rect.height;
    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    groundY = H - 72;
    pipeWidth = Math.max(56, Math.min(72, W * 0.16));
  }

  function resetBird() {
    bird = {
      x: W * 0.28,
      y: H * 0.42,
      vy: 0,
      r: 18,
      rot: 0,
      wing: 0,
    };
  }

  function updateLivesUI() {
    livesEl.innerHTML = "";
    for (let i = 0; i < MAX_LIVES; i++) {
      const s = document.createElement("span");
      s.className = "heart" + (i < lives ? "" : " empty");
      s.textContent = "❤";
      livesEl.appendChild(s);
    }
  }

  function updateHUD() {
    scoreVal.textContent = String(score);
    levelVal.textContent = String(level);
    updateLivesUI();
  }

  function renderEquation() {
    if (!currentQ) return;
    eqText.textContent = `${currentQ.a} + ${currentQ.b} = ?`;
    eqViz.innerHTML = "";
    if (!settings.showViz) return;
    const kind = currentQ.a === currentQ.b ? "block" : "apple";
    const g1 = document.createElement("div");
    g1.className = "group";
    for (let i = 0; i < currentQ.a; i++) {
      const d = document.createElement("span");
      d.className = "dot " + kind;
      g1.appendChild(d);
    }
    const plus = document.createElement("span");
    plus.className = "plus";
    plus.textContent = "+";
    const g2 = document.createElement("div");
    g2.className = "group";
    for (let i = 0; i < currentQ.b; i++) {
      const d = document.createElement("span");
      d.className = "dot " + kind;
      g2.appendChild(d);
    }
    eqViz.appendChild(g1);
    eqViz.appendChild(plus);
    eqViz.appendChild(g2);
  }

  function showToast(msg, kind, ms) {
    toast.textContent = msg;
    toast.className = "toast " + (kind || "");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => {
      toast.classList.add("hidden");
    }, ms || 1200);
  }

  function spawnPipeGroup(x) {
    currentQ = generateQuestion(level);
    renderEquation();

    // 2 gaps early, 3 gaps from level 5+
    choiceCount = level >= 5 ? 3 : 2;
    const wrongs = wrongAnswers(currentQ.answer, choiceCount - 1);
    const values = [currentQ.answer, ...wrongs];
    // shuffle
    for (let i = values.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [values[i], values[j]] = [values[j], values[i]];
    }

    const gapH = settings.gap;
    const topMargin = 100; // below equation HUD
    const bottomMargin = 20;
    const usable = groundY - topMargin - bottomMargin;
    const segment = usable / choiceCount;

    const choices = values.map((value, i) => {
      const segTop = topMargin + i * segment;
      const maxOff = Math.max(0, segment - gapH - 8);
      const gapY = segTop + 4 + Math.random() * maxOff;
      return {
        gapY,
        gapH,
        value,
        correct: value === currentQ.answer,
      };
    });

    pipes.push({
      x,
      width: pipeWidth,
      choices,
      scored: false,
      judged: false,
    });
  }

  function clearPipes() {
    pipes = [];
  }

  function startGame() {
    ensureAudio();
    score = 0;
    lives = MAX_LIVES;
    level = effectiveLevel();
    if (settings.difficulty === "auto") level = 1;
    state = "playing";
    clearPipes();
    resetBird();
    updateHUD();
    startScreen.classList.add("hidden");
    overScreen.classList.add("hidden");
    hud.classList.remove("hidden");
    toast.classList.add("hidden");
    pendingNext = false;

    // first pipe a bit ahead for thinking time
    spawnPipeGroup(W + 40);
    lastTs = performance.now();
    cancelAnimationFrame(animId);
    animId = requestAnimationFrame(loop);
  }

  function gameOver() {
    state = "over";
    finalScore.textContent = String(score);
    finalLevel.textContent = String(level);
    overScreen.classList.remove("hidden");
  }

  function miss(reason) {
    sfxHit();
    lives -= 1;
    updateLivesUI();
    const ans = currentQ ? currentQ.answer : "?";
    showToast(`答錯喇！正確係 ${ans}`, "bad", 1400);
    state = "feedback";
    feedbackTimer = 1.4;

    if (lives <= 0) {
      // will go to game over after feedback
      pendingNext = "over";
    } else {
      pendingNext = "retry";
    }
  }

  function scorePass() {
    sfxScore();
    score += 1;
    const prevLevel = level;
    if (settings.difficulty === "auto") {
      level = Math.min(MAX_LEVEL, 1 + Math.floor(score / POINTS_PER_LEVEL));
    } else {
      level = effectiveLevel();
    }
    updateHUD();
    if (level > prevLevel) {
      sfxLevel();
      showToast(`升級！等級 ${level}`, "good", 1000);
    } else {
      showToast("正確！+1", "good", 700);
    }
  }

  function flap() {
    if (state !== "playing") return;
    ensureAudio();
    bird.vy = -settings.jump;
    bird.wing = 1;
    sfxFlap();
  }

  // ─── Physics / collision ───────────────────────────────────────────
  function update(dt) {
    if (state === "feedback") {
      feedbackTimer -= dt;
      // still drift pipes slowly for polish
      const spd = settings.speed * 0.3;
      for (const p of pipes) p.x -= spd * dt * 60;
      bird.vy += settings.gravity * 0.3 * dt * 60;
      bird.y += bird.vy * dt * 60;
      if (feedbackTimer <= 0) {
        if (pendingNext === "over") {
          gameOver();
        } else if (pendingNext === "retry") {
          // soft fail: reset bird, clear pipes, same settings, new question
          clearPipes();
          resetBird();
          spawnPipeGroup(W + 60);
          state = "playing";
          pendingNext = false;
          toast.classList.add("hidden");
        }
      }
      return;
    }

    if (state !== "playing") return;

    const g = settings.gravity;
    const spd = settings.speed;

    bird.vy += g * dt * 60;
    bird.y += bird.vy * dt * 60;
    bird.rot = Math.max(-0.6, Math.min(1.1, bird.vy * 0.06));
    if (bird.wing > 0) bird.wing -= dt * 8;

    // ground / ceiling
    if (bird.y + bird.r > groundY) {
      bird.y = groundY - bird.r;
      miss("ground");
      return;
    }
    if (bird.y - bird.r < 0) {
      bird.y = bird.r;
      bird.vy = 0;
    }

    for (const p of pipes) {
      p.x -= spd * dt * 60;
    }

    // spawn next
    const last = pipes[pipes.length - 1];
    if (!last || last.x < W - settings.spacing) {
      spawnPipeGroup((last ? last.x + settings.spacing : W) + 20);
    }

    // remove offscreen
    pipes = pipes.filter((p) => p.x + p.width > -40);

    // collisions / scoring
    for (const p of pipes) {
      if (p.judged) continue;
      const bx = bird.x;
      const by = bird.y;
      const br = bird.r * 0.82; // forgiving hitbox

      const inX = bx + br > p.x && bx - br < p.x + p.width;
      if (!inX) {
        // passed completely?
        if (!p.scored && bx - br > p.x + p.width) {
          // flew past without going through any gap correctly → miss
          p.judged = true;
          miss("missed");
          return;
        }
        continue;
      }

      // inside pipe column horizontally — check which gap (if any)
      let inCorrect = false;
      let inAnyGap = false;
      let inWrongGap = false;

      for (const c of p.choices) {
        const gapTop = c.gapY;
        const gapBot = c.gapY + c.gapH;
        if (by > gapTop + br * 0.3 && by < gapBot - br * 0.3) {
          inAnyGap = true;
          if (c.correct) inCorrect = true;
          else inWrongGap = true;
        }
      }

      // solid pipe body collision (not in any gap)
      if (!inAnyGap) {
        // check if overlapping pipe solid
        // bird is in the x-range of pipes and not in a gap
        p.judged = true;
        miss("pipe");
        return;
      }

      if (inWrongGap && !inCorrect) {
        p.judged = true;
        miss("wrong");
        return;
      }

      if (inCorrect && !p.scored) {
        // wait until center of pipe to score
        if (bx > p.x + p.width * 0.45) {
          p.scored = true;
          p.judged = true;
          scorePass();
        }
      }
    }
  }

  // ─── Drawing (original art) ────────────────────────────────────────
  function drawBackground() {
    // sky gradient
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#6EC6FF");
    g.addColorStop(0.55, "#A8E0FF");
    g.addColorStop(1, "#C8F0A8");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // soft hills
    ctx.fillStyle = "rgba(120, 190, 90, 0.35)";
    ctx.beginPath();
    ctx.moveTo(0, groundY - 40);
    ctx.quadraticCurveTo(W * 0.25, groundY - 90, W * 0.5, groundY - 45);
    ctx.quadraticCurveTo(W * 0.75, groundY - 100, W, groundY - 50);
    ctx.lineTo(W, groundY);
    ctx.lineTo(0, groundY);
    ctx.fill();

    // clouds
    if (cloudSeed.length === 0) {
      for (let i = 0; i < 5; i++) {
        cloudSeed.push({
          x: Math.random() * W,
          y: 40 + Math.random() * (H * 0.35),
          s: 0.6 + Math.random() * 0.8,
          v: 0.15 + Math.random() * 0.25,
        });
      }
    }
    for (const c of cloudSeed) {
      c.x -= c.v;
      if (c.x < -80) c.x = W + 40;
      drawCloud(c.x, c.y, c.s);
    }

    // ground
    ctx.fillStyle = "#6B4F2A";
    ctx.fillRect(0, groundY, W, H - groundY);
    ctx.fillStyle = "#8BC34A";
    ctx.fillRect(0, groundY, W, 14);
    // grass nubs
    ctx.fillStyle = "#7CB342";
    for (let x = 0; x < W; x += 18) {
      ctx.fillRect(x, groundY - 4, 10, 6);
    }
  }

  function drawCloud(x, y, s) {
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.beginPath();
    ctx.arc(x, y, 16 * s, 0, Math.PI * 2);
    ctx.arc(x + 18 * s, y - 6 * s, 20 * s, 0, Math.PI * 2);
    ctx.arc(x + 38 * s, y, 14 * s, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawPipeSegment(x, y, w, h, capAt) {
    // original green tube — rounded, striped, not Mario/Flappy trademark
    if (h <= 0) return;
    const r = 8;
    // body
    const grad = ctx.createLinearGradient(x, 0, x + w, 0);
    grad.addColorStop(0, "#1B5E20");
    grad.addColorStop(0.15, "#43A047");
    grad.addColorStop(0.5, "#66BB6A");
    grad.addColorStop(0.85, "#2E7D32");
    grad.addColorStop(1, "#1B5E20");
    ctx.fillStyle = grad;
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") {
      ctx.roundRect(x + 4, y, w - 8, h, 4);
    } else {
      ctx.rect(x + 4, y, w - 8, h);
    }
    ctx.fill();

    // rim / cap
    const capH = 18;
    let cy = capAt === "bottom" ? y + h - capH : y;
    if (capAt === "top" && h < capH) cy = y;
    if (capAt === "bottom" && h < capH) cy = y;
    ctx.fillStyle = "#2E7D32";
    roundRect(x, cy, w, Math.min(capH, h), 6);
    ctx.fill();
    // highlight stripe
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    ctx.fillRect(x + 8, cy + 3, 6, Math.min(capH, h) - 6);
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") {
      ctx.roundRect(x, y, w, h, r);
    } else {
      ctx.rect(x, y, w, h);
    }
  }

  function drawPipes() {
    for (const p of pipes) {
      const parts = [];
      // build solid regions between gaps
      let cursor = 0;
      const ordered = [...p.choices].sort((a, b) => a.gapY - b.gapY);
      for (const c of ordered) {
        if (c.gapY > cursor) {
          parts.push({ y: cursor, h: c.gapY - cursor, cap: "bottom" });
        }
        cursor = c.gapY + c.gapH;
      }
      if (cursor < groundY) {
        parts.push({ y: cursor, h: groundY - cursor, cap: "top" });
      }

      for (const part of parts) {
        drawPipeSegment(p.x, part.y, p.width, part.h, part.cap);
      }

      // answer bubbles in gaps
      for (const c of p.choices) {
        const cx = p.x + p.width / 2;
        const cy = c.gapY + c.gapH / 2;
        const rad = Math.min(26, c.gapH * 0.38);

        ctx.beginPath();
        ctx.arc(cx, cy, rad, 0, Math.PI * 2);
        ctx.fillStyle = c.correct && p.scored ? "#C8E6C9" : "#FFF8E7";
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = c.correct && p.scored ? "#2E7D32" : "#E65100";
        ctx.stroke();

        ctx.fillStyle = "#1e3a5f";
        ctx.font = `bold ${Math.floor(rad * 1.1)}px -apple-system, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(c.value), cx, cy + 1);
      }
    }
  }

  function drawBird() {
    if (!bird) return;
    const { x, y, r, rot, wing } = bird;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);

    // body — cute round block-bird (original)
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 1.05, r * 0.95, 0, 0, Math.PI * 2);
    const body = ctx.createRadialGradient(-r * 0.3, -r * 0.3, 2, 0, 0, r);
    body.addColorStop(0, "#FFE082");
    body.addColorStop(0.6, "#FFB300");
    body.addColorStop(1, "#F57C00");
    ctx.fillStyle = body;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#E65100";
    ctx.stroke();

    // wing
    const wingY = wing > 0 ? -6 : 2;
    ctx.beginPath();
    ctx.ellipse(-4, wingY, r * 0.55, r * 0.35, -0.4, 0, Math.PI * 2);
    ctx.fillStyle = "#FF8F00";
    ctx.fill();
    ctx.strokeStyle = "#E65100";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // eye
    ctx.beginPath();
    ctx.arc(r * 0.35, -r * 0.2, r * 0.28, 0, Math.PI * 2);
    ctx.fillStyle = "#fff";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(r * 0.42, -r * 0.18, r * 0.12, 0, Math.PI * 2);
    ctx.fillStyle = "#1a1a1a";
    ctx.fill();
    // shine
    ctx.beginPath();
    ctx.arc(r * 0.48, -r * 0.26, r * 0.05, 0, Math.PI * 2);
    ctx.fillStyle = "#fff";
    ctx.fill();

    // beak
    ctx.beginPath();
    ctx.moveTo(r * 0.7, 0);
    ctx.lineTo(r * 1.25, r * 0.12);
    ctx.lineTo(r * 0.7, r * 0.28);
    ctx.closePath();
    ctx.fillStyle = "#FF6D00";
    ctx.fill();
    ctx.strokeStyle = "#E65100";
    ctx.lineWidth = 1;
    ctx.stroke();

    // cheek
    ctx.beginPath();
    ctx.arc(r * 0.15, r * 0.25, r * 0.16, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255, 100, 100, 0.45)";
    ctx.fill();

    ctx.restore();
  }

  function draw() {
    drawBackground();
    drawPipes();
    drawBird();
  }

  function loop(ts) {
    const dt = Math.min(0.05, (ts - lastTs) / 1000 || 0.016);
    lastTs = ts;
    if (state === "playing" || state === "feedback") {
      update(dt);
      draw();
      animId = requestAnimationFrame(loop);
    } else if (state === "menu" || state === "over") {
      // idle backdrop
      drawBackground();
      if (bird) drawBird();
      animId = requestAnimationFrame(loop);
    }
  }

  // ─── Input ─────────────────────────────────────────────────────────
  function onPointer(e) {
    // ignore UI buttons
    const t = e.target;
    if (t.closest && (
      t.closest("#topBtns") ||
      t.closest(".overlay") ||
      t.closest("button") ||
      t.closest("select") ||
      t.closest("input") ||
      t.closest("label")
    )) return;

    if (state === "playing") {
      e.preventDefault();
      flap();
    }
  }

  canvas.addEventListener("pointerdown", onPointer, { passive: false });
  document.getElementById("app").addEventListener("pointerdown", (e) => {
    if (state !== "playing") return;
    const t = e.target;
    if (t === canvas) return;
    if (t.closest && (
      t.closest("#topBtns") ||
      t.closest(".overlay") ||
      t.closest("button")
    )) return;
    // allow tapping HUD area / empty space to flap
    if (t.closest("#hud") || t === document.getElementById("app")) {
      e.preventDefault();
      flap();
    }
  }, { passive: false });

  window.addEventListener("keydown", (e) => {
    if (e.code === "Space" || e.code === "ArrowUp") {
      e.preventDefault();
      if (state === "menu") startGame();
      else flap();
    }
  });

  // ─── Settings UI ───────────────────────────────────────────────────
  function syncSumRangeUI() {
    normalizeSumRange(settings);
    setSumMin.value = settings.sumMin;
    setSumMax.value = settings.sumMax;
    outSumMin.textContent = settings.sumMin;
    outSumMax.textContent = settings.sumMax;
    startSumMin.value = settings.sumMin;
    startSumMax.value = settings.sumMax;
    outStartSumMin.textContent = settings.sumMin;
    outStartSumMax.textContent = settings.sumMax;
    if (sumRangePreview) {
      sumRangePreview.textContent = settings.sumMin + "–" + settings.sumMax;
    }
  }

  function syncSettingsUI() {
    setDifficulty.value = settings.difficulty;
    setSpacing.value = settings.spacing;
    setGravity.value = settings.gravity;
    setJump.value = settings.jump;
    setSpeed.value = settings.speed;
    setGap.value = settings.gap;
    setViz.checked = settings.showViz;
    outSpacing.textContent = settings.spacing;
    outGravity.textContent = Number(settings.gravity).toFixed(2);
    outJump.textContent = Number(settings.jump).toFixed(1);
    outSpeed.textContent = Number(settings.speed).toFixed(1);
    outGap.textContent = settings.gap;
    syncSumRangeUI();
  }

  function applySumFromControls(minEl, maxEl, which) {
    let lo = clampSum(minEl.value);
    let hi = clampSum(maxEl.value);
    if (which === "min" && lo > hi) hi = lo;
    if (which === "max" && hi < lo) lo = hi;
    settings.sumMin = lo;
    settings.sumMax = hi;
    minEl.value = lo;
    maxEl.value = hi;
  }

  function readSettingsFromUI(opts) {
    opts = opts || {};
    settings.difficulty = setDifficulty.value;
    settings.spacing = Number(setSpacing.value);
    settings.gravity = Number(setGravity.value);
    settings.jump = Number(setJump.value);
    settings.speed = Number(setSpeed.value);
    settings.gap = Number(setGap.value);
    settings.showViz = setViz.checked;
    if (opts.sumWhich) {
      applySumFromControls(setSumMin, setSumMax, opts.sumWhich);
    } else {
      // keep existing settings.sum* unless both controls are trustworthy
      settings.sumMin = clampSum(setSumMin.value);
      settings.sumMax = clampSum(setSumMax.value);
      normalizeSumRange(settings);
    }
    normalizeSumRange(settings);
    saveSettings();
    syncSettingsUI();
    if (state === "playing") {
      level = effectiveLevel();
      if (settings.difficulty === "auto") {
        level = Math.min(MAX_LEVEL, 1 + Math.floor(score / POINTS_PER_LEVEL));
      }
      updateHUD();
      renderEquation();
    }
  }

  function readSumFromStart(which) {
    applySumFromControls(startSumMin, startSumMax, which);
    normalizeSumRange(settings);
    saveSettings();
    syncSumRangeUI();
  }

  [
    setDifficulty, setSpacing, setGravity, setJump, setSpeed, setGap, setViz
  ].forEach((el) => {
    el.addEventListener("input", () => readSettingsFromUI());
    el.addEventListener("change", () => readSettingsFromUI());
  });

  setSumMin.addEventListener("input", () => readSettingsFromUI({ sumWhich: "min" }));
  setSumMin.addEventListener("change", () => readSettingsFromUI({ sumWhich: "min" }));
  setSumMax.addEventListener("input", () => readSettingsFromUI({ sumWhich: "max" }));
  setSumMax.addEventListener("change", () => readSettingsFromUI({ sumWhich: "max" }));

  startSumMin.addEventListener("input", () => readSumFromStart("min"));
  startSumMin.addEventListener("change", () => readSumFromStart("min"));
  startSumMax.addEventListener("input", () => readSumFromStart("max"));
  startSumMax.addEventListener("change", () => readSumFromStart("max"));

  btnDefaults.addEventListener("click", () => {
    settings = normalizeSumRange({ ...DEFAULTS });
    saveSettings();
    syncSettingsUI();
  });

  btnCloseSettings.addEventListener("click", () => {
    readSettingsFromUI();
    settingsPanel.classList.add("hidden");
    if (state === "paused") {
      state = "playing";
      lastTs = performance.now();
      animId = requestAnimationFrame(loop);
    }
  });

  btnSettings.addEventListener("click", () => {
    syncSettingsUI();
    settingsPanel.classList.remove("hidden");
    if (state === "playing") state = "paused";
  });

  btnMute.addEventListener("click", () => {
    muted = !muted;
    btnMute.textContent = muted ? "🔇" : "🔊";
    btnMute.setAttribute("aria-label", muted ? "取消靜音" : "靜音");
    if (!muted) ensureAudio();
  });

  btnStart.addEventListener("click", startGame);
  btnRetry.addEventListener("click", startGame);
  btnHome.addEventListener("click", () => {
    state = "menu";
    overScreen.classList.add("hidden");
    hud.classList.add("hidden");
    startScreen.classList.remove("hidden");
    clearPipes();
    resetBird();
  });

  // ─── Boot ──────────────────────────────────────────────────────────
  window.addEventListener("resize", () => {
    resize();
    if (bird) {
      bird.x = W * 0.28;
    }
  });

  resize();
  resetBird();
  syncSettingsUI();
  updateHUD();
  hud.classList.add("hidden");
  lastTs = performance.now();
  animId = requestAnimationFrame(loop);

  // Prevent rubber-band scroll on iOS
  document.body.addEventListener("touchmove", (e) => {
    if (e.target.closest && (
      e.target.closest(".settings-card") ||
      e.target.closest(".sum-range") ||
      e.target.closest('input[type="range"]')
    )) return;
    e.preventDefault();
  }, { passive: false });
})();
