(() => {
  "use strict";

  const canvas = document.getElementById("gameCanvas");
  const titleOverlay = document.getElementById("titleOverlay");
  const gameOverOverlay = document.getElementById("gameOverOverlay");
  const gameOverScore = document.getElementById("gameOverScore");
  const startButton = document.getElementById("startButton");
  const retryButton = document.getElementById("retryButton");
  const touchButtons = Array.from(document.querySelectorAll("button[data-action]"));

  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error("Fant ikke #gameCanvas i HTML.");
  }

  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) {
    throw new Error("Klarte ikke opprette 2D-kontekst.");
  }

  const GAME_WIDTH = 1536;
  const GAME_HEIGHT = 720;

  var engine = new Engine({
    canvas:       '#gameCanvas',
    width:        GAME_WIDTH,
    height:       GAME_HEIGHT,
    background:   '#000000',
    maxDeltaTime: 0.04
  });

  const FLOOR_Y = 618;
  const PLAY_LEFT = 22;
  const PLAY_RIGHT = GAME_WIDTH - 22;

  const TRAMPOLINE = {
    x: GAME_WIDTH * 0.5,
    y: 520,
    width: 250,
    height: 28,
    bounce: 760,
    boostBounce: 940,
  };

  const PLAYER = {
    w: 82,
    h: 124,
    gravity: 2050,
    moveAccelGround: 2350,
    moveAccelAir: 1320,
    maxMoveSpeed: 430,
    groundFriction: 0.79,
    airFriction: 0.93,
    groundJump: 540,
  };

  const BEST_KEY = "beskytt-trampolinen-best-score";

  const YOUTH_PALETTES = [
    {
      blazer: "#556f92",
      shirt: "#f6f7fb",
      pants: "#dce1eb",
      hair: "#caa36a",
      shoe: "#5a4536",
      accessory: "scarf",
    },
    {
      blazer: "#7b5f8f",
      shirt: "#fbf4ea",
      pants: "#d7dbe4",
      hair: "#6f533f",
      shoe: "#413642",
      accessory: "vneck",
    },
    {
      blazer: "#4f7a73",
      shirt: "#f0f4fa",
      pants: "#d5dadf",
      hair: "#8d7048",
      shoe: "#334047",
      accessory: "sweater",
    },
    {
      blazer: "#8b6b52",
      shirt: "#f7f1e8",
      pants: "#ddd7cd",
      hair: "#5b4739",
      shoe: "#4a3d33",
      accessory: "scarf",
    },
    {
      blazer: "#486489",
      shirt: "#f3f7ff",
      pants: "#cfd8e6",
      hair: "#ab845a",
      shoe: "#314456",
      accessory: "vneck",
    },
  ];

  const SCOOTER_MODELS = [
    {
      brand: "VOI",
      deck: "#9bdd00",
      stem: "#6ea100",
      text: "#1a3210",
    },
    {
      brand: "RIDE",
      deck: "#00c88a",
      stem: "#009d6a",
      text: "#063829",
    },
  ];

  const BOING_COLORS = ["#ffd166", "#ff7b72", "#4cc9f0", "#b8f2e6", "#fff4a3"];

  var input = { left: false, right: false, jumpHeld: false, jumpPressed: false };

  const larsPhoto = new Image();
  let larsPhotoReady = false;
  larsPhoto.onload = () => {
    larsPhotoReady = true;
  };
  larsPhoto.src = "assets/lars.jpg";

  const audio = {
    ctx: null,
    unlocked: false,
  };

  const state = {
    mode: "title",
    time: 0,
    elapsed: 0,
    score: 0,
    best: Number(localStorage.getItem(BEST_KEY) || "0"),
    combo: 0,
    comboTimer: 0,
    wave: 1,
    waveState: "spawning",
    waveSpawnRemaining: 0,
    waveBreakTimer: 0,
    waveBannerTimer: 0,
    waveMessage: "",
    spawnTimer: 1.35,
    nextEnemyId: 1,
    cryTimer: 0.6,
    flash: 0,
    trampolineKick: 0,
    trampolineWaves: [],
    enemies: [],
    particles: [],
    puffs: [],
    floatTexts: [],
    clouds: createClouds(),
    kids: [
      { offsetX: -55, bouncePhase: 0.7, cryPhase: 0 },
      { offsetX: 56, bouncePhase: 1.8, cryPhase: 1.2 },
    ],
    player: createPlayer(),
  };

  syncHud();

  startButton?.addEventListener("click", startRound);
  retryButton?.addEventListener("click", startRound);

  function createPlayer() {
    return {
      x: TRAMPOLINE.x - PLAYER.w * 0.5,
      y: TRAMPOLINE.y - PLAYER.h,
      w: PLAYER.w,
      h: PLAYER.h,
      vx: 0,
      vy: -220,
      face: 1,
      onGround: false,
      onTrampoline: true,
      wasOverTrampoline: false,
      jumpBuffer: 0,
      blinkPhase: 0,
      kickTimer: 0,
      kickSide: 1,
    };
  }

  function createClouds() {
    return Array.from({ length: 7 }, () => ({
      x: randRange(0, GAME_WIDTH),
      y: randRange(40, 220),
      w: randRange(120, 220),
      h: randRange(44, 86),
      speed: randRange(8, 18),
      phase: randRange(0, Math.PI * 2),
    }));
  }

  var touchInput = { left: false, right: false, jumpHeld: false, jumpPressed: false };

  (function bindTouchButtons() {
    touchButtons.forEach(function (btn) {
      var action = btn.dataset.action;
      btn.addEventListener("pointerdown", function (e) {
        e.preventDefault();
        if (state.mode !== "playing") { startRound(); }
        btn.classList.add("active");
        touchInput[action === "jump" ? "jumpHeld" : action] = true;
        if (action === "jump") { touchInput.jumpPressed = true; }
        if (action === "left")  { state.player.face = -1; }
        if (action === "right") { state.player.face =  1; }
      });
      function release() {
        btn.classList.remove("active");
        touchInput[action === "jump" ? "jumpHeld" : action] = false;
      }
      btn.addEventListener("pointerup",     release);
      btn.addEventListener("pointercancel", release);
      btn.addEventListener("pointerleave",  release);
    });
    window.addEventListener("pointerup",     function () { touchInput.left = touchInput.right = touchInput.jumpHeld = false; });
    window.addEventListener("pointercancel", function () { touchInput.left = touchInput.right = touchInput.jumpHeld = false; });

    // Also handle Enter/Space to start the game (not in playing mode)
    window.addEventListener("keydown", function (e) {
      if ((e.code === "Enter" || e.code === "Space") && state.mode !== "playing" && !e.repeat) {
        startRound();
      }
    });
  })();

  function ensureAudio() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      return null;
    }

    if (!audio.ctx) {
      audio.ctx = new AudioContextClass();
    }

    if (audio.ctx.state === "suspended") {
      audio.ctx.resume().catch(() => {});
    }

    audio.unlocked = true;
    return audio.ctx;
  }

  function playTone(options) {
    const ac = ensureAudio();
    if (!ac) {
      return;
    }

    const {
      freq,
      duration = 0.12,
      type = "sine",
      gain = 0.03,
      slideTo = null,
      pan = 0,
      attack = 0.005,
      release = 0.08,
    } = options;

    const osc = ac.createOscillator();
    const amp = ac.createGain();
    const panner = ac.createStereoPanner ? ac.createStereoPanner() : null;

    osc.type = type;
    osc.frequency.setValueAtTime(freq, ac.currentTime);
    if (slideTo !== null) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(30, slideTo), ac.currentTime + duration);
    }

    amp.gain.setValueAtTime(0.0001, ac.currentTime);
    amp.gain.exponentialRampToValueAtTime(Math.max(0.0001, gain), ac.currentTime + attack);
    amp.gain.setValueAtTime(Math.max(0.0001, gain), ac.currentTime + Math.max(attack, duration - release));
    amp.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + duration);

    if (panner) {
      panner.pan.value = clamp(pan, -1, 1);
      osc.connect(amp);
      amp.connect(panner);
      panner.connect(ac.destination);
    } else {
      osc.connect(amp);
      amp.connect(ac.destination);
    }

    osc.start(ac.currentTime);
    osc.stop(ac.currentTime + duration + 0.02);
  }

  function playBoing(strong = false) {
    playTone({
      freq: strong ? 320 : 270,
      slideTo: 140,
      duration: strong ? 0.19 : 0.14,
      type: "triangle",
      gain: strong ? 0.045 : 0.032,
      pan: randRange(-0.2, 0.2),
    });

    playTone({
      freq: strong ? 520 : 440,
      slideTo: strong ? 350 : 290,
      duration: 0.08,
      type: "sine",
      gain: strong ? 0.015 : 0.012,
      pan: randRange(-0.24, 0.24),
    });

    playTone({
      freq: strong ? 145 : 132,
      slideTo: 82,
      duration: 0.09,
      type: "square",
      gain: 0.008,
      pan: randRange(-0.2, 0.2),
    });
  }

  function playHitCombo(combo) {
    const base = 330 + Math.min(combo, 8) * 28;
    playTone({
      freq: base,
      slideTo: base * 1.22,
      duration: 0.11,
      type: "square",
      gain: 0.03,
      pan: randRange(-0.45, 0.45),
    });
    playTone({
      freq: base * 0.7,
      duration: 0.08,
      type: "triangle",
      gain: 0.015,
      pan: randRange(-0.45, 0.45),
    });

    playTone({
      freq: base * 1.65,
      slideTo: base * 1.2,
      duration: 0.05,
      type: "sine",
      gain: 0.008,
      pan: randRange(-0.45, 0.45),
    });
  }

  function playGameOverSting() {
    playTone({ freq: 180, slideTo: 122, duration: 0.32, type: "sawtooth", gain: 0.04, pan: -0.2 });
    playTone({ freq: 210, slideTo: 138, duration: 0.34, type: "sawtooth", gain: 0.04, pan: 0.2 });
  }

  function playCryWhimper() {
    playTone({ freq: randRange(480, 620), slideTo: randRange(290, 360), duration: 0.24, type: "sine", gain: 0.024, pan: -0.2 });
    playTone({ freq: randRange(520, 690), slideTo: randRange(320, 390), duration: 0.22, type: "sine", gain: 0.02, pan: 0.2 });
  }

  function playWaveStart(wave) {
    const base = 210 + Math.min(wave, 8) * 12;
    playTone({ freq: base, slideTo: base * 1.22, duration: 0.14, type: "square", gain: 0.022, pan: -0.16 });
    playTone({ freq: base * 1.36, slideTo: base * 1.6, duration: 0.16, type: "triangle", gain: 0.02, pan: 0.16 });
  }

  function playWaveClear() {
    playTone({ freq: 390, slideTo: 520, duration: 0.13, type: "sine", gain: 0.018, pan: -0.12 });
    playTone({ freq: 520, slideTo: 700, duration: 0.16, type: "sine", gain: 0.02, pan: 0.12 });
  }

  function playSpawnSound(enemy) {
    const pan = clamp((enemy.x - GAME_WIDTH * 0.5) / (GAME_WIDTH * 0.5), -1, 1) * 0.6;
    const scooterEnemy = isScooterEnemy(enemy);
    if (scooterEnemy) {
      playTone({ freq: 120, slideTo: 170, duration: 0.1, type: "sawtooth", gain: 0.012, pan });
      playTone({ freq: 190, slideTo: 158, duration: 0.08, type: "square", gain: 0.01, pan });
      if (enemy.riderCount > 1) {
        playTone({ freq: 420, slideTo: 360, duration: 0.06, type: "triangle", gain: 0.011, pan });
      }
      return;
    }

    if (Math.random() < 0.45) {
      playTone({ freq: randRange(180, 240), slideTo: randRange(120, 170), duration: 0.06, type: "triangle", gain: 0.008, pan });
    }
  }

  function startRound() {
    ensureAudio();

    state.mode = "playing";
    state.time = 0;
    state.elapsed = 0;
    state.score = 0;
    state.combo = 0;
    state.comboTimer = 0;
    state.wave = 1;
    state.waveState = "spawning";
    state.waveSpawnRemaining = 0;
    state.waveBreakTimer = 0;
    state.waveBannerTimer = 0;
    state.waveMessage = "";
    state.spawnTimer = 1.35;
    state.nextEnemyId = 1;
    state.flash = 0;
    state.trampolineKick = 0;
    state.trampolineWaves.length = 0;
    state.cryTimer = 0.55;

    state.enemies.length = 0;
    state.particles.length = 0;
    state.puffs.length = 0;
    state.floatTexts.length = 0;

    state.player = createPlayer();

    for (const kid of state.kids) {
      kid.cryPhase = randRange(0, Math.PI * 2);
    }

    titleOverlay?.setAttribute("hidden", "");
    if (titleOverlay) {
      titleOverlay.hidden = true;
    }
    if (gameOverOverlay) {
      gameOverOverlay.hidden = true;
    }

    input.left = false;
    input.right = false;
    input.jumpHeld = false;
    input.jumpPressed = false;

    beginWave(1);

    syncHud();
  }

  function gameOver() {
    if (state.mode !== "playing") {
      return;
    }

    state.mode = "gameover";
    state.combo = 0;
    state.comboTimer = 0;
    state.cryTimer = 0.1;

    if (state.score > state.best) {
      state.best = state.score;
      localStorage.setItem(BEST_KEY, String(state.best));
    }

    playGameOverSting();

    if (gameOverScore) {
      const isNewBest = state.score >= state.best;
      gameOverScore.textContent = isNewBest
        ? `Ny rekord: ${state.score} poeng!`
        : `${state.score} poeng — rekord: ${state.best}`;
    }
    if (gameOverOverlay) {
      gameOverOverlay.hidden = false;
    }

    syncHud();
  }

  function update(dt) {
    input.left        = engine.input.isDown("left")      || touchInput.left;
    input.right       = engine.input.isDown("right")     || touchInput.right;
    input.jumpHeld    = engine.input.isDown("jump")      || touchInput.jumpHeld;
    input.jumpPressed = engine.input.justPressed("jump") || touchInput.jumpPressed;
    touchInput.jumpPressed = false;

    state.time += dt;
    updateClouds(dt);
    updateKids(dt);
    updateEffects(dt);

    state.flash = Math.max(0, state.flash - dt * 2.4);
    state.waveBannerTimer = Math.max(0, state.waveBannerTimer - dt);

    if (state.mode === "title") {
      updateTitlePose(dt);
      return;
    }

    if (state.mode === "gameover") {
      state.cryTimer -= dt;
      if (state.cryTimer <= 0) {
        state.cryTimer = randRange(0.48, 0.78);
        playCryWhimper();
      }
      return;
    }

    state.elapsed += dt;
    state.comboTimer = Math.max(0, state.comboTimer - dt);
    if (state.comboTimer <= 0) {
      state.combo = 0;
    }

    updatePlayer(dt);
    updateSpawning(dt);
    updateEnemies(dt);
    resolveCombatAndLoss();
    syncHud();
  }

  function updateTitlePose(dt) {
    const player = state.player;
    player.blinkPhase += dt * 2.3;
    const targetX = TRAMPOLINE.x - player.w * 0.5;
    player.x += (targetX - player.x) * clamp(dt * 5, 0, 1);

    if (player.y + player.h >= TRAMPOLINE.y) {
      player.y = TRAMPOLINE.y - player.h;
      const pulse = Math.abs(Math.sin(state.time * 2.4));
      player.vy = -200 - pulse * 60;
      triggerTrampolineImpact(0.62);
    }

    player.vy += PLAYER.gravity * 0.68 * dt;
    player.y += player.vy * dt;
  }

  function updateClouds(dt) {
    for (const cloud of state.clouds) {
      cloud.x += cloud.speed * dt;
      if (cloud.x - cloud.w * 0.6 > GAME_WIDTH + 60) {
        cloud.x = -cloud.w - 80;
        cloud.y = randRange(34, 230);
      }
    }
  }

  function updateKids(dt) {
    for (let i = 0; i < state.kids.length; i += 1) {
      const kid = state.kids[i];
      if (state.mode === "gameover") {
        kid.cryPhase += dt * (6.8 + i * 0.9);
      } else {
        kid.bouncePhase += dt * (4.2 + i * 0.7);
      }
    }
  }

  function triggerTrampolineImpact(power = 1) {
    const p = clamp(power, 0.3, 1.4);
    state.trampolineKick = Math.max(state.trampolineKick, p);
    state.trampolineWaves.push({
      life: 0.34,
      maxLife: 0.34,
      radius: 72,
    });
    if (state.trampolineWaves.length > 10) {
      state.trampolineWaves.shift();
    }
  }

  function updateEffects(dt) {
    state.trampolineKick = Math.max(0, state.trampolineKick - dt * 5.1);
    for (const wave of state.trampolineWaves) {
      wave.life -= dt;
      wave.radius += 220 * dt;
    }

    for (const particle of state.particles) {
      particle.life -= dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vy += 560 * dt;
      particle.rot += particle.spin * dt;
    }

    for (const puff of state.puffs) {
      puff.life -= dt;
      puff.radius += puff.expand * dt;
    }

    for (const text of state.floatTexts) {
      text.life -= dt;
      text.y += text.vy * dt;
      text.x += Math.sin((1 - text.life / text.maxLife) * 9 + text.phase) * 0.65;
    }

    state.particles = state.particles.filter((particle) => particle.life > 0);
    state.puffs = state.puffs.filter((puff) => puff.life > 0);
    state.floatTexts = state.floatTexts.filter((text) => text.life > 0);
    state.trampolineWaves = state.trampolineWaves.filter((wave) => wave.life > 0);
  }

  function updatePlayer(dt) {
    const player = state.player;
    player.blinkPhase += dt * 2.7;
    player.kickTimer = Math.max(0, player.kickTimer - dt);

    player.jumpBuffer = Math.max(0, player.jumpBuffer - dt);
    if (input.jumpPressed) {
      player.jumpBuffer = 0.12;
    }

    const moveAxis = (input.left ? -1 : 0) + (input.right ? 1 : 0);
    if (moveAxis !== 0) {
      player.face = moveAxis;
    }

    const accel = player.onGround ? PLAYER.moveAccelGround : PLAYER.moveAccelAir;
    player.vx += moveAxis * accel * dt;

    const friction = player.onGround ? PLAYER.groundFriction : PLAYER.airFriction;
    if (moveAxis === 0) {
      player.vx *= Math.pow(friction, dt * 60);
    }

    player.vx = clamp(player.vx, -PLAYER.maxMoveSpeed, PLAYER.maxMoveSpeed);

    if (player.onGround && player.jumpBuffer > 0) {
      const overTrampoline = isOverTrampoline(player);
      if (overTrampoline) {
        player.vy = -TRAMPOLINE.boostBounce;
        playBoing(true);
        triggerTrampolineImpact(1.1);
        engine.camera.shake(10, 0.36);
      } else {
        player.vy = -PLAYER.groundJump;
        playBoing(false);
        engine.camera.shake(5, 0.18);
      }
      player.onGround = false;
      player.onTrampoline = overTrampoline;
      player.jumpBuffer = 0;
    }

    player.vy += PLAYER.gravity * dt;
    player.vy = Math.min(player.vy, 1300);

    const prevBottom = player.y + player.h;

    player.x += player.vx * dt;
    player.y += player.vy * dt;

    player.x = clamp(player.x, PLAY_LEFT, PLAY_RIGHT - player.w);
    player.onGround = false;
    player.onTrampoline = false;

    const nowBottom = player.y + player.h;
    const overTrampoline = isOverTrampoline(player);
    const trampolineTouch = overTrampoline && prevBottom <= TRAMPOLINE.y && nowBottom >= TRAMPOLINE.y && player.vy > 0;
    const enteredTrampolineZone = overTrampoline && !player.wasOverTrampoline;
    const autoPassBounce =
      enteredTrampolineZone &&
      nowBottom >= TRAMPOLINE.y - 2 &&
      player.vy > -120;

    if (trampolineTouch || autoPassBounce) {
      player.y = TRAMPOLINE.y - player.h;
      const boosted = player.jumpBuffer > 0 || input.jumpHeld;
      const baseForce = autoPassBounce ? TRAMPOLINE.bounce * 0.94 : TRAMPOLINE.bounce;
      player.vy = -(boosted ? TRAMPOLINE.boostBounce : baseForce);
      player.jumpBuffer = 0;
      player.onTrampoline = true;

      playBoing(boosted);
      triggerTrampolineImpact(boosted ? 1.08 : autoPassBounce ? 0.9 : 1.0);
      engine.camera.shake(boosted ? 10 : 7, boosted ? 0.36 : 0.25);
    } else if (nowBottom >= FLOOR_Y) {
      player.y = FLOOR_Y - player.h;
      player.vy = 0;
      player.onGround = true;
      player.onTrampoline = false;
    }

    player.wasOverTrampoline = overTrampoline;
  }

  function isOverTrampoline(player) {
    const centerX = player.x + player.w * 0.5;
    return (
      centerX > TRAMPOLINE.x - TRAMPOLINE.width * 0.5 &&
      centerX < TRAMPOLINE.x + TRAMPOLINE.width * 0.5
    );
  }

  function getWaveConfig(wave) {
    if (wave === 1) {
      return {
        totalSpawns: 5,
        maxThreats: 2,
        spawnIntervalMin: 1.35,
        spawnIntervalMax: 1.9,
        burstChance: 0,
        difficulty: 0.06,
        scooterChance: 0.08,
        duoScooterChance: 0,
      };
    }

    const level = Math.max(0, wave - 1);
    return {
      totalSpawns: Math.round(5 + wave * 2.4),
      maxThreats: Math.min(13, 2 + Math.floor(wave * 1.35)),
      spawnIntervalMin: Math.max(0.26, 1.2 - level * 0.075),
      spawnIntervalMax: Math.max(0.52, 1.66 - level * 0.07),
      burstChance: Math.min(0.34, 0.05 + level * 0.03),
      difficulty: clamp(0.08 + level * 0.085, 0.08, 1),
      scooterChance: clamp(0.14 + level * 0.03, 0.14, 0.42),
      duoScooterChance: clamp(level <= 0 ? 0 : 0.08 + level * 0.03, 0, 0.34),
    };
  }

  function beginWave(wave) {
    state.wave = wave;
    state.waveState = "spawning";
    state.waveBreakTimer = 0;

    const waveCfg = getWaveConfig(wave);
    state.waveSpawnRemaining = waveCfg.totalSpawns;
    state.spawnTimer = wave === 1 ? 1.35 : 0.96;
    state.waveMessage = `BØLGE ${wave}`;
    state.waveBannerTimer = 1.45;
    playWaveStart(wave);
  }

  function updateSpawning(dt) {
    const activeThreats = state.enemies.filter((enemy) => !enemy.kicked && !enemy.remove).length;

    if (state.waveState === "break") {
      state.waveBreakTimer -= dt;
      if (state.waveBreakTimer <= 0) {
        beginWave(state.wave + 1);
      }
      return;
    }

    const waveCfg = getWaveConfig(state.wave);

    if (state.waveSpawnRemaining <= 0) {
      if (activeThreats === 0) {
        state.waveState = "break";
        state.waveBreakTimer = 2.3;
        state.waveMessage = `BØLGE ${state.wave} KLARERT`;
        state.waveBannerTimer = 1.3;
        playWaveClear();
      }
      return;
    }

    state.spawnTimer -= dt;
    if (state.spawnTimer > 0) {
      return;
    }

    if (activeThreats >= waveCfg.maxThreats) {
      state.spawnTimer = Math.max(0.08, state.spawnTimer + 0.1);
      return;
    }

    spawnEnemy(waveCfg.difficulty, waveCfg.scooterChance, waveCfg.duoScooterChance);
    state.waveSpawnRemaining -= 1;

    if (
      state.waveSpawnRemaining > 0 &&
      activeThreats + 1 < waveCfg.maxThreats &&
      Math.random() < waveCfg.burstChance
    ) {
      spawnEnemy(waveCfg.difficulty, waveCfg.scooterChance, waveCfg.duoScooterChance);
      state.waveSpawnRemaining -= 1;
    }

    state.spawnTimer = randRange(waveCfg.spawnIntervalMin, waveCfg.spawnIntervalMax);
  }

  function spawnEnemy(
    difficulty = clamp(state.elapsed / 95, 0, 1),
    scooterChance = lerp(0.12, 0.3, difficulty),
    duoScooterChance = 0.18,
  ) {
    const side = Math.random() < 0.5 ? -1 : 1;
    const direction = side === -1 ? 1 : -1;
    const speedScale = 0.84 + difficulty * 0.95;
    const roll = Math.random();
    const groundThreshold = lerp(0.68, 0.36, difficulty);
    const midThreshold = lerp(0.94, 0.74, difficulty);
    const spawnScooter = Math.random() < scooterChance;
    const scooterModel = choose(SCOOTER_MODELS);
    const duoScooter = spawnScooter && Math.random() < duoScooterChance;

    const enemy = {
      id: state.nextEnemyId,
      type: "ground",
      x: side === -1 ? -95 : GAME_WIDTH + 95,
      y: FLOOR_Y - 78,
      w: 56,
      h: 80,
      vx: direction * randRange(160, 215) * speedScale,
      vy: 0,
      gravity: 0,
      baseY: FLOOR_Y - 78,
      waveAmp: 0,
      waveFreq: 0,
      phase: randRange(0, Math.PI * 2),
      targetX: TRAMPOLINE.x + randRange(-18, 18),
      speechTimer: randRange(0.78, 1.3),
      nearSpeechDone: false,
      palette: choose(YOUTH_PALETTES),
      riderCount: 1,
      scooterBrand: scooterModel.brand,
      scooterColor: scooterModel.deck,
      scooterStem: scooterModel.stem,
      scooterText: scooterModel.text,
      scooterBounce: randRange(0, Math.PI * 2),
      kicked: false,
      trailTimer: 0,
      rot: 0,
      spin: 0,
      remove: false,
    };
    state.nextEnemyId += 1;

    if (spawnScooter) {
      enemy.type = duoScooter ? "scooter_duo" : "scooter";
      enemy.riderCount = duoScooter ? 2 : 1;
      enemy.w = duoScooter ? 86 : 68;
      enemy.h = duoScooter ? 94 : 88;
      enemy.y = FLOOR_Y - enemy.h;
      enemy.baseY = enemy.y;
      enemy.vx = direction * randRange(duoScooter ? 284 : 292, duoScooter ? 398 : 412) * speedScale;
    } else if (roll < groundThreshold) {
      enemy.type = "ground";
      enemy.y = FLOOR_Y - enemy.h;
      enemy.baseY = enemy.y;
      enemy.vx = direction * randRange(168, 232) * speedScale;
    } else if (roll < midThreshold) {
      enemy.type = "mid";
      enemy.w = 56;
      enemy.h = 74;
      enemy.baseY = TRAMPOLINE.y - randRange(90, 160);
      enemy.y = enemy.baseY;
      enemy.waveAmp = randRange(10, 26);
      enemy.waveFreq = randRange(3.3, 5.2);
      enemy.vx = direction * randRange(185, 262) * speedScale;
    } else {
      enemy.type = "drop";
      enemy.w = 56;
      enemy.h = 78;
      enemy.y = TRAMPOLINE.y - randRange(238, 315);
      enemy.baseY = enemy.y;
      enemy.vx = direction * randRange(130, 178) * speedScale;
      enemy.vy = randRange(40, 115);
      enemy.gravity = randRange(840, 1040);
    }

    playSpawnSound(enemy);
    state.enemies.push(enemy);
  }

  function updateEnemies(dt) {
    for (const enemy of state.enemies) {
      if (enemy.kicked) {
        enemy.vy += 1680 * dt;
        enemy.vy = Math.min(enemy.vy, 1150);
        enemy.x += enemy.vx * dt;
        enemy.y += enemy.vy * dt;
        enemy.rot += enemy.spin * dt;

        enemy.trailTimer -= dt;
        if (enemy.trailTimer <= 0) {
          enemy.trailTimer = 0.045;
          state.particles.push({
            x: enemy.x + enemy.w * 0.5,
            y: enemy.y + enemy.h * 0.45,
            vx: randRange(-70, 70),
            vy: randRange(-110, -40),
            life: randRange(0.16, 0.32),
            color: choose(["#fff4a3", "#ffd166", "#f8fbff"]),
            size: randRange(2, 4.5),
            rot: randRange(0, Math.PI * 2),
            spin: randRange(-7, 7),
            shape: "circle",
          });
        }

        if (enemy.x < -300 || enemy.x > GAME_WIDTH + 300 || enemy.y > GAME_HEIGHT + 240) {
          enemy.remove = true;
          state.puffs.push({
            x: clamp(enemy.x + enemy.w * 0.5, 24, GAME_WIDTH - 24),
            y: clamp(enemy.y + enemy.h * 0.5, 24, GAME_HEIGHT - 24),
            radius: 9,
            expand: randRange(70, 110),
            life: 0.28,
            color: "rgba(245, 251, 255, 0.65)",
          });
        }
        continue;
      }

      if (enemy.type === "ground") {
        enemy.x += enemy.vx * dt;
        enemy.y = FLOOR_Y - enemy.h + Math.sin(state.time * 6.5 + enemy.phase) * 2;
      } else if (isScooterEnemy(enemy)) {
        enemy.x += enemy.vx * dt;
        enemy.scooterBounce += dt * 11.5;
        enemy.y = FLOOR_Y - enemy.h + Math.sin(enemy.scooterBounce) * 1.4;
      } else if (enemy.type === "mid") {
        const centerX = enemy.x + enemy.w * 0.5;
        const toTarget = enemy.targetX - centerX;
        enemy.vx += clamp(toTarget * 0.75, -120, 120) * dt;
        enemy.vx = clamp(enemy.vx, -360, 360);
        enemy.x += enemy.vx * dt;

        if (Math.abs(toTarget) < 220) {
          const glideTargetY = TRAMPOLINE.y - enemy.h + 2;
          enemy.baseY = lerp(enemy.baseY, glideTargetY, dt * 2.1);
          enemy.waveAmp = lerp(enemy.waveAmp, 4, dt * 2.8);
        }

        enemy.y = enemy.baseY + Math.sin(state.time * enemy.waveFreq + enemy.phase) * enemy.waveAmp;
      } else {
        const centerX = enemy.x + enemy.w * 0.5;
        const toTarget = enemy.targetX - centerX;
        enemy.vx += clamp(toTarget * 1.05, -300, 300) * dt;
        enemy.vx = clamp(enemy.vx, -380, 380);

        enemy.vy += enemy.gravity * dt;
        enemy.vy = Math.min(enemy.vy, 760);
        enemy.x += enemy.vx * dt;
        enemy.y += enemy.vy * dt;
        if (enemy.y + enemy.h >= FLOOR_Y) {
          enemy.y = FLOOR_Y - enemy.h;
          enemy.vy = 0;
          enemy.type = "ground";
        }
      }

      enemy.speechTimer = Math.max(0, enemy.speechTimer - dt);
      const centerX = enemy.x + enemy.w * 0.5;
      if (!enemy.nearSpeechDone && Math.abs(centerX - TRAMPOLINE.x) < 320) {
        enemy.nearSpeechDone = true;
        enemy.speechTimer = Math.max(enemy.speechTimer, 1.08);
      }
    }
  }

  function resolveCombatAndLoss() {
    const player = state.player;
    const trampolineZone = {
      x: TRAMPOLINE.x - TRAMPOLINE.width * 0.42,
      y: TRAMPOLINE.y - 22,
      w: TRAMPOLINE.width * 0.84,
      h: TRAMPOLINE.height + 30,
    };

    const playerHit = {
      x: player.x + 16,
      y: player.y + 18,
      w: player.w - 32,
      h: player.h - 24,
    };

    for (const enemy of state.enemies) {
      if (enemy.kicked) {
        continue;
      }

      const enemyHit = {
        x: enemy.x + 8,
        y: enemy.y + 8,
        w: enemy.w - 16,
        h: enemy.h - 12,
      };

      if (rectsOverlap(enemyHit, trampolineZone)) {
        gameOver();
        return;
      }

      if (rectsOverlap(playerHit, enemyHit)) {
        handleDeflect(enemy);
      }
    }

    state.enemies = state.enemies.filter(
      (enemy) =>
        !enemy.remove &&
        enemy.x + enemy.w > -220 &&
        enemy.x < GAME_WIDTH + 220 &&
        enemy.y < GAME_HEIGHT + 250,
    );
  }

  function handleDeflect(enemy) {
    if (enemy.kicked) {
      return;
    }

    if (state.comboTimer > 0) {
      state.combo += 1;
    } else {
      state.combo = 1;
    }

    state.comboTimer = 1.45;

    const duoBonus = enemy.riderCount > 1 ? 90 : 0;
    const points = 110 + (state.combo - 1) * 35 + duoBonus;
    state.score += points;
    state.flash = 0.2;
    engine.camera.shake(8 + Math.min(10, state.combo), (8 + Math.min(10, state.combo)) / 28);

    const player = state.player;
    const playerCenter = player.x + player.w * 0.5;
    const enemyCenter = enemy.x + enemy.w * 0.5;
    const side = enemyCenter >= playerCenter ? 1 : -1;

    player.kickTimer = 0.22;
    player.kickSide = side;
    player.face = side;

    enemy.kicked = true;
    enemy.vx = side * randRange(520, 700);
    enemy.vy = -randRange(430, 620);
    enemy.spin = side * randRange(7.5, 12.2);
    enemy.rot = side * randRange(0.08, 0.2);
    enemy.speechTimer = 0;
    enemy.nearSpeechDone = true;
    enemy.y -= 4;

    const x = enemy.x + enemy.w * 0.5;
    const y = enemy.y + enemy.h * 0.48;
    spawnBoingEffects(x, y, points, state.combo, enemy.riderCount > 1);
    playHitCombo(state.combo);
    syncHud();
  }

  function spawnBoingEffects(x, y, points, combo, duoHit = false) {
    state.floatTexts.push({
      text: "BOING!",
      x,
      y: y - 8,
      vy: -68,
      life: 0.86,
      maxLife: 0.86,
      phase: randRange(0, Math.PI * 2),
      color: "#fff2ad",
      size: 34,
      weight: 800,
    });

    state.floatTexts.push({
      text: `+${points}`,
      x: x + 6,
      y: y + 20,
      vy: -54,
      life: 0.9,
      maxLife: 0.9,
      phase: randRange(0, Math.PI * 2),
      color: "#f5fbff",
      size: 27,
      weight: 700,
    });

    if (combo >= 2) {
      state.floatTexts.push({
        text: `KOMBO x${combo}`,
        x: x + randRange(-14, 14),
        y: y - 42,
        vy: -76,
        life: 0.84,
        maxLife: 0.84,
        phase: randRange(0, Math.PI * 2),
        color: "#baf7ff",
        size: 21,
        weight: 800,
      });
    }

    if (duoHit) {
      state.floatTexts.push({
        text: "DOBBELT!",
        x: x + randRange(-16, 16),
        y: y - 64,
        vy: -82,
        life: 0.88,
        maxLife: 0.88,
        phase: randRange(0, Math.PI * 2),
        color: "#ffe7ae",
        size: 22,
        weight: 800,
      });
    }

    state.puffs.push({
      x,
      y,
      radius: 14,
      expand: randRange(140, 190),
      life: 0.38,
      color: "rgba(245, 251, 255, 0.7)",
    });

    for (let i = 0; i < 26; i += 1) {
      state.particles.push({
        x,
        y,
        vx: randRange(-240, 240),
        vy: randRange(-290, -70),
        life: randRange(0.36, 0.75),
        color: choose(BOING_COLORS),
        size: randRange(3, 7),
        rot: randRange(0, Math.PI * 2),
        spin: randRange(-8, 8),
        shape: Math.random() < 0.45 ? "square" : "circle",
      });
    }
  }

  function render() {
    drawBackground();
    drawBuildings();
    drawCourtyard();
    drawTrampoline(false);
    drawKids();
    drawEnemies();
    drawPlayer(state.player);
    drawTrampoline(true);
    drawSpeechBubbles();
    drawEffects();

    if (state.mode === "playing" && state.waveBannerTimer > 0) {
      drawWaveBanner();
    }

    if (state.mode === "gameover") {
      drawCryBanner();
    }

    if (state.flash > 0) {
      ctx.fillStyle = `rgba(255, 255, 255, ${state.flash * 0.45})`;
      ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    }

    if (state.mode === "playing" || state.mode === "gameover") {
      drawScore();
    }
  }

  function drawBackground() {
    const w = GAME_WIDTH;

    const sky = ctx.createLinearGradient(0, 0, 0, GAME_HEIGHT);
    sky.addColorStop(0, "#f9fdff");
    sky.addColorStop(0.45, "#e3f4ff");
    sky.addColorStop(1, "#c8e4f2");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    const lightBand = ctx.createLinearGradient(0, 0, 0, 260);
    lightBand.addColorStop(0, "rgba(255, 249, 228, 0.78)");
    lightBand.addColorStop(1, "rgba(255, 249, 228, 0)");
    ctx.fillStyle = lightBand;
    ctx.fillRect(0, 0, GAME_WIDTH, 260);

    ctx.fillStyle = "rgba(177, 206, 222, 0.54)";
    ctx.beginPath();
    ctx.moveTo(0, 420);
    ctx.lineTo(w * 0.125, 394);
    ctx.lineTo(w * 0.25, 406);
    ctx.lineTo(w * 0.4, 384);
    ctx.lineTo(w * 0.567, 402);
    ctx.lineTo(w * 0.717, 390);
    ctx.lineTo(w * 0.867, 408);
    ctx.lineTo(w, 392);
    ctx.lineTo(w, 520);
    ctx.lineTo(0, 520);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "rgba(157, 188, 208, 0.58)";
    ctx.beginPath();
    ctx.moveTo(0, 456);
    ctx.lineTo(w * 0.15, 438);
    ctx.lineTo(w * 0.3, 448);
    ctx.lineTo(w * 0.467, 430);
    ctx.lineTo(w * 0.633, 446);
    ctx.lineTo(w * 0.8, 434);
    ctx.lineTo(w, 452);
    ctx.lineTo(w, 528);
    ctx.lineTo(0, 528);
    ctx.closePath();
    ctx.fill();

    for (const cloud of state.clouds) {
      const bob = Math.sin(state.time * 0.5 + cloud.phase) * 3;
      drawCloud(cloud.x, cloud.y + bob, cloud.w, cloud.h);
    }
  }

  function drawCloud(x, y, w, h) {
    ctx.fillStyle = "rgba(252, 255, 255, 0.88)";
    ctx.beginPath();
    ctx.ellipse(x, y, w * 0.28, h * 0.32, 0, 0, Math.PI * 2);
    ctx.ellipse(x + w * 0.2, y - h * 0.12, w * 0.24, h * 0.3, 0, 0, Math.PI * 2);
    ctx.ellipse(x - w * 0.2, y - h * 0.08, w * 0.24, h * 0.27, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawBuildings() {
    const rightBuildingX = GAME_WIDTH - 370;

    drawBuilding(70, 228, 300, 272, "#e5dfd6", "#cec5bb");
    drawBuilding(rightBuildingX, 210, 290, 290, "#e2d5cd", "#c8b9af");

    ctx.fillStyle = "rgba(144, 118, 88, 0.36)";
    let postIndex = 0;
    for (let x = 18; x < GAME_WIDTH + 22; x += 42) {
      const h = 26 + ((postIndex * 11) % 8);
      roundedRect(ctx, x, 480 - h, 18, h, 3);
      ctx.fill();
      postIndex += 1;
    }

    ctx.fillStyle = "rgba(117, 95, 74, 0.32)";
    ctx.fillRect(0, 462, GAME_WIDTH, 6);
    ctx.fillRect(0, 488, GAME_WIDTH, 5);

    ctx.fillStyle = "rgba(78, 128, 89, 0.76)";
    let hedgeIndex = 0;
    for (let x = -12; x < GAME_WIDTH + 92; x += 92) {
      const wobble = Math.sin(hedgeIndex * 1.9 + state.time * 0.35) * 2.4;
      roundedRect(ctx, x, 495 + wobble, 96, 24, 8);
      ctx.fill();
      hedgeIndex += 1;
    }
  }

  function drawBuilding(x, y, w, h, wallColor, shadeColor) {
    const g = ctx.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, wallColor);
    g.addColorStop(1, shadeColor);
    ctx.fillStyle = g;
    roundedRect(ctx, x, y, w, h, 12);
    ctx.fill();

    ctx.fillStyle = "rgba(106, 132, 151, 0.24)";
    roundedRect(ctx, x + 10, y + 12, w - 20, h - 24, 10);
    ctx.fill();

    const cols = 4;
    const rows = 5;
    const gapX = (w - 52) / cols;
    const gapY = (h - 70) / rows;
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const wx = x + 16 + col * gapX;
        const wy = y + 18 + row * gapY;
        ctx.fillStyle = row === 0 && col % 2 === 0 ? "rgba(255, 236, 164, 0.75)" : "rgba(225, 244, 255, 0.68)";
        roundedRect(ctx, wx, wy, 30, 24, 5);
        ctx.fill();
      }
    }

    ctx.fillStyle = "rgba(0, 0, 0, 0.11)";
    for (let i = 0; i < cols; i += 1) {
      const bx = x + 22 + i * gapX;
      ctx.fillRect(bx, y + 58, 36, 6);
      ctx.fillRect(bx, y + 126, 36, 6);
      ctx.fillRect(bx, y + 194, 36, 6);
    }
  }

  function drawCourtyard() {
    const ground = ctx.createLinearGradient(0, FLOOR_Y - 22, 0, GAME_HEIGHT);
    ground.addColorStop(0, "#a8c97d");
    ground.addColorStop(1, "#7f9f61");
    ctx.fillStyle = ground;
    ctx.fillRect(0, FLOOR_Y - 20, GAME_WIDTH, GAME_HEIGHT - FLOOR_Y + 20);

    const path = ctx.createLinearGradient(TRAMPOLINE.x - 220, FLOOR_Y - 48, TRAMPOLINE.x + 220, FLOOR_Y + 24);
    path.addColorStop(0, "rgba(229, 221, 206, 0.96)");
    path.addColorStop(1, "rgba(201, 192, 176, 0.96)");
    ctx.fillStyle = path;
    roundedRect(ctx, TRAMPOLINE.x - 310, FLOOR_Y - 36, 620, 55, 22);
    ctx.fill();

    ctx.fillStyle = "rgba(49, 93, 72, 0.34)";
    const stripeOffset = (state.time * 14) % 48;
    for (let x = -48 + stripeOffset; x < GAME_WIDTH + 48; x += 48) {
      const wobble = Math.sin(x * 0.04) * 2;
      ctx.fillRect(x, FLOOR_Y + 16 + wobble, 3, 8);
    }
  }

  function drawTrampoline(frontOnly) {
    const baseLeft = TRAMPOLINE.x - TRAMPOLINE.width * 0.5;
    const baseRight = TRAMPOLINE.x + TRAMPOLINE.width * 0.5;
    const kick = state.trampolineKick;
    const sink = kick * 7;
    const spread = kick * 22;
    const topY = TRAMPOLINE.y + sink;
    const rimHeight = Math.max(18, TRAMPOLINE.height - sink * 0.62);
    const left = TRAMPOLINE.x - (TRAMPOLINE.width + spread) * 0.5;
    const right = TRAMPOLINE.x + (TRAMPOLINE.width + spread) * 0.5;

    if (!frontOnly) {
      ctx.strokeStyle = "#46626f";
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo(baseLeft + 24, topY + 8);
      ctx.lineTo(baseLeft + 36, FLOOR_Y - 2);
      ctx.moveTo(baseRight - 24, topY + 8);
      ctx.lineTo(baseRight - 36, FLOOR_Y - 2);
      ctx.moveTo(TRAMPOLINE.x - 64, topY + 10);
      ctx.lineTo(TRAMPOLINE.x - 52, FLOOR_Y - 2);
      ctx.moveTo(TRAMPOLINE.x + 64, topY + 10);
      ctx.lineTo(TRAMPOLINE.x + 52, FLOOR_Y - 2);
      ctx.stroke();

      const mat = ctx.createLinearGradient(0, topY - 14, 0, topY + 20);
      mat.addColorStop(0, "#2e2f44");
      mat.addColorStop(1, "#1b1c2b");
      ctx.fillStyle = mat;
      roundedRect(ctx, left + 14, topY - 14, right - left - 28, 22, 10);
      ctx.fill();

      for (const wave of state.trampolineWaves) {
        const alpha = clamp(wave.life / wave.maxLife, 0, 1);
        ctx.strokeStyle = `rgba(255, 245, 194, ${alpha * 0.65})`;
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.ellipse(TRAMPOLINE.x, topY - 3, wave.radius, 9 + wave.radius * 0.085, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    const rim = ctx.createLinearGradient(left, topY - 9, right, topY + 16);
    rim.addColorStop(0, "#2ec4b6");
    rim.addColorStop(0.5, "#6be6da");
    rim.addColorStop(1, "#2ec4b6");
    ctx.fillStyle = rim;
    roundedRect(ctx, left, topY - 9, right - left, rimHeight, 14);
    ctx.fill();

    ctx.fillStyle = `rgba(255,255,255,${0.24 + kick * 0.26})`;
    roundedRect(ctx, left + 14, topY - 6, right - left - 28, 5, 4);
    ctx.fill();

    if (kick > 0.02) {
      ctx.fillStyle = `rgba(255, 247, 186, ${kick * 0.22})`;
      roundedRect(ctx, left + 24, topY - 4, right - left - 48, 3, 3);
      ctx.fill();
    }
  }

  function drawKids() {
    for (const kid of state.kids) {
      const bounce = state.mode === "gameover" ? 0 : Math.abs(Math.sin(kid.bouncePhase)) * 18;
      const x = TRAMPOLINE.x + kid.offsetX;
      const y = TRAMPOLINE.y - 24 - bounce;
      drawKid(x, y, state.mode === "gameover", kid.cryPhase);
    }
  }

  function drawKid(x, y, crying, cryPhase) {
    ctx.save();
    ctx.translate(x, y);

    ctx.fillStyle = "rgba(9, 26, 32, 0.22)";
    ctx.beginPath();
    ctx.ellipse(0, 23, 14, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#ff8fab";
    roundedRect(ctx, -10, -2, 20, 26, 6);
    ctx.fill();

    ctx.fillStyle = "#f7d6c4";
    ctx.beginPath();
    ctx.arc(0, -12, 10, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#d39b62";
    ctx.beginPath();
    ctx.arc(0, -15, 8, Math.PI, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#17303d";
    ctx.fillRect(-5, 19, 4, 9);
    ctx.fillRect(1, 19, 4, 9);

    ctx.fillStyle = "#263648";
    ctx.beginPath();
    ctx.arc(-3, -13, 1.2, 0, Math.PI * 2);
    ctx.arc(3, -13, 1.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "#3e2b32";
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    if (crying) {
      ctx.arc(0, -8, 4, Math.PI, Math.PI * 2);
    } else {
      ctx.arc(0, -10, 3.8, 0, Math.PI);
    }
    ctx.stroke();

    if (crying) {
      const tearOffset = (Math.sin(cryPhase * 5.2) * 0.5 + 0.5) * 8;
      ctx.fillStyle = "rgba(135, 206, 250, 0.95)";
      ctx.beginPath();
      ctx.ellipse(-3, -11 + tearOffset, 1.7, 3.2, 0, 0, Math.PI * 2);
      ctx.ellipse(3, -11 + ((tearOffset + 4) % 10), 1.7, 3.2, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  function drawPlayer(player) {
    const cx = player.x + player.w * 0.5;
    const top = player.y;
    const tilt = clamp(player.vx / PLAYER.maxMoveSpeed, -1, 1) * 0.08;

    ctx.save();
    ctx.translate(cx, top + player.h * 0.55);
    ctx.rotate(tilt);

    ctx.fillStyle = "rgba(9, 26, 33, 0.32)";
    ctx.beginPath();
    ctx.ellipse(0, player.h * 0.48, 34, 10, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#8e97a8";
    roundedRect(ctx, -24, 22, 18, 40, 7);
    ctx.fill();
    roundedRect(ctx, 6, 22, 18, 40, 7);
    ctx.fill();

    if (player.kickTimer > 0) {
      const kickProgress = 1 - player.kickTimer / 0.22;
      const side = player.kickSide || player.face || 1;
      const extend = 12 + Math.sin(kickProgress * Math.PI) * 24;
      const rise = Math.sin(kickProgress * Math.PI) * 12;

      ctx.save();
      ctx.translate(side * 10, 30 - rise);
      if (side < 0) {
        ctx.scale(-1, 1);
      }
      ctx.rotate(-0.75 + Math.sin(kickProgress * Math.PI) * -0.15);
      ctx.fillStyle = "#8e97a8";
      roundedRect(ctx, 0, -8, extend, 14, 5);
      ctx.fill();
      ctx.fillStyle = "#3f4b57";
      roundedRect(ctx, extend - 8, -9, 11, 7, 3);
      ctx.fill();
      ctx.restore();
    }

    const shirt = ctx.createLinearGradient(0, -2, 0, 62);
    shirt.addColorStop(0, "#ffffff");
    shirt.addColorStop(1, "#edf3fb");
    ctx.fillStyle = shirt;
    roundedRect(ctx, -31, -2, 62, 64, 12);
    ctx.fill();

    ctx.fillStyle = "rgba(0, 0, 0, 0.07)";
    ctx.fillRect(-30, 30, 60, 2);

    ctx.strokeStyle = "rgba(164, 177, 196, 0.62)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(0, 4);
    ctx.lineTo(0, 50);
    ctx.stroke();

    ctx.fillStyle = "#fbfdff";
    roundedRect(ctx, -36, 8, 12, 19, 4);
    ctx.fill();
    roundedRect(ctx, 24, 8, 12, 19, 4);
    ctx.fill();

    ctx.strokeStyle = "rgba(162, 176, 196, 0.72)";
    ctx.lineWidth = 1.1;
    roundedRect(ctx, -36, 8, 12, 19, 4);
    ctx.stroke();
    roundedRect(ctx, 24, 8, 12, 19, 4);
    ctx.stroke();

    ctx.fillStyle = "#dce5f0";
    roundedRect(ctx, -36, 22, 12, 6, 3);
    ctx.fill();
    roundedRect(ctx, 24, 22, 12, 6, 3);
    ctx.fill();

    ctx.fillStyle = "#f0d2bf";
    roundedRect(ctx, -35, 25, 10, 23, 5);
    ctx.fill();
    roundedRect(ctx, 25, 25, 10, 23, 5);
    ctx.fill();

    ctx.strokeStyle = "rgba(150, 117, 98, 0.45)";
    ctx.lineWidth = 0.9;
    roundedRect(ctx, -35, 25, 10, 23, 5);
    ctx.stroke();
    roundedRect(ctx, 25, 25, 10, 23, 5);
    ctx.stroke();

    ctx.fillStyle = "#f0d2bf";
    ctx.beginPath();
    ctx.arc(0, -24, 22, 0, Math.PI * 2);
    ctx.fill();

    if (larsPhotoReady) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(0, -24, 20, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(larsPhoto, -22, -46, 44, 44);
      ctx.restore();
    } else {
      ctx.fillStyle = "#8f6a55";
      ctx.beginPath();
      ctx.arc(0, -29, 19, Math.PI, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = "rgba(231, 241, 250, 0.23)";
    ctx.strokeStyle = "#59606c";
    ctx.lineWidth = 2;
    roundedRect(ctx, -18, -30, 14, 11, 4);
    ctx.fill();
    ctx.stroke();
    roundedRect(ctx, 4, -30, 14, 11, 4);
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = "rgba(89, 96, 108, 0.95)";
    ctx.lineWidth = 1.7;
    ctx.beginPath();
    ctx.moveTo(-4, -24.5);
    ctx.lineTo(4, -24.5);
    ctx.moveTo(-18, -24.5);
    ctx.lineTo(-23, -22.8);
    ctx.moveTo(18, -24.5);
    ctx.lineTo(23, -22.8);
    ctx.stroke();

    const blink = Math.sin(player.blinkPhase) > 0.96;
    ctx.strokeStyle = "#243746";
    ctx.lineWidth = 1.6;
    if (blink) {
      ctx.beginPath();
      ctx.moveTo(-12.5, -24.5);
      ctx.lineTo(-9.5, -24.5);
      ctx.moveTo(9.5, -24.5);
      ctx.lineTo(12.5, -24.5);
      ctx.stroke();
    } else {
      ctx.fillStyle = "#243746";
      ctx.beginPath();
      ctx.arc(-11, -24.5, 1.15, 0, Math.PI * 2);
      ctx.arc(11, -24.5, 1.15, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.strokeStyle = "#8f7c70";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-5, -16.5);
    ctx.lineTo(5, -16.5);
    ctx.stroke();

    ctx.strokeStyle = "#7f4f3e";
    ctx.lineWidth = 1.9;
    ctx.beginPath();
    ctx.arc(0, -15.1, 4.1, 0.1, Math.PI - 0.1);
    ctx.stroke();

    ctx.fillStyle = "rgba(18, 30, 41, 0.14)";
    ctx.beginPath();
    ctx.ellipse(0, -10.8, 12.8, 7.8, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "rgba(18, 30, 41, 0.1)";
    ctx.beginPath();
    ctx.ellipse(0, -8.8, 9.6, 5.1, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "rgba(18, 30, 41, 0.07)";
    ctx.beginPath();
    ctx.ellipse(-5.4, -10.1, 3.2, 2, 0, 0, Math.PI * 2);
    ctx.ellipse(5.4, -10.1, 3.2, 2, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  function drawEnemies() {
    const sorted = [...state.enemies].sort((a, b) => a.y - b.y);
    for (const enemy of sorted) {
      drawEnemy(enemy);
    }
  }

  function drawEnemy(enemy) {
    const x = enemy.x + enemy.w * 0.5;
    const y = enemy.y;

    ctx.save();
    ctx.translate(x, y + enemy.h * 0.5);

    const lean = enemy.kicked ? enemy.rot : clamp(enemy.vx / 280, -1, 1) * 0.12;
    ctx.rotate(lean);

    if (enemy.kicked) {
      const trailSide = enemy.vx >= 0 ? -1 : 1;
      ctx.strokeStyle = "rgba(255, 255, 255, 0.45)";
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(trailSide * 36, -18);
      ctx.lineTo(trailSide * 56, -8);
      ctx.moveTo(trailSide * 32, 2);
      ctx.lineTo(trailSide * 54, 10);
      ctx.stroke();
    }

    const scooterEnemy = isScooterEnemy(enemy);

    ctx.fillStyle = "rgba(8, 25, 33, 0.24)";
    ctx.beginPath();
    ctx.ellipse(0, enemy.h * 0.48, scooterEnemy ? (enemy.riderCount > 1 ? 43 : 34) : 24, 7, 0, 0, Math.PI * 2);
    ctx.fill();

    if (scooterEnemy && !enemy.kicked) {
      drawScooter(enemy);
      if (enemy.riderCount > 1) {
        drawScooterPassenger(enemy);
      }
    }

    const swing = enemy.kicked ? 0 : Math.sin(state.time * (scooterEnemy ? 11 : 8.6) + enemy.phase) * 2.8;
    let leftLeg = { x: -15, y: 15, w: 11, h: 33 };
    let rightLeg = { x: 4, y: 15, w: 11, h: 33 };

    if (scooterEnemy && !enemy.kicked) {
      const movingRight = enemy.vx >= 0;
      if (movingRight) {
        leftLeg = { x: -14, y: 13, w: 11, h: 28 };
        rightLeg = { x: 5, y: 9, w: 11, h: 32 };
      } else {
        leftLeg = { x: -14, y: 9, w: 11, h: 32 };
        rightLeg = { x: 5, y: 13, w: 11, h: 28 };
      }
    } else {
      leftLeg.x += swing;
      rightLeg.x -= swing;
      leftLeg.y += Math.abs(swing) * 0.2;
      rightLeg.y += Math.abs(swing) * 0.12;
    }

    ctx.fillStyle = enemy.palette.pants;
    roundedRect(ctx, leftLeg.x, leftLeg.y, leftLeg.w, leftLeg.h, 4);
    ctx.fill();
    roundedRect(ctx, rightLeg.x, rightLeg.y, rightLeg.w, rightLeg.h, 4);
    ctx.fill();

    ctx.fillStyle = "rgba(16, 24, 36, 0.18)";
    ctx.fillRect(leftLeg.x + leftLeg.w - 2, leftLeg.y + 2, 1, leftLeg.h - 2);
    ctx.fillRect(rightLeg.x + rightLeg.w - 2, rightLeg.y + 2, 1, rightLeg.h - 2);

    ctx.fillStyle = "#f5f7fa";
    ctx.fillRect(leftLeg.x + 1, leftLeg.y + leftLeg.h - 12, leftLeg.w - 2, 5);
    ctx.fillRect(rightLeg.x + 1, rightLeg.y + rightLeg.h - 12, rightLeg.w - 2, 5);

    ctx.fillStyle = enemy.palette.shoe;
    roundedRect(ctx, leftLeg.x - 1, leftLeg.y + leftLeg.h - 5, leftLeg.w + 2, 8, 3);
    ctx.fill();
    roundedRect(ctx, rightLeg.x - 1, rightLeg.y + rightLeg.h - 5, rightLeg.w + 2, 8, 3);
    ctx.fill();

    ctx.fillStyle = enemy.palette.blazer;
    roundedRect(ctx, -24, -10, 48, 42, 10);
    ctx.fill();

    ctx.fillStyle = enemy.palette.shirt;
    roundedRect(ctx, -10, -7, 20, 23, 5);
    ctx.fill();

    ctx.strokeStyle = "rgba(56, 69, 84, 0.65)";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(-5, -7);
    ctx.lineTo(0, 2);
    ctx.lineTo(5, -7);
    ctx.stroke();

    if (enemy.palette.accessory === "scarf") {
      ctx.fillStyle = "#efe1c8";
      roundedRect(ctx, -15, -11, 30, 8, 3);
      ctx.fill();
      ctx.fillRect(6, -3, 4, 15);
    } else if (enemy.palette.accessory === "sweater") {
      ctx.strokeStyle = "#f3d7b6";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-18, -6);
      ctx.lineTo(18, -6);
      ctx.moveTo(-13, -6);
      ctx.lineTo(-4, 15);
      ctx.moveTo(13, -6);
      ctx.lineTo(4, 15);
      ctx.stroke();
    } else if (enemy.palette.accessory === "vneck") {
      ctx.strokeStyle = "#d9e4f6";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-8, -4);
      ctx.lineTo(0, 7);
      ctx.lineTo(8, -4);
      ctx.stroke();
    }

    ctx.fillStyle = "#f1ccb5";
    ctx.beginPath();
    ctx.arc(0, -18, 14, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = enemy.palette.hair;
    ctx.beginPath();
    ctx.ellipse(0, -24.5, 14, 8.5, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(6, -21.5, 6.4, 4, -0.2, Math.PI * 1.1, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "rgba(255, 255, 255, 0.12)";
    roundedRect(ctx, -5, -28, 3, 5, 2);
    ctx.fill();

    ctx.fillStyle = "#273a48";
    roundedRect(ctx, -11, -22.5, 9, 4.5, 2);
    ctx.fill();
    roundedRect(ctx, 2, -22.5, 9, 4.5, 2);
    ctx.fill();
    ctx.fillRect(-2, -21.2, 4, 1.8);

    ctx.fillStyle = "#203442";
    ctx.beginPath();
    ctx.arc(-4.8, -18.2, 1.2, 0, Math.PI * 2);
    ctx.arc(4.8, -18.2, 1.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "#3d2f34";
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(0, -13.2, 4.1, 0, Math.PI);
    ctx.stroke();

    if (enemy.type === "mid" && !enemy.kicked) {
      ctx.fillStyle = "rgba(250, 253, 255, 0.25)";
      roundedRect(ctx, -30, 30, 60, 7, 3);
      ctx.fill();
    }

    if (enemy.type === "drop" && !enemy.kicked) {
      ctx.fillStyle = "rgba(255,255,255,0.3)";
      ctx.fillRect(-28, -4, 6, 16);
      ctx.fillRect(22, -4, 6, 16);
    }

    if (scooterEnemy && !enemy.kicked) {
      drawScooterCockpit(enemy);

      const speedSide = enemy.vx >= 0 ? -1 : 1;
      ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(speedSide * 42, 8);
      ctx.lineTo(speedSide * 60, 8);
      ctx.moveTo(speedSide * 38, 18);
      ctx.lineTo(speedSide * 56, 18);
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawScooter(enemy) {
    const dir = enemy.vx >= 0 ? 1 : -1;
    const stemX = dir * (enemy.riderCount > 1 ? 30 : 24);
    const deckHalf = enemy.riderCount > 1 ? 38 : 30;
    const wheelOffset = enemy.riderCount > 1 ? 28 : 20;

    ctx.fillStyle = enemy.scooterColor;
    roundedRect(ctx, -deckHalf, 34, deckHalf * 2, 8, 4);
    ctx.fill();

    ctx.fillStyle = "rgba(255, 255, 255, 0.24)";
    roundedRect(ctx, -deckHalf + 4, 35, deckHalf * 2 - 8, 2.4, 2);
    ctx.fill();

    ctx.fillStyle = enemy.scooterText;
    ctx.font = "800 9px Manrope";
    ctx.textAlign = "center";
    ctx.fillText(enemy.scooterBrand, 0, 41.3);

    ctx.strokeStyle = "rgba(18, 26, 34, 0.58)";
    ctx.lineWidth = 7;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(stemX, 34);
    ctx.lineTo(stemX, 12);
    ctx.stroke();

    ctx.strokeStyle = enemy.scooterStem;
    ctx.lineWidth = 4.2;
    ctx.beginPath();
    ctx.moveTo(stemX, 34);
    ctx.lineTo(stemX, 12);
    ctx.stroke();

    ctx.strokeStyle = enemy.scooterStem;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(stemX, 34);
    ctx.lineTo(stemX - dir * 8, 38);
    ctx.stroke();

    ctx.fillStyle = "#272d3d";
    ctx.beginPath();
    ctx.arc(-wheelOffset, 42, 7, 0, Math.PI * 2);
    ctx.arc(wheelOffset, 42, 7, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "rgba(255,255,255,0.22)";
    ctx.beginPath();
    ctx.arc(-wheelOffset, 42, 3, 0, Math.PI * 2);
    ctx.arc(wheelOffset, 42, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawScooterPassenger(enemy) {
    const dir = enemy.vx >= 0 ? 1 : -1;
    const backX = dir * -13;

    ctx.save();
    ctx.translate(backX, -17);

    ctx.fillStyle = "rgba(6, 18, 26, 0.22)";
    ctx.beginPath();
    ctx.ellipse(0, 40, 11, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = enemy.palette.pants;
    roundedRect(ctx, -8, 22, 7, 19, 3);
    ctx.fill();
    roundedRect(ctx, 1, 22, 7, 19, 3);
    ctx.fill();

    ctx.fillStyle = enemy.palette.blazer;
    roundedRect(ctx, -11, -1, 22, 25, 6);
    ctx.fill();

    ctx.fillStyle = enemy.palette.shirt;
    roundedRect(ctx, -4, 1, 8, 12, 2);
    ctx.fill();

    ctx.fillStyle = "#f1ccb5";
    ctx.beginPath();
    ctx.arc(0, -8, 8.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = enemy.palette.hair;
    ctx.beginPath();
    ctx.ellipse(0, -11.5, 8, 4.5, 0, Math.PI, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#203442";
    ctx.beginPath();
    ctx.arc(-3.1, -8.4, 0.9, 0, Math.PI * 2);
    ctx.arc(3.1, -8.4, 0.9, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "#3d2f34";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(0, -4.8, 2.5, 0, Math.PI);
    ctx.stroke();

    ctx.restore();
  }

  function drawScooterCockpit(enemy) {
    const dir = enemy.vx >= 0 ? 1 : -1;
    const stemX = dir * (enemy.riderCount > 1 ? 30 : 24);
    const topY = -16;

    ctx.strokeStyle = "rgba(16, 24, 34, 0.62)";
    ctx.lineWidth = 7.6;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(stemX, 15);
    ctx.lineTo(stemX, topY);
    ctx.stroke();

    ctx.strokeStyle = enemy.scooterStem;
    ctx.lineWidth = 4.8;
    ctx.beginPath();
    ctx.moveTo(stemX, 15);
    ctx.lineTo(stemX, topY);
    ctx.stroke();

    ctx.strokeStyle = "rgba(15, 30, 40, 0.8)";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(stemX - dir * 12, topY);
    ctx.lineTo(stemX + dir * 12, topY);
    ctx.stroke();

    ctx.strokeStyle = "#dbe6ef";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(stemX - dir * 6, topY - 0.5);
    ctx.lineTo(stemX + dir * 6, topY - 0.5);
    ctx.stroke();

    ctx.fillStyle = "#1c2a36";
    ctx.beginPath();
    ctx.arc(stemX - dir * 12, topY, 2.3, 0, Math.PI * 2);
    ctx.arc(stemX + dir * 12, topY, 2.3, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "rgba(210, 232, 247, 0.7)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(stemX + dir * 4, topY + 1);
    ctx.lineTo(stemX + dir * 9, topY + 8);
    ctx.stroke();
  }

  function drawSpeechBubbles() {
    const talking = state.enemies
      .filter((enemy) => !enemy.kicked && enemy.speechTimer > 0)
      .slice(0, 4);
    for (const enemy of talking) {
      const t = clamp(enemy.speechTimer, 0, 1);
      const alpha = 0.55 + t * 0.45;
      const x = enemy.x + enemy.w * 0.5;
      const y = enemy.y - 24;

      const text = "Hold kjeft gamle mann";
      ctx.font = "700 15px Manrope";
      const textW = ctx.measureText(text).width;

      const bubbleW = textW + 20;
      const bubbleH = 28;

      ctx.fillStyle = `rgba(255, 255, 255, ${0.9 * alpha})`;
      roundedRect(ctx, x - bubbleW * 0.5, y - bubbleH, bubbleW, bubbleH, 10);
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(x - 8, y);
      ctx.lineTo(x + 2, y);
      ctx.lineTo(x - 3, y + 9);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = `rgba(33, 45, 58, ${alpha})`;
      ctx.textAlign = "center";
      ctx.fillText(text, x, y - 10);
    }
  }

  function drawEffects() {
    for (const puff of state.puffs) {
      const alpha = clamp(puff.life / 0.38, 0, 1);
      ctx.strokeStyle = puff.color.replace("0.7", String(alpha * 0.75));
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(puff.x, puff.y, puff.radius, 0, Math.PI * 2);
      ctx.stroke();
    }

    for (const particle of state.particles) {
      const alpha = clamp(particle.life / 0.75, 0, 1);
      ctx.save();
      ctx.translate(particle.x, particle.y);
      ctx.rotate(particle.rot);
      ctx.fillStyle = colorWithAlpha(particle.color, alpha);

      if (particle.shape === "square") {
        ctx.fillRect(-particle.size * 0.5, -particle.size * 0.5, particle.size, particle.size);
      } else {
        ctx.beginPath();
        ctx.arc(0, 0, particle.size * 0.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    for (const text of state.floatTexts) {
      const alpha = clamp(text.life / text.maxLife, 0, 1);
      ctx.fillStyle = colorWithAlpha(text.color, alpha);
      ctx.font = `${text.weight} ${text.size}px Baloo 2`;
      ctx.textAlign = "center";
      ctx.fillText(text.text, text.x, text.y);
    }
  }

  function drawCryBanner() {
    const pulse = 0.55 + Math.sin(state.time * 5.2) * 0.18;
    ctx.fillStyle = `rgba(255, 241, 220, ${pulse * 0.58})`;
    roundedRect(ctx, TRAMPOLINE.x - 132, TRAMPOLINE.y - 112, 264, 38, 12);
    ctx.fill();

    ctx.fillStyle = "rgba(60, 45, 43, 0.9)";
    ctx.textAlign = "center";
    ctx.font = "800 21px Baloo 2";
    ctx.fillText("BUHU!", TRAMPOLINE.x, TRAMPOLINE.y - 86);
  }

  function drawWaveBanner() {
    const t = clamp(state.waveBannerTimer / 1.45, 0, 1);
    const alpha = Math.sin(t * Math.PI) * 0.9;
    const y = 116 - (1 - t) * 12;

    ctx.fillStyle = `rgba(255, 247, 216, ${alpha * 0.8})`;
    roundedRect(ctx, TRAMPOLINE.x - 168, y - 24, 336, 46, 14);
    ctx.fill();

    ctx.fillStyle = `rgba(41, 52, 63, ${alpha})`;
    ctx.textAlign = "center";
    ctx.font = "800 28px Baloo 2";
    ctx.fillText(state.waveMessage, TRAMPOLINE.x, y + 8);
  }

  function syncHud() {
    // Score is drawn on canvas; best is shown on game-over overlay.
  }

  function isScooterEnemy(enemy) {
    return enemy.type === "scooter" || enemy.type === "scooter_duo";
  }

  function drawScore() {
    const pad = 28;
    const label = String(state.score);

    ctx.textAlign = "right";
    ctx.textBaseline = "top";

    ctx.font = "800 52px Baloo 2";
    ctx.fillStyle = "rgba(10, 30, 45, 0.28)";
    ctx.fillText(label, GAME_WIDTH - pad + 2, pad + 2);

    ctx.fillStyle = "rgba(255, 255, 255, 0.92)";
    ctx.fillText(label, GAME_WIDTH - pad, pad);

    ctx.textBaseline = "alphabetic";
  }

  function clamp(v, lo, hi) { return engine.clamp(v, lo, hi); }
  function lerp(a, b, t)    { return engine.lerp(a, b, t); }
  function randRange(lo, hi) { return engine.random(lo, hi); }

  function choose(items) {
    return items[Math.floor(Math.random() * items.length)];
  }

  function rectsOverlap(a, b) {
    return engine.collide.rectRect(a.x, a.y, a.w, a.h, b.x, b.y, b.w, b.h);
  }

  function roundedRect(context, x, y, width, height, radius) {
    const r = Math.min(radius, width * 0.5, height * 0.5);
    context.beginPath();
    context.moveTo(x + r, y);
    context.lineTo(x + width - r, y);
    context.quadraticCurveTo(x + width, y, x + width, y + r);
    context.lineTo(x + width, y + height - r);
    context.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    context.lineTo(x + r, y + height);
    context.quadraticCurveTo(x, y + height, x, y + height - r);
    context.lineTo(x, y + r);
    context.quadraticCurveTo(x, y, x + r, y);
    context.closePath();
  }

  function colorWithAlpha(color, alpha) {
    if (color.startsWith("rgba")) {
      return color.replace(/rgba\(([^,]+),([^,]+),([^,]+),[^)]+\)/, (_match, r, g, b) => {
        return `rgba(${r.trim()}, ${g.trim()}, ${b.trim()}, ${alpha})`;
      });
    }

    if (color.startsWith("#") && color.length === 7) {
      const r = parseInt(color.slice(1, 3), 16);
      const g = parseInt(color.slice(3, 5), 16);
      const b = parseInt(color.slice(5, 7), 16);
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    return color;
  }

  engine.addScene("game", {
    onEnter: function () {},
    update:  function (dt) { update(dt); },
    draw:    function (ctx) { render(); }
  });
  engine.switchScene("game");
  engine.start();
})();
