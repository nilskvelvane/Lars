/**
 * engine.js — Reusable 2D browser game engine
 * Usage: new Engine({ canvas: '#game', width: 480, height: 640 })
 * No build step required. Works as file:// on desktop and mobile.
 * Exposes: window.Engine
 */
(function (root) {
  'use strict';

  // ---------------------------------------------------------------------------
  // 1. Constants & Defaults
  // ---------------------------------------------------------------------------

  var DEFAULTS = {
    canvas:       '#game',
    width:        480,
    height:       640,
    orientation:  'any',
    background:   '#000000',
    pixelPerfect: false,
    showFPS:      false,
    maxDeltaTime: 0.05
  };

  var DEFAULT_ACTIONS = {
    jump:  { keys: ['Space', 'ArrowUp', 'KeyW'],  touch: true  },
    left:  { keys: ['ArrowLeft',  'KeyA'],         touch: false },
    right: { keys: ['ArrowRight', 'KeyD'],         touch: false },
    down:  { keys: ['ArrowDown',  'KeyS'],         touch: false },
    enter: { keys: ['Enter'],                      touch: true  },
    pause: { keys: ['Escape', 'KeyP'],             touch: false }
  };

  // ---------------------------------------------------------------------------
  // Easing functions (used by tween)
  // ---------------------------------------------------------------------------

  var Easing = {
    linear:    function (t) { return t; },
    easeIn:    function (t) { return t * t; },
    easeOut:   function (t) { return t * (2 - t); },
    easeInOut: function (t) { return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; },
    bounce: function (t) {
      if (t < 1 / 2.75) return 7.5625 * t * t;
      if (t < 2 / 2.75)   { t -= 1.5   / 2.75; return 7.5625 * t * t + 0.75;     }
      if (t < 2.5 / 2.75) { t -= 2.25  / 2.75; return 7.5625 * t * t + 0.9375;   }
      t -= 2.625 / 2.75;    return 7.5625 * t * t + 0.984375;
    },
    elastic: function (t) {
      if (t === 0 || t === 1) return t;
      return -Math.pow(2, 10 * (t - 1)) * Math.sin((t - 1.1) * 5 * Math.PI);
    }
  };

  // ---------------------------------------------------------------------------
  // Engine Constructor
  // ---------------------------------------------------------------------------

  function Engine(opts) {
    this._opts = {};
    for (var k in DEFAULTS) { this._opts[k] = DEFAULTS[k]; }
    if (opts) { for (var k in opts) { this._opts[k] = opts[k]; } }

    this._scenes             = {};
    this._currentScene       = null;
    this._running            = false;
    this._rafId              = null;
    this._lastTime           = 0;
    this._tweens             = [];
    this._fpsSmooth          = 60;
    this._fpsAlpha           = 0.1;
    this._paused             = false;
    this._orientationPaused  = false;

    this._initCanvas();
    this._initInput();
    this._initAudio();
    this._initOrientation();

    // Per-instance APIs (closures over 'this')
    this.draw    = this._buildDrawAPI();
    this.collide = this._buildCollideAPI();
    this.camera  = this._buildCamera();
  }

  // ---------------------------------------------------------------------------
  // 2. Canvas & Display — letterbox scaling via CSS
  //    Canvas pixel size = logical resolution always.
  //    CSS stretches it to fit the window, maintaining aspect ratio.
  // ---------------------------------------------------------------------------

  Engine.prototype._initCanvas = function () {
    var opts = this._opts;
    var sel  = opts.canvas;

    this._canvas = (typeof sel === 'string')
      ? document.querySelector(sel)
      : sel;

    if (!this._canvas) {
      this._canvas = document.createElement('canvas');
      document.body.appendChild(this._canvas);
    }

    this._canvas.width  = opts.width;
    this._canvas.height = opts.height;
    this._ctx = this._canvas.getContext('2d');

    if (opts.pixelPerfect) {
      this._ctx.imageSmoothingEnabled    = false;
      this._canvas.style.imageRendering  = 'pixelated';
    }

    this._canvas.style.position = 'absolute';

    this._resize();

    var self = this;
    window.addEventListener('resize', function () { self._resize(); });
    window.addEventListener('orientationchange', function () {
      setTimeout(function () { self._resize(); }, 100);
    });
  };

  Engine.prototype._resize = function () {
    var opts   = this._opts;
    var sw     = window.innerWidth;
    var sh     = window.innerHeight;
    var aspect = opts.width / opts.height;
    var dw, dh;

    if (sw / sh > aspect) {
      dh = sh;
      dw = Math.floor(sh * aspect);
    } else {
      dw = sw;
      dh = Math.floor(sw / aspect);
    }

    var ox = Math.floor((sw - dw) / 2);
    var oy = Math.floor((sh - dh) / 2);

    this._canvas.style.width  = dw + 'px';
    this._canvas.style.height = dh + 'px';
    this._canvas.style.left   = ox + 'px';
    this._canvas.style.top    = oy + 'px';
  };

  // Convert screen-pixel coordinates → canvas/logical coordinates
  Engine.prototype._toCanvas = function (sx, sy) {
    var rect  = this._canvas.getBoundingClientRect();
    var scale = this._opts.width / rect.width;
    return {
      x: (sx - rect.left) * scale,
      y: (sy - rect.top)  * scale
    };
  };

  // ---------------------------------------------------------------------------
  // 3. Game Loop — rAF, delta time capped, pause/resume/stop/start
  // ---------------------------------------------------------------------------

  Engine.prototype.start = function () {
    if (this._running) return;
    this._running  = true;
    this._lastTime = performance.now();
    var self = this;

    function loop(ts) {
      if (!self._running) return;
      self._rafId = requestAnimationFrame(loop);

      var raw = (ts - self._lastTime) / 1000;
      var dt  = Math.min(raw, self._opts.maxDeltaTime);

      // Smooth FPS counter
      var fps = raw > 0 ? 1 / raw : 60;
      self._fpsSmooth = self._fpsSmooth * (1 - self._fpsAlpha) + fps * self._fpsAlpha;

      self._lastTime = ts;

      if (!self._paused && !self._orientationPaused) {
        self._tick(dt);
      }
      self._render();
    }

    this._rafId = requestAnimationFrame(loop);
  };

  Engine.prototype.stop = function () {
    this._running = false;
    if (this._rafId) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
  };

  Engine.prototype.pause = function () {
    this._paused = true;
  };

  Engine.prototype.resume = function () {
    this._paused    = false;
    this._lastTime  = performance.now(); // prevent large dt spike on resume
  };

  Engine.prototype.opts = function () {
    return this._opts;
  };

  Engine.prototype._tick = function (dt) {
    this.camera._update(dt);
    this._stepTweens(dt);

    if (this._currentScene && this._currentScene.update) {
      this._currentScene.update(dt);
    }

    // Clear just-pressed / just-released flags AFTER scene update
    this._input._clearFrameState();
  };

  Engine.prototype._render = function () {
    var ctx  = this._ctx;
    var opts = this._opts;

    // Clear background
    ctx.save();
    ctx.fillStyle = opts.background;
    ctx.fillRect(0, 0, opts.width, opts.height);
    ctx.restore();

    // Draw scene with camera transform applied
    if (this._currentScene && this._currentScene.draw) {
      ctx.save();
      ctx.translate(
        -Math.round(this.camera.x + this.camera._shakeOffX),
        -Math.round(this.camera.y + this.camera._shakeOffY)
      );
      this._currentScene.draw(ctx);
      ctx.restore();
    }

    // Orientation overlay (drawn over everything, no camera)
    if (this._orientationPaused) {
      this._drawOrientationOverlay();
    }

    // FPS counter (screen-space, always on top)
    if (opts.showFPS) {
      this._drawFPS();
    }
  };

  // ---------------------------------------------------------------------------
  // 4. Scene Manager
  // ---------------------------------------------------------------------------

  Engine.prototype.addScene = function (name, scene) {
    scene._loaded = false;
    this._scenes[name] = scene;
  };

  Engine.prototype.switchScene = function (name) {
    var self  = this;
    var scene = this._scenes[name];
    if (!scene) {
      console.error('[Engine] Unknown scene: ' + name);
      return;
    }

    function enter() {
      if (self._currentScene && self._currentScene.onLeave) {
        self._currentScene.onLeave();
      }
      self._currentScene = scene;
      // Reset camera on every scene switch
      self.camera.x       = 0;
      self.camera.y       = 0;
      self.camera._target = null;
      if (scene.onEnter) { scene.onEnter(); }
    }

    if (!scene._loaded) {
      scene._loaded = true;
      if (scene.load) {
        scene.load(function () { enter(); });
      } else {
        enter();
      }
    } else {
      enter();
    }
  };

  // ---------------------------------------------------------------------------
  // 5. Input — keyboard + touch + mouse unified into named actions
  // ---------------------------------------------------------------------------

  Engine.prototype._initInput = function () {
    var self = this;
    var inp  = {
      _actions:   {},
      _keyDown:   {},
      _keyJust:   {},
      _keyUp:     {},
      _touchDown: false,
      _touchJust: false,
      _touchUp:   false,
      touchPos:   { x: 0, y: 0 },
      mousePos:   { x: 0, y: 0 },

      setActions: function (map) {
        inp._actions = {};
        for (var a in map) { inp._actions[a] = map[a]; }
      },

      isDown: function (action) {
        var def = inp._actions[action];
        if (!def) return false;
        for (var i = 0; i < def.keys.length; i++) {
          if (inp._keyDown[def.keys[i]]) return true;
        }
        return !!(def.touch && inp._touchDown);
      },

      justPressed: function (action) {
        var def = inp._actions[action];
        if (!def) return false;
        for (var i = 0; i < def.keys.length; i++) {
          if (inp._keyJust[def.keys[i]]) return true;
        }
        return !!(def.touch && inp._touchJust);
      },

      justReleased: function (action) {
        var def = inp._actions[action];
        if (!def) return false;
        for (var i = 0; i < def.keys.length; i++) {
          if (inp._keyUp[def.keys[i]]) return true;
        }
        return !!(def.touch && inp._touchUp);
      },

      _clearFrameState: function () {
        inp._keyJust   = {};
        inp._keyUp     = {};
        inp._touchJust = false;
        inp._touchUp   = false;
      }
    };

    inp.setActions(DEFAULT_ACTIONS);

    // Keyboard events
    document.addEventListener('keydown', function (e) {
      if (!inp._keyDown[e.code]) {
        inp._keyJust[e.code] = true;
      }
      inp._keyDown[e.code] = true;
      var gameKeys = ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
      if (gameKeys.indexOf(e.code) !== -1) { e.preventDefault(); }
    });

    document.addEventListener('keyup', function (e) {
      inp._keyDown[e.code] = false;
      inp._keyUp[e.code]   = true;
    });

    // Touch events
    var touchStartTime = 0;
    var canvas = this._canvas;

    canvas.addEventListener('touchstart', function (e) {
      e.preventDefault();
      inp._touchDown = true;
      touchStartTime = Date.now();
      var t   = e.touches[0];
      var pos = self._toCanvas(t.clientX, t.clientY);
      inp.touchPos.x = pos.x;
      inp.touchPos.y = pos.y;
      self._tryUnlockAudio();
    }, { passive: false });

    canvas.addEventListener('touchmove', function (e) {
      e.preventDefault();
      var t   = e.touches[0];
      var pos = self._toCanvas(t.clientX, t.clientY);
      inp.touchPos.x = pos.x;
      inp.touchPos.y = pos.y;
    }, { passive: false });

    canvas.addEventListener('touchend', function (e) {
      e.preventDefault();
      inp._touchDown = false;
      inp._touchUp   = true;
      var dur = Date.now() - touchStartTime;
      if (dur < 300) {
        inp._touchJust = true; // short tap = justPressed
      }
    }, { passive: false });

    // Mouse events (desktop)
    canvas.addEventListener('mousedown', function (e) {
      var pos = self._toCanvas(e.clientX, e.clientY);
      inp.mousePos.x = pos.x;
      inp.mousePos.y = pos.y;
      inp._touchDown = true;
      inp._touchJust = true;
      self._tryUnlockAudio();
    });

    canvas.addEventListener('mousemove', function (e) {
      var pos = self._toCanvas(e.clientX, e.clientY);
      inp.mousePos.x = pos.x;
      inp.mousePos.y = pos.y;
    });

    canvas.addEventListener('mouseup', function () {
      inp._touchDown = false;
      inp._touchUp   = true;
    });

    this._input = inp;
    this.input  = inp; // public alias
  };

  // ---------------------------------------------------------------------------
  // 6. Asset Loader — returns Promise, draws progress bar while loading
  // ---------------------------------------------------------------------------

  Engine.prototype.load = function (manifest) {
    var self   = this;
    var images = manifest.images || {};
    var sounds = manifest.sounds || {};
    var total  = 0;
    var loaded = 0;
    var assets = { images: {}, sounds: {} };

    for (var k in images) { total++; }
    for (var k in sounds) { total++; }
    if (total === 0) { return Promise.resolve(assets); }

    return new Promise(function (resolve) {
      function onOne() {
        loaded++;
        self._drawLoadingBar(loaded / total);
        if (loaded >= total) { resolve(assets); }
      }

      for (var name in images) {
        (function (n, src) {
          var img  = new Image();
          img.onload  = function () { assets.images[n] = img; onOne(); };
          img.onerror = function () {
            console.warn('[Engine] Failed to load image: ' + src);
            onOne();
          };
          img.src = src;
        }(name, images[name]));
      }

      for (var name in sounds) {
        (function (n, src) {
          var audio = new Audio();
          audio.addEventListener('canplaythrough', function () {
            assets.sounds[n] = audio;
            onOne();
          }, { once: true });
          audio.addEventListener('error', function () {
            console.warn('[Engine] Failed to load sound: ' + src);
            onOne();
          }, { once: true });
          audio.src = src;
          audio.load();
        }(name, sounds[name]));
      }
    });
  };

  Engine.prototype._drawLoadingBar = function (progress) {
    var ctx = this._ctx;
    var w   = this._opts.width;
    var h   = this._opts.height;
    var bw  = Math.floor(w * 0.6);
    var bh  = 20;
    var bx  = Math.floor((w - bw) / 2);
    var by  = Math.floor(h / 2 - bh / 2);

    ctx.save();
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#333';
    ctx.fillRect(bx, by, bw, bh);
    ctx.fillStyle = '#4af';
    ctx.fillRect(bx, by, Math.floor(bw * (progress || 0)), bh);
    ctx.fillStyle    = '#fff';
    ctx.font         = '16px monospace';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Loading...', w / 2, by - 14);
    ctx.restore();
  };

  // ---------------------------------------------------------------------------
  // 7. Drawing Helpers
  //    draw.*       — world-space (camera-relative)
  //    draw.*Screen — screen-space HUD (bypasses camera)
  // ---------------------------------------------------------------------------

  Engine.prototype._buildDrawAPI = function () {
    var self = this;

    return {
      rect: function (x, y, w, h, color, opts) {
        var ctx = self._ctx;
        ctx.save();
        if (opts && opts.alpha !== undefined) { ctx.globalAlpha = opts.alpha; }
        if (opts && opts.stroke) {
          ctx.strokeStyle = opts.stroke;
          ctx.lineWidth   = opts.lineWidth || 1;
          ctx.strokeRect(x, y, w, h);
        } else {
          ctx.fillStyle = color || '#fff';
          ctx.fillRect(x, y, w, h);
        }
        ctx.restore();
      },

      circle: function (x, y, r, color, opts) {
        var ctx = self._ctx;
        ctx.save();
        if (opts && opts.alpha !== undefined) { ctx.globalAlpha = opts.alpha; }
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        if (opts && opts.stroke) {
          ctx.strokeStyle = opts.stroke;
          ctx.lineWidth   = opts.lineWidth || 1;
          ctx.stroke();
        } else {
          ctx.fillStyle = color || '#fff';
          ctx.fill();
        }
        ctx.restore();
      },

      image: function (img, x, y, w, h, opts) {
        if (!img) return;
        var ctx = self._ctx;
        ctx.save();
        if (opts && opts.alpha !== undefined) { ctx.globalAlpha = opts.alpha; }
        var dw = w || img.width;
        var dh = h || img.height;
        if (opts && opts.flipX) {
          ctx.translate(x + dw, y);
          ctx.scale(-1, 1);
          ctx.drawImage(img, 0, 0, dw, dh);
        } else {
          ctx.drawImage(img, x, y, dw, dh);
        }
        ctx.restore();
      },

      // Draw one cell from a spritesheet grid. frame is 0-based index.
      spriteFrame: function (img, frame, frameW, frameH, x, y, drawW, drawH, opts) {
        if (!img) return;
        var ctx  = self._ctx;
        var cols = Math.floor(img.width / frameW);
        var col  = frame % cols;
        var row  = Math.floor(frame / cols);
        ctx.save();
        if (opts && opts.alpha !== undefined) { ctx.globalAlpha = opts.alpha; }
        ctx.drawImage(
          img,
          col * frameW, row * frameH, frameW, frameH,
          x, y, drawW || frameW, drawH || frameH
        );
        ctx.restore();
      },

      text: function (str, x, y, opts) {
        var ctx = self._ctx;
        ctx.save();
        ctx.fillStyle    = (opts && opts.color)    || '#fff';
        ctx.font         = (opts && opts.font)     || '24px monospace';
        ctx.textAlign    = (opts && opts.align)    || 'left';
        ctx.textBaseline = (opts && opts.baseline) || 'top';
        if (opts && opts.alpha !== undefined) { ctx.globalAlpha = opts.alpha; }
        if (opts && opts.shadow) {
          ctx.shadowColor   = opts.shadow;
          ctx.shadowBlur    = opts.shadowBlur || 4;
          ctx.shadowOffsetX = 1;
          ctx.shadowOffsetY = 1;
        }
        ctx.fillText(str, x, y);
        ctx.restore();
      },

      line: function (x1, y1, x2, y2, color, lineWidth) {
        var ctx = self._ctx;
        ctx.save();
        ctx.strokeStyle = color     || '#fff';
        ctx.lineWidth   = lineWidth || 1;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        ctx.restore();
      },

      // ---- Screen-space (HUD) variants — setTransform resets to identity ----

      rectScreen: function (x, y, w, h, color, opts) {
        var ctx = self._ctx;
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        if (opts && opts.alpha !== undefined) { ctx.globalAlpha = opts.alpha; }
        ctx.fillStyle = color || '#fff';
        ctx.fillRect(x, y, w, h);
        ctx.restore();
      },

      circleScreen: function (x, y, r, color, opts) {
        var ctx = self._ctx;
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        if (opts && opts.alpha !== undefined) { ctx.globalAlpha = opts.alpha; }
        ctx.fillStyle = color || '#fff';
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      },

      imageScreen: function (img, x, y, w, h, opts) {
        if (!img) return;
        var ctx = self._ctx;
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        if (opts && opts.alpha !== undefined) { ctx.globalAlpha = opts.alpha; }
        ctx.drawImage(img, x, y, w || img.width, h || img.height);
        ctx.restore();
      },

      textScreen: function (str, x, y, opts) {
        var ctx = self._ctx;
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle    = (opts && opts.color)    || '#fff';
        ctx.font         = (opts && opts.font)     || '24px monospace';
        ctx.textAlign    = (opts && opts.align)    || 'left';
        ctx.textBaseline = (opts && opts.baseline) || 'top';
        if (opts && opts.alpha !== undefined) { ctx.globalAlpha = opts.alpha; }
        if (opts && opts.shadow) {
          ctx.shadowColor   = opts.shadow;
          ctx.shadowBlur    = opts.shadowBlur || 4;
          ctx.shadowOffsetX = 1;
          ctx.shadowOffsetY = 1;
        }
        ctx.fillText(str, x, y);
        ctx.restore();
      }
    };
  };

  // ---------------------------------------------------------------------------
  // 8. Collision
  // ---------------------------------------------------------------------------

  Engine.prototype._buildCollideAPI = function () {
    return {
      rectRect: function (ax, ay, aw, ah, bx, by, bw, bh) {
        return ax < bx + bw &&
               ax + aw > bx &&
               ay < by + bh &&
               ay + ah > by;
      },

      // Returns { x: overlapX, y: overlapY } or null
      rectRectOverlap: function (ax, ay, aw, ah, bx, by, bw, bh) {
        var ox = Math.min(ax + aw, bx + bw) - Math.max(ax, bx);
        var oy = Math.min(ay + ah, by + bh) - Math.max(ay, by);
        if (ox <= 0 || oy <= 0) { return null; }
        return { x: ox, y: oy };
      },

      circleCircle: function (ax, ay, ar, bx, by, br) {
        var dx = ax - bx;
        var dy = ay - by;
        return dx * dx + dy * dy < (ar + br) * (ar + br);
      },

      circleRect: function (cx, cy, cr, rx, ry, rw, rh) {
        var nearX = Math.max(rx, Math.min(cx, rx + rw));
        var nearY = Math.max(ry, Math.min(cy, ry + rh));
        var dx    = cx - nearX;
        var dy    = cy - nearY;
        return dx * dx + dy * dy < cr * cr;
      }
    };
  };

  // ---------------------------------------------------------------------------
  // 9. Audio — HTMLAudioElement, mobile unlock handled automatically
  // ---------------------------------------------------------------------------

  Engine.prototype._initAudio = function () {
    this._audioSounds  = {};
    this._audioContext = null; // lazy — created on first tone() call
  };

  Engine.prototype._tryUnlockAudio = function () {
    if (this._audioUnlocked) return;
    this._audioUnlocked = true;
    // Satisfy mobile autoplay policy with a silent play
    var dummy = new Audio();
    dummy.src = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAA' +
                'EAAQARTkAAEABAAEAGmRhdGEEAAAAAAAA';
    dummy.play().catch(function () { /* silent fail */ });
    // Also resume AudioContext if one already exists
    if (this._audioContext && this._audioContext.state === 'suspended') {
      this._audioContext.resume().catch(function () {});
    }
  };

  Engine.prototype._getAudioContext = function () {
    if (this._audioContext) { return this._audioContext; }
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { return null; }
    this._audioContext = new AC();
    return this._audioContext;
  };

  Engine.prototype._buildAudioAPI = function () {
    var self = this;
    return {
      register: function (name, src) {
        self._audioSounds[name] = (typeof src === 'string') ? new Audio(src) : src;
      },

      play: function (name, opts) {
        var snd = self._audioSounds[name];
        if (!snd) {
          console.warn('[Engine] Audio not registered: ' + name);
          return null;
        }
        var clone = snd.cloneNode();
        if (opts && opts.volume !== undefined) { clone.volume = opts.volume; }
        if (opts && opts.loop)                 { clone.loop   = true;        }
        clone.play().catch(function () { /* autoplay blocked */ });
        return clone;
      },

      stop: function (handle) {
        if (!handle) return;
        handle.pause();
        handle.currentTime = 0;
      },

      setVolume: function (name, vol) {
        var snd = self._audioSounds[name];
        if (snd) { snd.volume = vol; }
      },

      // Synthesized tone via Web Audio API.
      // opts: { freq, type, duration, volume, attack, release, pan }
      tone: function (opts) {
        var ac = self._getAudioContext();
        if (!ac) { return; } // Web Audio not supported

        // Resume context if suspended (e.g. before first user gesture)
        if (ac.state === 'suspended') { ac.resume().catch(function () {}); }

        var freq     = (opts && opts.freq     !== undefined) ? opts.freq     : 440;
        var type     = (opts && opts.type)                   ? opts.type     : 'sine';
        var duration = (opts && opts.duration !== undefined) ? opts.duration : 0.15;
        var volume   = (opts && opts.volume   !== undefined) ? opts.volume   : 0.3;
        var attack   = (opts && opts.attack   !== undefined) ? opts.attack   : 0.01;
        var release  = (opts && opts.release  !== undefined) ? opts.release  : 0.08;
        var pan      = (opts && opts.pan      !== undefined) ? opts.pan      : 0;

        var now = ac.currentTime;

        var osc    = ac.createOscillator();
        var gain   = ac.createGain();
        var panner = ac.createStereoPanner
          ? ac.createStereoPanner()
          : null;

        osc.type      = type;
        osc.frequency.setValueAtTime(freq, now);

        // Envelope: attack → sustain → release
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(volume, now + attack);
        gain.gain.setValueAtTime(volume, now + duration - release);
        gain.gain.linearRampToValueAtTime(0, now + duration);

        // Connect graph: osc → gain → [panner →] destination
        osc.connect(gain);
        if (panner) {
          panner.pan.setValueAtTime(pan, now);
          gain.connect(panner);
          panner.connect(ac.destination);
        } else {
          gain.connect(ac.destination);
        }

        osc.start(now);
        osc.stop(now + duration);
      }
    };
  };

  // ---------------------------------------------------------------------------
  // 10. Camera
  // ---------------------------------------------------------------------------

  Engine.prototype._buildCamera = function () {
    var self = this;
    var cam  = {
      x: 0,
      y: 0,
      _target:  null,
      _offsetX: 0,
      _offsetY: 0,
      _minX:    -Infinity,
      _minY:    -Infinity,
      _maxX:    Infinity,
      _maxY:    Infinity,
      _lerp:    1,

      follow: function (entity, opts) {
        cam._target  = entity;
        cam._offsetX = (opts && opts.offsetX !== undefined) ? opts.offsetX : 0;
        cam._offsetY = (opts && opts.offsetY !== undefined) ? opts.offsetY : 0;
        cam._minX    = (opts && opts.minX    !== undefined) ? opts.minX    : -Infinity;
        cam._minY    = (opts && opts.minY    !== undefined) ? opts.minY    : -Infinity;
        cam._maxX    = (opts && opts.maxX    !== undefined) ? opts.maxX    :  Infinity;
        cam._maxY    = (opts && opts.maxY    !== undefined) ? opts.maxY    :  Infinity;
        cam._lerp    = (opts && opts.lerp    !== undefined) ? opts.lerp    : 1;
      },

      unfollow: function () {
        cam._target = null;
      },

      shake: function (magnitude, duration) {
        cam._shakeMag      = magnitude;
        cam._shakeDuration = duration;
        cam._shakeTimer    = duration;
      },

      _shakeOffX: 0,
      _shakeOffY: 0,
      _shakeMag:      0,
      _shakeDuration: 0,
      _shakeTimer:    0,

      _update: function (dt) {
        // Follow target
        if (cam._target) {
          var w  = self._opts.width;
          var h  = self._opts.height;
          var tx = cam._target.x + cam._offsetX - w / 2;
          var ty = cam._target.y + cam._offsetY - h / 2;
          tx = Math.max(cam._minX, Math.min(tx, cam._maxX - w));
          ty = Math.max(cam._minY, Math.min(ty, cam._maxY - h));
          var t = Math.min(cam._lerp * dt * 60, 1);
          cam.x += (tx - cam.x) * t;
          cam.y += (ty - cam.y) * t;
        }

        // Shake offset (decays linearly over duration)
        if (cam._shakeTimer > 0) {
          cam._shakeTimer -= dt;
          var progress = Math.max(cam._shakeTimer / cam._shakeDuration, 0);
          var mag      = cam._shakeMag * progress;
          cam._shakeOffX = (Math.random() * 2 - 1) * mag;
          cam._shakeOffY = (Math.random() * 2 - 1) * mag;
        } else {
          cam._shakeOffX = 0;
          cam._shakeOffY = 0;
        }
      }
    };
    return cam;
  };

  // ---------------------------------------------------------------------------
  // 11. Tweening
  // ---------------------------------------------------------------------------

  Engine.prototype.tween = function (target, props, duration, easing, callback) {
    var easingFn = (typeof easing === 'function')
      ? easing
      : (Easing[easing] || Easing.linear);

    var start = {};
    for (var k in props) { start[k] = target[k]; }

    var tw = {
      target:   target,
      props:    props,
      start:    start,
      duration: duration,
      easing:   easingFn,
      callback: callback || null,
      elapsed:  0,
      done:     false
    };
    this._tweens.push(tw);
    return tw; // set tw.done = true to cancel
  };

  Engine.prototype._stepTweens = function (dt) {
    var alive = [];
    for (var i = 0; i < this._tweens.length; i++) {
      var tw = this._tweens[i];
      if (tw.done) { continue; }
      tw.elapsed += dt;
      var t = Math.min(tw.elapsed / tw.duration, 1);
      var e = tw.easing(t);
      for (var k in tw.props) {
        tw.target[k] = tw.start[k] + (tw.props[k] - tw.start[k]) * e;
      }
      if (t >= 1) {
        tw.done = true;
        if (tw.callback) { tw.callback(); }
      } else {
        alive.push(tw);
      }
    }
    this._tweens = alive;
  };

  // ---------------------------------------------------------------------------
  // 12. Utilities
  // ---------------------------------------------------------------------------

  Engine.prototype.random = function (min, max) {
    if (min === undefined) { return Math.random(); }
    return min + Math.random() * (max - min);
  };

  Engine.prototype.randomInt = function (min, max) {
    return Math.floor(this.random(min, max + 1));
  };

  Engine.prototype.lerp = function (a, b, t) {
    return a + (b - a) * t;
  };

  Engine.prototype.clamp = function (val, min, max) {
    return Math.max(min, Math.min(val, max));
  };

  Engine.prototype.distance = function (x1, y1, x2, y2) {
    var dx = x2 - x1;
    var dy = y2 - y1;
    return Math.sqrt(dx * dx + dy * dy);
  };

  // ---------------------------------------------------------------------------
  // 13. Orientation Manager
  //     Tries screen.orientation.lock() first (Android Chrome).
  //     Falls back to overlay + auto pause/resume.
  // ---------------------------------------------------------------------------

  Engine.prototype._initOrientation = function () {
    var self = this;
    var req  = this._opts.orientation;
    if (req === 'any') { return; }

    // Only enforce orientation on touch devices (phones/tablets).
    // Desktop browsers don't rotate, so the overlay would just be annoying.
    var isTouchDevice = navigator.maxTouchPoints > 0 || 'ontouchstart' in window;
    if (!isTouchDevice) { return; }

    var ov = document.createElement('div');
    ov.style.cssText =
      'display:none;position:fixed;inset:0;z-index:9999;' +
      'background:rgba(0,0,0,0.85);color:#fff;' +
      'font-family:monospace;font-size:22px;' +
      'flex-direction:column;align-items:center;justify-content:center;gap:16px;' +
      'text-align:center;' +
      'padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) ' +
      'env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)';
    ov.innerHTML =
      '<span>Please rotate to ' + req + '</span>' +
      '<span style="font-size:52px;font-family:sans-serif">' +
      (req === 'portrait' ? '⟳' : '⟲') + '</span>';
    document.body.appendChild(ov);
    self._orientationOverlayEl = ov;

    function check() {
      var w          = window.innerWidth;
      var h          = window.innerHeight;
      var isPortrait = h >= w;
      var ok = (req === 'portrait' && isPortrait) || (req === 'landscape' && !isPortrait);

      if (!ok) {
        self._orientationPaused = true;
        if (self._orientationOverlayEl) { self._orientationOverlayEl.style.display = 'flex'; }
      } else {
        if (self._orientationPaused) {
          self._orientationPaused = false;
          self._lastTime = performance.now();
        }
        if (self._orientationOverlayEl) { self._orientationOverlayEl.style.display = 'none'; }
      }
    }

    // Try native lock (Android Chrome)
    if (screen.orientation && screen.orientation.lock) {
      screen.orientation.lock(req).catch(function () { /* not supported — overlay handles it */ });
    }

    window.addEventListener('resize', check);
    window.addEventListener('orientationchange', function () { setTimeout(check, 200); });
    check();
  };

  Engine.prototype._drawOrientationOverlay = function () {};

  // ---------------------------------------------------------------------------
  // 14. FPS Display — smoothed, screen-space, top-left corner
  // ---------------------------------------------------------------------------

  Engine.prototype._drawFPS = function () {
    var ctx = this._ctx;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, 0, 64, 20);
    ctx.fillStyle    = '#0f0';
    ctx.font         = '12px monospace';
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('FPS:' + Math.round(this._fpsSmooth), 4, 4);
    ctx.restore();
  };

  // ---------------------------------------------------------------------------
  // Expose as window.Engine
  // ---------------------------------------------------------------------------

  root.Engine = function (opts) {
    // Support both `new Engine(opts)` and `Engine(opts)`
    var instance = (this instanceof root.Engine)
      ? this
      : Object.create(Engine.prototype);

    Engine.call(instance, opts);
    instance.audio = instance._buildAudioAPI();
    return instance;
  };

  root.Engine.prototype = Engine.prototype;

}(window));
