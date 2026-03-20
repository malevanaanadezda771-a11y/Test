/**
 * game.js — Основной игровой движок
 * Мультиплеер (2 игрока на одном экране), 3 трассы, 3 круга
 */

const Game = (() => {

  /* ============ STATE ============ */
  let canvas, ctx;
  let car1, car2;
  let currentLevel = 1;
  let trackDef;
  let outerPoly = [], innerPoly = [];
  let finishLine = {};
  let checkpoints = [];
  let paused = false;
  let gameRunning = false;
  let startTime = 0;
  let raceTime = 0;
  let animId = null;
  let particles = [];
  let boostPads = [];
  let keys = {};

  // Камера (для отслеживания центра)
  let camX = 0, camY = 0;

  /* ============ SCREENS ============ */
  function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
  }
  function showMenu()        { stopGame(); showScreen('screen-menu'); }
  function showLevelSelect() { showScreen('screen-levels'); }
  function showControls()    { showScreen('screen-controls'); }

  /* ============ START ============ */
  function startLevel(lvl) {
    currentLevel = lvl;
    trackDef = TRACK_DEFS[lvl];
    document.getElementById('hud-level-name').textContent = trackDef.name;
    showScreen('screen-game');
    _initCanvas();
    _buildTrack();
    _spawnCars();
    _setupKeys();
    paused = false;
    gameRunning = true;
    _countdown(() => {
      startTime = performance.now();
      _loop();
    });
  }

  function restartLevel() {
    hideOverlay('finish-overlay');
    stopGame();
    startLevel(currentLevel);
  }

  function stopGame() {
    gameRunning = false;
    paused = false;
    if (animId) { cancelAnimationFrame(animId); animId = null; }
  }

  /* ============ CANVAS ============ */
  function _initCanvas() {
    canvas = document.getElementById('gameCanvas');
    ctx    = canvas.getContext('2d');
    _resizeCanvas();
  }

  function _resizeCanvas() {
    if (!canvas) return;
    const parent = canvas.parentElement;
    canvas.width  = parent.clientWidth  || window.innerWidth;
    canvas.height = parent.clientHeight - 
      (document.querySelector('.game-hud')?.offsetHeight || 56) -
      (document.querySelector('.game-footer')?.offsetHeight || 40);
  }

  window.addEventListener('resize', () => { if (gameRunning) _resizeCanvas(); });

  /* ============ TRACK BUILD ============ */
  function _buildTrack() {
    const td = trackDef;
    const pts = td.centerLine;
    const tw  = td.trackWidth;

    outerPoly = [];
    innerPoly = [];
    checkpoints = [];
    finishLine  = {};

    // Строим внешний и внутренний полигон из средней линии
    for (let i = 0; i < pts.length - 1; i++) {
      const curr = pts[i];
      const next = pts[i + 1];
      const dx = next.x - curr.x;
      const dy = next.y - curr.y;
      const len = Math.sqrt(dx*dx + dy*dy) || 1;
      const nx = -dy / len;
      const ny =  dx / len;

      outerPoly.push({ x: curr.x + nx * tw/2, y: curr.y + ny * tw/2 });
      innerPoly.push({ x: curr.x - nx * tw/2, y: curr.y - ny * tw/2 });

      // Checkpoint каждые 2 сегмента
      if (i % 3 === 1) {
        checkpoints.push({
          ax: curr.x + nx * tw/2, ay: curr.y + ny * tw/2,
          bx: curr.x - nx * tw/2, by: curr.y - ny * tw/2,
          id: checkpoints.length,
        });
      }
    }

    // Стартовая линия
    const sp = pts[0];
    const sn = pts[1];
    const sdx = sn.x - sp.x, sdy = sn.y - sp.y;
    const sl = Math.sqrt(sdx*sdx + sdy*sdy) || 1;
    const snx = -sdy/sl, sny = sdx/sl;
    finishLine = {
      ax: sp.x + snx * tw/2, ay: sp.y + sny * tw/2,
      bx: sp.x - snx * tw/2, by: sp.y - sny * tw/2,
    };

    // Boost pads
    boostPads = [];
    const cpCount = checkpoints.length;
    [Math.floor(cpCount*0.3), Math.floor(cpCount*0.65)].forEach(idx => {
      if (checkpoints[idx]) {
        const cp = checkpoints[idx];
        boostPads.push({
          x: (cp.ax + cp.bx) / 2,
          y: (cp.ay + cp.by) / 2,
          r: 22,
          active: true,
          cooldown: 0,
        });
      }
    });
  }

  /* ============ SPAWN CARS ============ */
  function _spawnCars() {
    const td = trackDef;
    car1 = new Car({
      id: 1, color: '#3a9cff',
      x: td.startX, y: td.startY, angle: td.startAngle || 0,
    });
    car2 = new Car({
      id: 2, color: '#ff4d4d',
      x: td.startX2 || td.startX + 40, y: td.startY2 || td.startY,
      angle: td.startAngle2 || 0,
    });
    particles = [];
  }

  /* ============ KEYS ============ */
  function _setupKeys() {
    keys = {};
    const onDown = e => {
      keys[e.code] = true;
      if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code))
        e.preventDefault();
    };
    const onUp = e => { keys[e.code] = false; };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup',   onUp);

    // Store references to remove later
    Game._keydown = onDown;
    Game._keyup   = onUp;
  }

  /* ============ COUNTDOWN ============ */
  function _countdown(cb) {
    const overlay = document.getElementById('countdown-overlay');
    const txt     = document.getElementById('countdown-text');
    overlay.classList.remove('hidden');
    const steps = ['3', '2', '1', '🚦 СТАРТ!'];
    const colors = ['#ff4444', '#f0c000', '#00ff88', '#00cfff'];
    let i = 0;
    const run = () => {
      txt.textContent = steps[i];
      txt.style.color = colors[i];
      i++;
      if (i < steps.length) { setTimeout(run, 700); }
      else {
        setTimeout(() => {
          overlay.classList.add('hidden');
          cb();
        }, 600);
      }
    };
    run();
  }

  /* ============ PAUSE ============ */
  function togglePause() {
    if (!gameRunning) return;
    paused = !paused;
    const overlay = document.getElementById('pause-overlay');
    if (paused) {
      overlay.classList.remove('hidden');
    } else {
      overlay.classList.add('hidden');
      if (!animId) _loop();
    }
  }

  function exitToMenu() {
    hideOverlay('pause-overlay');
    hideOverlay('finish-overlay');
    showMenu();
  }

  function hideOverlay(id) {
    document.getElementById(id).classList.add('hidden');
  }

  /* ============ MAIN LOOP ============ */
  function _loop() {
    if (!gameRunning || paused) { animId = null; return; }
    animId = requestAnimationFrame(_loop);

    // Input → cars
    car1.keys.up    = !!keys['KeyW'];
    car1.keys.down  = !!keys['KeyS'];
    car1.keys.left  = !!keys['KeyA'];
    car1.keys.right = !!keys['KeyD'];
    car2.keys.up    = !!keys['ArrowUp'];
    car2.keys.down  = !!keys['ArrowDown'];
    car2.keys.left  = !!keys['ArrowLeft'];
    car2.keys.right = !!keys['ArrowRight'];

    // Update
    _update();

    // Draw
    _draw();

    // HUD
    _updateHUD();
  }

  /* ============ UPDATE ============ */
  function _update() {
    raceTime = (performance.now() - startTime) / 1000;

    // Track check (inner/outer)
    car1.onTrack = _isOnTrack(car1.x, car1.y);
    car2.onTrack = _isOnTrack(car2.x, car2.y);

    car1.update(trackDef, checkpoints, finishLine);
    car2.update(trackDef, checkpoints, finishLine);

    // Car ↔ Car collision
    _handleCarCollision(car1, car2);

    // Boost pads
    _checkBoostPads(car1);
    _checkBoostPads(car2);

    // Boost cooldown
    boostPads.forEach(bp => {
      if (!bp.active) {
        bp.cooldown--;
        if (bp.cooldown <= 0) bp.active = true;
      }
    });

    // Checkpoints & laps
    _checkCheckpoints(car1);
    _checkCheckpoints(car2);

    // Particles
    particles.forEach(p => {
      p.x += p.vx; p.y += p.vy;
      p.life -= 0.02;
      p.vx *= 0.97; p.vy *= 0.97;
    });
    particles = particles.filter(p => p.life > 0);

    // Dust when off track
    [car1, car2].forEach(c => {
      if (!c.onTrack && Math.abs(c.speed) > 0.5) {
        _spawnDust(c.x, c.y, c.color);
      }
    });
  }

  function _isOnTrack(x, y) {
    // Упрощённая проверка: точка лежит между внешним и внутренним полигоном
    // Используем лучевой алгоритм
    if (!outerPoly.length) return true;
    return _pointInPolygon(x, y, outerPoly) && !_pointInPolygon(x, y, innerPoly);
  }

  function _pointInPolygon(x, y, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i].x, yi = poly[i].y;
      const xj = poly[j].x, yj = poly[j].y;
      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
        inside = !inside;
      }
    }
    return inside;
  }

  function _checkBoostPads(car) {
    boostPads.forEach(bp => {
      if (!bp.active) return;
      const dx = car.x - bp.x, dy = car.y - bp.y;
      if (dx*dx + dy*dy < bp.r * bp.r) {
        car.speed = Math.min(car.speed + 2.5, car.maxSpeed * 1.4);
        bp.active = false;
        bp.cooldown = 240;
        _spawnBoostEffect(bp.x, bp.y);
      }
    });
  }

  function _checkCheckpoints(car) {
    if (car.finished) return;

    checkpoints.forEach(cp => {
      if (car.checkpoints.has(cp.id)) return;
      if (_carNearSegment(car, cp.ax, cp.ay, cp.bx, cp.by)) {
        car.checkpoints.add(cp.id);
      }
    });

    // Finish line — проверяем только когда все checkpoints пройдены
    if (car.checkpoints.size >= Math.max(1, Math.floor(checkpoints.length * 0.6))) {
      if (_carNearSegment(car, finishLine.ax, finishLine.ay, finishLine.bx, finishLine.by)) {
        car.checkpoints.clear();
        car.lap++;
        _spawnLapEffect(car.x, car.y, car.color);
        if (car.lap > trackDef.lapCount) {
          car.finished   = true;
          car.finishTime = raceTime;
          car.lap        = trackDef.lapCount;
          _onCarFinished(car);
        }
      }
    }
  }

  function _carNearSegment(car, ax, ay, bx, by) {
    const dist = _pointSegDist(car.x, car.y, ax, ay, bx, by);
    return dist < 42;
  }

  function _pointSegDist(px, py, ax, ay, bx, by) {
    const abx = bx - ax, aby = by - ay;
    const apx = px - ax, apy = py - ay;
    const t = Math.max(0, Math.min(1, (apx*abx + apy*aby) / (abx*abx + aby*aby + 0.0001)));
    const cx = ax + t*abx, cy = ay + t*aby;
    const dx = px - cx, dy = py - cy;
    return Math.sqrt(dx*dx + dy*dy);
  }

  function _handleCarCollision(c1, c2) {
    const dx = c2.x - c1.x, dy = c2.y - c1.y;
    const dist = Math.sqrt(dx*dx + dy*dy);
    const minDist = 40;
    if (dist < minDist && dist > 0.1) {
      const nx = dx / dist, ny = dy / dist;
      const overlap = (minDist - dist) / 2;
      c1.x -= nx * overlap; c1.y -= ny * overlap;
      c2.x += nx * overlap; c2.y += ny * overlap;

      // Обмен скоростями
      const dot1 = c1.speed * Math.sin(c1.angle) * nx + (-c1.speed * Math.cos(c1.angle)) * ny;
      const dot2 = c2.speed * Math.sin(c2.angle) * nx + (-c2.speed * Math.cos(c2.angle)) * ny;
      const elasticity = 0.6;
      c1.speed = c1.speed - dot1 * elasticity;
      c2.speed = c2.speed + dot2 * elasticity;

      // Частицы при столкновении
      if (Math.abs(dot1 - dot2) > 0.5) {
        for (let i = 0; i < 8; i++) {
          const a = Math.random() * Math.PI * 2;
          particles.push({
            x: (c1.x + c2.x)/2, y: (c1.y + c2.y)/2,
            vx: Math.cos(a) * 2, vy: Math.sin(a) * 2,
            color: '#ffcc00', size: 4 + Math.random()*4, life: 1,
          });
        }
      }
    }
  }

  function _spawnDust(x, y, color) {
    for (let i = 0; i < 2; i++) {
      particles.push({
        x: x + (Math.random()-0.5)*10,
        y: y + (Math.random()-0.5)*10,
        vx: (Math.random()-0.5)*1.5, vy: (Math.random()-0.5)*1.5 - 0.5,
        color: '#c8a96e', size: 5 + Math.random()*6, life: 0.8,
      });
    }
  }

  function _spawnBoostEffect(x, y) {
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      particles.push({
        x, y, vx: Math.cos(a)*3, vy: Math.sin(a)*3,
        color: '#00ff88', size: 6, life: 1,
      });
    }
  }

  function _spawnLapEffect(x, y, color) {
    for (let i = 0; i < 20; i++) {
      const a = Math.random() * Math.PI * 2;
      particles.push({
        x, y, vx: Math.cos(a)*4, vy: Math.sin(a)*4,
        color, size: 7 + Math.random()*5, life: 1,
      });
    }
  }

  function _onCarFinished(car) {
    const otherCar = car.id === 1 ? car2 : car1;
    if (!otherCar.finished) {
      // Первый финишировал — ждём второго или показываем результат
      setTimeout(() => {
        if (!otherCar.finished) {
          otherCar.finished   = true;
          otherCar.finishTime = raceTime;
          _showFinish();
        }
      }, 8000);
    } else {
      _showFinish();
    }
  }

  function _showFinish() {
    stopGame();
    const winner = car1.finishTime <= (car2.finishTime || Infinity) ? car1 : car2;
    const winnerName = winner.id === 1 ? '🔵 Игрок 1' : '🔴 Игрок 2';

    document.getElementById('finish-winner').textContent = winnerName;
    document.getElementById('finish-winner').style.color = winner.color;
    document.getElementById('finish-title').textContent = '🏆 Победитель!';

    const t1 = _fmtTime(car1.finishTime || raceTime);
    const t2 = _fmtTime(car2.finishTime || raceTime);
    document.getElementById('finish-stats').innerHTML =
      `🔵 Игрок 1: ${t1}<br>🔴 Игрок 2: ${t2}`;

    document.getElementById('finish-overlay').classList.remove('hidden');
  }

  function _fmtTime(t) {
    const m = Math.floor(t / 60);
    const s = (t % 60).toFixed(2);
    return `${m}:${s.padStart(5,'0')}`;
  }

  /* ============ DRAW ============ */
  function _draw() {
    const W = canvas.width, H = canvas.height;

    // Scale: game world is 1200×700, fit to canvas
    const scaleX = W / 1200, scaleY = H / 700;
    const scale  = Math.min(scaleX, scaleY);
    const offX   = (W - 1200 * scale) / 2;
    const offY   = (H - 700  * scale) / 2;

    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.translate(offX, offY);
    ctx.scale(scale, scale);

    // Background
    ctx.fillStyle = trackDef.grassColor;
    ctx.fillRect(-100, -100, 1400, 900);

    // Sky/horizon effect
    const skyGrd = ctx.createLinearGradient(0, -100, 0, 200);
    skyGrd.addColorStop(0, trackDef.skyColor || '#87CEEB');
    skyGrd.addColorStop(1, trackDef.grassColor);
    ctx.fillStyle = skyGrd;
    ctx.fillRect(-100, -100, 1400, 300);

    // Decorations (behind track)
    _drawDecorations(ctx);

    // Road (outer polygon filled = road, then inner refilled = grass)
    if (outerPoly.length > 2) {
      // Road
      ctx.beginPath();
      ctx.moveTo(outerPoly[0].x, outerPoly[0].y);
      outerPoly.forEach(p => ctx.lineTo(p.x, p.y));
      ctx.closePath();
      ctx.fillStyle = trackDef.roadColor;
      ctx.fill();

      // Inner (grass hole)
      ctx.beginPath();
      ctx.moveTo(innerPoly[0].x, innerPoly[0].y);
      innerPoly.forEach(p => ctx.lineTo(p.x, p.y));
      ctx.closePath();
      ctx.fillStyle = trackDef.grassColor;
      ctx.fill();
    }

    // Road kerbs / borders
    _drawBorders(ctx);

    // Center dashes
    _drawCenterLine(ctx);

    // Finish line
    _drawFinishLine(ctx);

    // Boost pads
    _drawBoostPads(ctx);

    // Checkpoints (invisible aid — optional visual debug off)
    // _drawCheckpoints(ctx);

    // Particles
    particles.forEach(p => {
      ctx.save();
      ctx.globalAlpha = p.life * 0.9;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI*2);
      ctx.fill();
      ctx.restore();
    });

    // Cars
    car1.draw(ctx);
    car2.draw(ctx);

    // Night effect
    if (currentLevel === 2) _drawNightEffect(ctx);

    ctx.restore();
  }

  function _drawBorders(ctx) {
    const td = trackDef;
    const borderW = 8;
    ctx.strokeStyle = td.borderColor;
    ctx.lineWidth = borderW;
    ctx.setLineDash([]);

    // Outer border
    if (outerPoly.length > 2) {
      ctx.beginPath();
      ctx.moveTo(outerPoly[0].x, outerPoly[0].y);
      outerPoly.forEach(p => ctx.lineTo(p.x, p.y));
      ctx.closePath();
      ctx.stroke();
    }
    // Inner border
    if (innerPoly.length > 2) {
      ctx.beginPath();
      ctx.moveTo(innerPoly[0].x, innerPoly[0].y);
      innerPoly.forEach(p => ctx.lineTo(p.x, p.y));
      ctx.closePath();
      ctx.stroke();
    }
  }

  function _drawCenterLine(ctx) {
    const pts = trackDef.centerLine;
    if (pts.length < 2) return;
    ctx.setLineDash([18, 14]);
    ctx.lineWidth = 3;
    ctx.strokeStyle = trackDef.lineColor;
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    pts.forEach(p => ctx.lineTo(p.x, p.y));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }

  function _drawFinishLine(ctx) {
    if (!finishLine.ax) return;
    ctx.save();
    const dx = finishLine.bx - finishLine.ax;
    const dy = finishLine.by - finishLine.ay;
    const len = Math.sqrt(dx*dx + dy*dy) || 1;
    const nx = dx / len, ny = dy / len;
    const blocks = 6;
    const blen = len / blocks;
    for (let i = 0; i < blocks; i++) {
      ctx.fillStyle = (i % 2 === 0) ? '#ffffff' : '#000000';
      ctx.fillRect(
        finishLine.ax + nx*blen*i - 6*ny - 2,
        finishLine.ay + ny*blen*i + 6*nx - 2,
        blen + 4, 12
      );
    }
    ctx.restore();
  }

  function _drawBoostPads(ctx) {
    const t = performance.now() / 1000;
    boostPads.forEach(bp => {
      ctx.save();
      ctx.translate(bp.x, bp.y);
      if (!bp.active) {
        ctx.globalAlpha = 0.3;
      }
      const grd = ctx.createRadialGradient(0,0,4, 0,0, bp.r);
      grd.addColorStop(0, '#00ff88');
      grd.addColorStop(1, 'rgba(0,255,136,0)');
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.arc(0, 0, bp.r + Math.sin(t*4)*3, 0, Math.PI*2);
      ctx.fill();

      // Arrow ↑
      ctx.fillStyle = '#fff';
      ctx.globalAlpha *= 0.9;
      ctx.font = 'bold 18px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('⚡', 0, 0);
      ctx.restore();
    });
  }

  function _drawDecorations(ctx) {
    if (!trackDef.decorations) return;
    trackDef.decorations.forEach(d => {
      ctx.save();
      ctx.translate(d.x, d.y);
      if (d.type === 'tree') {
        // Trunk
        ctx.fillStyle = '#5a3a1a';
        ctx.fillRect(-5, 0, 10, d.r * 0.7);
        // Top
        ctx.fillStyle = '#2a6a2a';
        ctx.beginPath();
        ctx.arc(0, -d.r * 0.3, d.r, 0, Math.PI*2);
        ctx.fill();
        ctx.fillStyle = '#3a8a3a';
        ctx.beginPath();
        ctx.arc(-d.r*0.2, -d.r*0.5, d.r*0.7, 0, Math.PI*2);
        ctx.fill();
      } else if (d.type === 'building') {
        // Night city building
        ctx.fillStyle = '#1a1a3a';
        ctx.fillRect(-d.w/2, -d.h, d.w, d.h);
        ctx.fillStyle = '#2a2a5a';
        ctx.fillRect(-d.w/2 + 2, -d.h + 2, d.w - 4, d.h - 4);
        // Windows
        for (let wy = -d.h + 10; wy < -10; wy += 16) {
          for (let wx = -d.w/2 + 6; wx < d.w/2 - 6; wx += 14) {
            ctx.fillStyle = Math.random() > 0.4 ? '#ffffaa' : '#334';
            ctx.fillRect(wx, wy, 8, 10);
          }
        }
      } else if (d.type === 'rock') {
        ctx.fillStyle = '#6a5a4a';
        ctx.beginPath();
        ctx.arc(0, 0, d.r, 0, Math.PI*2);
        ctx.fill();
        ctx.fillStyle = '#8a7a6a';
        ctx.beginPath();
        ctx.arc(-d.r*0.2, -d.r*0.2, d.r*0.6, 0, Math.PI*2);
        ctx.fill();
      } else if (d.type === 'lamp') {
        ctx.strokeStyle = '#888';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(0, 20); ctx.lineTo(0, -30); ctx.lineTo(15, -30);
        ctx.stroke();
        // Light
        const grd = ctx.createRadialGradient(15,-30,2, 15,-30,40);
        grd.addColorStop(0, 'rgba(255,255,180,0.6)');
        grd.addColorStop(1, 'rgba(255,255,180,0)');
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.arc(15, -30, 40, 0, Math.PI*2);
        ctx.fill();
      }
      ctx.restore();
    });
  }

  function _drawNightEffect(ctx) {
    // Headlights for cars
    [car1, car2].forEach(c => {
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate(c.angle);
      const grd = ctx.createRadialGradient(0, -c.h/2, 0, 0, -c.h/2, 130);
      grd.addColorStop(0, 'rgba(255,255,200,0.18)');
      grd.addColorStop(0.3, 'rgba(255,255,200,0.06)');
      grd.addColorStop(1, 'rgba(255,255,200,0)');
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.moveTo(-40, -c.h/2);
      ctx.lineTo(0, -c.h/2 - 130);
      ctx.lineTo(40, -c.h/2);
      ctx.fill();
      ctx.restore();
    });
  }

  /* ============ HUD ============ */
  function _updateHUD() {
    document.getElementById('p1-speed').textContent = car1.getSpeedKmh();
    document.getElementById('p2-speed').textContent = car2.getSpeedKmh();
    document.getElementById('p1-lap').textContent = Math.min(car1.lap, trackDef.lapCount);
    document.getElementById('p2-lap').textContent = Math.min(car2.lap, trackDef.lapCount);

    // Position
    if (car1.lap > car2.lap || (car1.lap === car2.lap && car1.checkpoints.size >= car2.checkpoints.size)) {
      document.getElementById('p1-pos').textContent = '1';
      document.getElementById('p2-pos').textContent = '2';
    } else {
      document.getElementById('p1-pos').textContent = '2';
      document.getElementById('p2-pos').textContent = '1';
    }

    // Timer
    document.getElementById('hud-timer').textContent = _fmtTime(raceTime);
  }

  /* ============ PUBLIC API ============ */
  return {
    showMenu, showLevelSelect, showControls,
    startLevel, restartLevel,
    togglePause, exitToMenu,
  };

})();
// TURBO RACE v1.0
