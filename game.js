(function () {
  const canvas = document.getElementById('c');
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;

  const COLORS = [
    { fill: '#3b82f6', name: 'P1 Blue' },
    { fill: '#ef4444', name: 'P2 Red' },
    { fill: '#22c55e', name: 'P3 Green' },
    { fill: '#eab308', name: 'P4 Yellow' },
  ];

  const CONTROLS = [
    { up: 'w', down: 's', left: 'a', right: 'd' },
    { up: 't', down: 'g', left: 'f', right: 'h' },
    { up: 'i', down: 'k', left: 'j', right: 'l' },
    { up: 'arrowup', down: 'arrowdown', left: 'arrowleft', right: 'arrowright' },
  ];

  const keys = Object.create(null);
  window.addEventListener('keydown', e => {
    keys[e.key.toLowerCase()] = true;
    if (['arrowup','arrowdown','arrowleft','arrowright',' '].includes(e.key.toLowerCase())) e.preventDefault();
  });
  window.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });

  function maps() {
    const border = [
      { x: 0, y: 0, w: W, h: 16 },
      { x: 0, y: H - 16, w: W, h: 16 },
      { x: 0, y: 0, w: 16, h: H },
      { x: W - 16, y: 0, w: 16, h: H },
    ];
    return {
      arena: { name: 'Open Arena', walls: border },
      boxes: {
        name: 'Box Maze',
        walls: border.concat([
          { x: 140, y: 100, w: 80, h: 80 },
          { x: 500, y: 100, w: 80, h: 80 },
          { x: 140, y: 300, w: 80, h: 80 },
          { x: 500, y: 300, w: 80, h: 80 },
          { x: 320, y: 200, w: 80, h: 80 },
        ]),
      },
      halls: {
        name: 'Cross Halls',
        walls: border.concat([
          { x: 200, y: 16, w: 24, h: 160 },
          { x: 200, y: 300, w: 24, h: 164 },
          { x: 496, y: 16, w: 24, h: 160 },
          { x: 496, y: 300, w: 24, h: 164 },
          { x: 16, y: 220, w: 200, h: 24 },
          { x: 504, y: 220, w: 200, h: 24 },
        ]),
      },
      donut: {
        name: 'Donut',
        walls: border.concat([
          { x: 260, y: 160, w: 200, h: 24 },
          { x: 260, y: 296, w: 200, h: 24 },
          { x: 260, y: 160, w: 24, h: 160 },
          { x: 436, y: 160, w: 24, h: 160 },
        ]),
      },
    };
  }

  const MAPS = maps();

  let state = {
    running: false,
    players: [],
    walls: [],
    itIndex: 0,
    timeLeft: 60,
    roundSeconds: 60,
    effect: 'none',
    scores: [0, 0, 0, 0],
    tagCooldown: 0,
    chaosTimer: 0,
    lastTs: 0,
  };

  function spawnPoints(n) {
    const pts = [
      { x: 80, y: 80 },
      { x: W - 80, y: 80 },
      { x: 80, y: H - 80 },
      { x: W - 80, y: H - 80 },
    ];
    return pts.slice(0, n);
  }

  function makePlayers(n) {
    const sp = spawnPoints(n);
    const baseR = state.effect === 'tiny' ? 12 : 16;
    return sp.map((p, i) => ({
      x: p.x, y: p.y,
      vx: 0, vy: 0,
      r: baseR,
      color: COLORS[i].fill,
      name: COLORS[i].name,
      control: CONTROLS[i],
      timeAsIt: 0,
      speedMul: 1,
    }));
  }

  function rectsOverlapCircle(cx, cy, r, wall) {
    const nx = Math.max(wall.x, Math.min(cx, wall.x + wall.w));
    const ny = Math.max(wall.y, Math.min(cy, wall.y + wall.h));
    const dx = cx - nx, dy = cy - ny;
    return dx * dx + dy * dy < r * r;
  }

  function resolveWalls(p) {
    for (const w of state.walls) {
      if (!rectsOverlapCircle(p.x, p.y, p.r, w)) continue;
      const left = Math.abs(p.x - w.x);
      const right = Math.abs(p.x - (w.x + w.w));
      const top = Math.abs(p.y - w.y);
      const bot = Math.abs(p.y - (w.y + w.h));
      const m = Math.min(left, right, top, bot);
      if (m === left) p.x = w.x - p.r;
      else if (m === right) p.x = w.x + w.w + p.r;
      else if (m === top) p.y = w.y - p.r;
      else p.y = w.y + w.h + p.r;
      if (m === left || m === right) p.vx *= -0.2;
      else p.vy *= -0.2;
    }
    p.x = Math.max(p.r + 2, Math.min(W - p.r - 2, p.x));
    p.y = Math.max(p.r + 2, Math.min(H - p.r - 2, p.y));
  }

  function startRound() {
    const n = parseInt(document.getElementById('playerCount').value, 10);
    const mapKey = document.getElementById('mapSelect').value;
    const secs = Math.max(15, Math.min(300, parseInt(document.getElementById('roundTime').value, 10) || 60));
    const effect = document.getElementById('effectSelect').value;
    const itSel = document.getElementById('itStart').value;

    state.effect = effect;
    state.roundSeconds = secs;
    state.timeLeft = secs;
    state.walls = MAPS[mapKey].walls.map(w => ({ ...w }));
    state.players = makePlayers(n);
    state.tagCooldown = 0;
    state.chaosTimer = 0;
    state.running = true;
    state.lastTs = performance.now();

    if (itSel === 'random') {
      state.itIndex = Math.floor(Math.random() * n);
    } else {
      state.itIndex = Math.min(n - 1, parseInt(itSel, 10) || 0);
    }

    state.players.forEach(p => {
      p.speedMul = effect === 'speed' ? 1.35 : 1;
      if (effect === 'tiny') p.r = 12;
    });

    document.getElementById('hud').textContent =
      MAPS[mapKey].name + ' · ' + n + 'P · ' + secs + 's · IT: ' + state.players[state.itIndex].name;
  }

  function endRound() {
    state.running = false;
    let best = 0;
    let bestVal = Infinity;
    state.players.forEach((p, i) => {
      if (p.timeAsIt < bestVal) { bestVal = p.timeAsIt; best = i; }
    });
    state.scores[best] = (state.scores[best] || 0) + 1;
    document.getElementById('hud').textContent =
      'ROUND OVER — least time IT: ' + state.players[best].name + ' wins the round!';
    renderScores();
  }

  function renderScores() {
    let html = '<h2>WINS</h2>';
    for (let i = 0; i < 4; i++) {
      html += '<div class="score-line" style="color:' + COLORS[i].fill + '">' +
        COLORS[i].name + ': ' + (state.scores[i] || 0) + '</div>';
    }
    document.getElementById('scores').innerHTML = html;
  }

  function tryTag() {
    if (state.tagCooldown > 0) return;
    const it = state.players[state.itIndex];
    for (let i = 0; i < state.players.length; i++) {
      if (i === state.itIndex) continue;
      const o = state.players[i];
      const dx = it.x - o.x, dy = it.y - o.y;
      const min = it.r + o.r;
      if (dx * dx + dy * dy < min * min) {
        state.itIndex = i;
        state.tagCooldown = 0.7;
        const len = Math.hypot(dx, dy) || 1;
        o.vx += (dx / len) * 120;
        o.vy += (dy / len) * 120;
        it.vx -= (dx / len) * 80;
        it.vy -= (dy / len) * 80;
        break;
      }
    }
  }

  function update(dt) {
    if (!state.running) return;

    state.timeLeft -= dt;
    if (state.timeLeft <= 0) {
      state.timeLeft = 0;
      endRound();
      return;
    }

    if (state.tagCooldown > 0) state.tagCooldown -= dt;

    if (state.effect === 'chaos') {
      state.chaosTimer -= dt;
      if (state.chaosTimer <= 0) {
        state.chaosTimer = 3 + Math.random() * 4;
        state.players.forEach(p => {
          p.speedMul = 0.85 + Math.random() * 0.7;
        });
      }
    }

    const baseSpeed = 210;
    const friction = state.effect === 'ice' ? 0.992 : 0.86;

    state.players.forEach((p, i) => {
      const c = p.control;
      let ax = 0, ay = 0;
      if (keys[c.up]) ay -= 1;
      if (keys[c.down]) ay += 1;
      if (keys[c.left]) ax -= 1;
      if (keys[c.right]) ax += 1;
      if (ax || ay) {
        const len = Math.hypot(ax, ay);
        ax /= len; ay /= len;
        const spd = baseSpeed * p.speedMul;
        if (state.effect === 'ice') {
          p.vx += ax * spd * dt * 1.8;
          p.vy += ay * spd * dt * 1.8;
        } else {
          p.vx = ax * spd;
          p.vy = ay * spd;
        }
      } else if (state.effect !== 'ice') {
        p.vx *= 0.7;
        p.vy *= 0.7;
      }

      p.vx *= friction;
      p.vy *= friction;
      const maxV = baseSpeed * p.speedMul * 1.4;
      const v = Math.hypot(p.vx, p.vy);
      if (v > maxV) { p.vx *= maxV / v; p.vy *= maxV / v; }

      p.x += p.vx * dt;
      p.y += p.vy * dt;
      resolveWalls(p);

      if (i === state.itIndex) p.timeAsIt += dt;
    });

    tryTag();

    const itName = state.players[state.itIndex].name;
    document.getElementById('hud').textContent =
      Math.ceil(state.timeLeft) + 's  ·  IT: ' + itName +
      (state.tagCooldown > 0 ? '  ·  tag cooldown' : '');
  }

  function drawArrow(x, y) {
    ctx.save();
    ctx.translate(x, y - 28);
    ctx.fillStyle = '#ff2b2b';
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-8, -14);
    ctx.lineTo(8, -14);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillRect(-2, -22, 4, 10);
    ctx.restore();
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);

    ctx.fillStyle = '#12091c';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(139,61,255,0.12)';
    ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 40) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let y = 0; y < H; y += 40) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }

    ctx.fillStyle = '#2a1f45';
    ctx.strokeStyle = '#8b3dff';
    ctx.lineWidth = 2;
    for (const w of state.walls) {
      ctx.fillRect(w.x, w.y, w.w, w.h);
      ctx.strokeRect(w.x, w.y, w.w, w.h);
    }

    state.players.forEach((p, i) => {
      const isIt = i === state.itIndex;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.fill();
      ctx.lineWidth = isIt ? 4 : 2;
      ctx.strokeStyle = isIt ? '#ff2b2b' : '#fff';
      ctx.stroke();

      ctx.fillStyle = '#0b0314';
      ctx.beginPath();
      ctx.arc(p.x - 5, p.y - 3, 2.5, 0, Math.PI * 2);
      ctx.arc(p.x + 5, p.y - 3, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(p.x, p.y + 4, 4, 0, Math.PI);
      ctx.strokeStyle = '#0b0314';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      if (isIt) drawArrow(p.x, p.y);

      ctx.fillStyle = '#e8e0ff';
      ctx.font = '8px "Press Start 2P"';
      ctx.textAlign = 'center';
      ctx.fillText('P' + (i + 1), p.x, p.y + p.r + 12);
    });

    if (!state.running && state.players.length === 0) {
      ctx.fillStyle = '#b3a1cf';
      ctx.font = '12px "Press Start 2P"';
      ctx.textAlign = 'center';
      ctx.fillText('SET OPTIONS & START', W / 2, H / 2);
    }
  }

  function loop(ts) {
    const dt = Math.min(0.05, (ts - (state.lastTs || ts)) / 1000);
    state.lastTs = ts;
    update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  document.getElementById('btnStart').onclick = startRound;
  document.getElementById('btnReset').onclick = () => {
    state.scores = [0, 0, 0, 0];
    renderScores();
  };

  renderScores();
  requestAnimationFrame(loop);
})();
