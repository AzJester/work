/* The player. The audio clock is the film clock, so picture and score cannot drift apart.
   If sound cannot run, the film falls back to the system clock and plays silent. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const stage = $('stage'), gate = $('gate'), gatePlay = $('gate-play'), gateText = $('gate-play-text');
  const bPlay = $('b-play'), bRestart = $('b-restart'), bMute = $('b-mute'), bFs = $('b-fs'), prog = $('prog'), progFill = prog.querySelector('b'), status = $('status');
  const DUR = AstrionFilm.DUR, LEVEL = 0.92;
  let film = null, audio = null, state = 'gate', t = 0, base = 0, clock0 = 0, raf = 0, muted = false, slow = 0, lastTick = 0, idleTimer = 0, pending = false, lockScale = false, silent = false;

  const say = m => { status.textContent = m; };
  const stopAudio = () => { if (audio) { audio.stop(); audio = null; } };
  const clock = () => audio ? Math.max(base, audio.time()) : base + (performance.now() - clock0) / 1000;

  function setState(s) {
    state = s;
    stage.classList.toggle('playing', s === 'playing');
    stage.classList.toggle('gated', s === 'gate' || s === 'ended');
    gate.classList.toggle('off', s === 'playing' || s === 'paused');
    const playing = s === 'playing';
    $('i-play').toggleAttribute('hidden', playing); $('i-pause').toggleAttribute('hidden', !playing);
    bPlay.setAttribute('aria-label', playing ? 'Pause' : 'Play');
  }
  function paint() { film.draw(t); progFill.style.width = (t / DUR * 100).toFixed(2) + '%'; }

  function start(from) {
    if (!film) { pending = true; return; }
    stopAudio();
    if (from >= DUR - 0.05) from = 0;
    base = t = from; clock0 = performance.now(); silent = false;
    try {
      audio = AstrionScore.live(from, muted ? 0 : LEVEL);
      if (audio.ctx.state === 'suspended') audio.ctx.resume().catch(() => {});
      say('Playing.');
    } catch (e) { audio = null; silent = true; say('Sound is not available here. The film is playing silent.'); }
    setState('playing'); lastTick = 0; slow = 0; poke();
    cancelAnimationFrame(raf); raf = requestAnimationFrame(loop);
  }
  function pause() {
    if (state !== 'playing') return;
    t = Math.min(DUR, clock()); base = t;
    if (audio) audio.ctx.suspend().catch(() => {});
    cancelAnimationFrame(raf); setState('paused'); paint(); say('Paused.');
  }
  function resume() {
    if (state !== 'paused') return;
    if (audio && audio.ctx.state !== 'closed') { audio.ctx.resume().catch(() => {}); clock0 = performance.now(); setState('playing'); lastTick = 0; raf = requestAnimationFrame(loop); say('Playing.'); }
    else start(t);
  }
  function seek(nt) {
    nt = Math.min(DUR - 0.05, Math.max(0, nt));
    if (state === 'playing') start(nt);
    else if (state === 'paused') { stopAudio(); base = t = nt; paint(); }
  }
  function finish() {
    stopAudio(); cancelAnimationFrame(raf); t = DUR; paint();
    gateText.textContent = 'Replay'; setState('ended'); say('The film has ended.');
  }
  function loop(ts) {
    if (state !== 'playing') return;
    // If the browser never lets the sound start, carry on without it rather than hold the picture.
    if (audio && audio.ctx.state !== 'running' && performance.now() - clock0 > 1500) { stopAudio(); silent = true; base = t; clock0 = performance.now(); say('Sound is not available here. The film is playing silent.'); }
    t = clock();
    if (t >= DUR) { finish(); return; }
    paint();
    if (lastTick && !lockScale) {
      const dt = ts - lastTick;
      slow = dt > 60 ? slow + 2 : dt > 36 ? slow + 0.5 : Math.max(0, slow - 0.5);
      if (slow >= 6 && film.getScale() > 0.3) { film.setScale(Math.max(0.3, film.getScale() * 0.72)); slow = 0; }
    }
    lastTick = ts;
    raf = requestAnimationFrame(loop);
  }
  const toggle = () => { if (state === 'playing') pause(); else if (state === 'paused') resume(); else start(0); };

  function setMute(m) {
    muted = m;
    bMute.setAttribute('aria-pressed', String(m)); bMute.setAttribute('aria-label', m ? 'Unmute' : 'Mute');
    $('i-wave').toggleAttribute('hidden', m); $('i-x').toggleAttribute('hidden', !m);
    if (audio) { const g = audio.master.gain, now = audio.ctx.currentTime; g.cancelScheduledValues(now); g.setTargetAtTime(m ? 0 : LEVEL, now, 0.02); }
    say(m ? 'Sound off.' : 'Sound on.');
  }
  function fullscreen() {
    const d = document, el = d.documentElement;
    try {
      if (d.fullscreenElement || d.webkitFullscreenElement) (d.exitFullscreen || d.webkitExitFullscreen).call(d);
      else { const rq = el.requestFullscreen || el.webkitRequestFullscreen; if (!rq) throw new Error('unsupported'); const p = rq.call(el); if (p && p.catch) p.catch(() => say('Full screen is not available in this view.')); }
    } catch (e) { say('Full screen is not available in this view.'); }
  }
  // Controls show on any input and hide again after two seconds without one.
  function poke() { stage.classList.remove('idle'); clearTimeout(idleTimer); idleTimer = setTimeout(() => stage.classList.add('idle'), 2000); }
  ['pointermove', 'pointerdown', 'keydown', 'touchstart', 'focusin'].forEach(ev => document.addEventListener(ev, poke, { passive: true }));

  gatePlay.addEventListener('click', () => start(0));
  bPlay.addEventListener('click', toggle);
  bRestart.addEventListener('click', () => start(0));
  bMute.addEventListener('click', () => setMute(!muted));
  bFs.addEventListener('click', fullscreen);
  prog.addEventListener('click', e => { const r = prog.getBoundingClientRect(); seek((e.clientX - r.left) / r.width * DUR); });
  stage.addEventListener('click', e => { if (e.target.closest('#controls,#gate,#prog')) return; if (state === 'playing' || state === 'paused') toggle(); });
  document.addEventListener('keydown', e => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase(), onButton = e.target && e.target.closest && e.target.closest('button');
    if ((k === ' ' || k === 'enter') && onButton) return;
    if (k === ' ' || k === 'k') { e.preventDefault(); toggle(); }
    else if (k === 'm') setMute(!muted);
    else if (k === 'f') fullscreen();
    else if (k === 'r' || k === 'home') start(0);
    else if (k === 'arrowright') seek(t + 5);
    else if (k === 'arrowleft') seek(t - 5);
  });
  const relayout = () => { if (!film) return; film.layout(); if (state !== 'playing') paint(); };
  window.addEventListener('resize', relayout);
  document.addEventListener('fullscreenchange', relayout);
  document.addEventListener('webkitfullscreenchange', relayout);
  if (window.ResizeObserver) new ResizeObserver(relayout).observe(stage);

  (async () => {
    try { await Promise.race([AstrionFilm.fonts(), new Promise(r => setTimeout(r, 2500))]); } catch (e) { /* fall back to system faces */ }
    film = AstrionFilm.create(stage); film.layout(); paint();
    const rect = el => { const r = el.getBoundingClientRect(), s = stage.getBoundingClientRect(); return { x: r.left - s.left, y: r.top - s.top, w: r.width, h: r.height }; };
    // Read-only hooks for the verification run.
    window.__film = {
      DUR, BEAT: AstrionFilm.BEAT, BEATS: AstrionFilm.BEATS, MASTER: AstrionFilm.MASTER,
      scenes: AstrionFilm.SCENES.map(s => ({ id: s.id, name: s.name, b0: s.b0, b1: s.b1 })), shots: AstrionFilm.SHOTS,
      cues: AstrionFilm.CUES.map(c => ({ id: c.id, kind: c.kind, group: c.group, beatIn: c.beatIn, tin: c.tin, tout: c.tout, fi: c.fi, fo: c.fo })),
      cutBeats: AstrionScore.CUT_BEATS,
      state: () => ({ state, t, muted, silent, scale: film.getScale(), gl: film.hasGL(), audio: audio ? { ctx: audio.ctx.state, ctxTime: audio.ctx.currentTime, filmTime: audio.time(), level: audio.level(), sampleRate: audio.ctx.sampleRate } : null }),
      frame: (nt, opt) => { gate.style.transition = 'none'; if (state === 'playing') pause(); stopAudio(); if (state === 'gate' || state === 'ended') setState('paused'); base = t = nt; film.draw(t, opt); progFill.style.width = (t / DUR * 100).toFixed(2) + '%'; return film.boxes(); },
      boxes: () => film.boxes(),
      clock: () => (state === 'playing' ? clock() : t),
      hideText: v => { $('text').style.opacity = v ? '0' : ''; $('wm').style.opacity = v ? '0' : ''; },
      lockScale: v => { lockScale = v; if (v) film.setScale(1); },
      ui: () => ({ controls: rect($('controls')), buttons: [...document.querySelectorAll('#controls button')].map(rect), progress: rect(prog), idle: stage.classList.contains('idle'), controlsOpacity: +getComputedStyle($('controls')).opacity,
        gate: { visible: !gate.classList.contains('off'), logo: rect($('gate-logo')), label: Object.assign(rect($('gate-label')), { fontPx: parseFloat(getComputedStyle($('gate-label')).fontSize) }), button: Object.assign(rect(gatePlay), { fontPx: parseFloat(getComputedStyle(gatePlay).fontSize) }) } }),
      renderScore: async () => AstrionScore.analyse(await AstrionScore.render())
    };
    if (pending) { pending = false; start(0); }
  })();
})();
