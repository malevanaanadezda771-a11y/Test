/**
 * car.js — Физика и рендер автомобиля
 */

class Car {
  constructor(cfg) {
    this.id     = cfg.id;     // 1 | 2
    this.color  = cfg.color;
    this.x      = cfg.x;
    this.y      = cfg.y;
    this.angle  = cfg.angle || 0; // радианы

    // Физика
    this.vx     = 0;
    this.vy     = 0;
    this.speed  = 0;      // текущая скорость (px/frame)
    this.maxSpeed    = 6.2;
    this.accel       = 0.18;
    this.brakeForce  = 0.28;
    this.friction    = 0.97;
    this.turnSpeed   = 0.042;
    this.offRoadFactor = 0.45; // замедление на траве

    // Управление
    this.keys = {
      up: false, down: false, left: false, right: false
    };

    // Гонка
    this.lap         = 1;
    this.checkpoints = new Set();
    this.finished    = false;
    this.finishTime  = null;
    this.onTrack     = true;

    // Визуал — размер
    this.w = 28; this.h = 46;

    // Эффекты
    this.trail = [];
    this.lastTrailX = this.x;
    this.lastTrailY = this.y;

    // Столкновение
    this.bounceTimer = 0;
  }

  update(track, checkpointPolygons, finishLine) {
    if (this.finished) return;

    const gas   = this.keys.up;
    const brake = this.keys.down;
    const left  = this.keys.left;
    const right = this.keys.right;

    // Ускорение
    let accelFactor = this.onTrack ? 1 : this.offRoadFactor;

    if (gas) {
      this.speed = Math.min(this.speed + this.accel * accelFactor, this.maxSpeed * accelFactor);
    } else if (brake) {
      this.speed = Math.max(this.speed - this.brakeForce, -this.maxSpeed * 0.4 * accelFactor);
    }

    // Трение
    this.speed *= this.friction;
    if (Math.abs(this.speed) < 0.01) this.speed = 0;

    // Поворот (пропорционально скорости)
    if (Math.abs(this.speed) > 0.05) {
      const dir = this.speed > 0 ? 1 : -1;
      if (left)  this.angle -= this.turnSpeed * dir * Math.min(Math.abs(this.speed) / 2, 1);
      if (right) this.angle += this.turnSpeed * dir * Math.min(Math.abs(this.speed) / 2, 1);
    }

    // Движение
    const nx = this.x + Math.sin(this.angle) * this.speed;
    const ny = this.y - Math.cos(this.angle) * this.speed;

    // Граница экрана
    if (nx > 40 && nx < 1160 && ny > 40 && ny < 660) {
      this.x = nx; this.y = ny;
    } else {
      // Отскок от края
      this.speed *= -0.5;
      this.angle += Math.PI;
    }

    // Отскок между машинами — обрабатывается снаружи

    // След (только при высокой скорости)
    if (Math.abs(this.speed) > 1.5) {
      const dx = this.x - this.lastTrailX;
      const dy = this.y - this.lastTrailY;
      if (dx*dx + dy*dy > 64) {
        this.trail.push({x: this.x, y: this.y, a: this.angle, speed: this.speed, life: 1.0});
        this.lastTrailX = this.x; this.lastTrailY = this.y;
        if (this.trail.length > 60) this.trail.shift();
      }
    }

    // Угасание следа
    this.trail.forEach(t => { t.life -= 0.018; });
    this.trail = this.trail.filter(t => t.life > 0);

    // Bounce timer
    if (this.bounceTimer > 0) this.bounceTimer--;
  }

  draw(ctx) {
    // Рисуем след
    this.trail.forEach((t, i) => {
      ctx.save();
      ctx.translate(t.x, t.y);
      ctx.rotate(t.angle);
      ctx.globalAlpha = t.life * 0.25;
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.ellipse(0, 0, 5, 8, 0, 0, Math.PI*2);
      ctx.fill();
      ctx.restore();
    });

    // Машина
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);

    const w = this.w, h = this.h;

    // Тень
    ctx.shadowBlur = 12;
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowOffsetX = 3; ctx.shadowOffsetY = 3;

    // Корпус
    ctx.fillStyle = this.color;
    ctx.beginPath();
    this._roundRect(ctx, -w/2, -h/2, w, h, 7);
    ctx.fill();

    ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;

    // Кабина (верх)
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.beginPath();
    this._roundRect(ctx, -w/2 + 4, -h/2 + 8, w - 8, h/2 - 4, 4);
    ctx.fill();

    // Стекло (лобовое)
    ctx.fillStyle = 'rgba(180,230,255,0.7)';
    ctx.beginPath();
    this._roundRect(ctx, -w/2 + 5, -h/2 + 5, w - 10, 14, 3);
    ctx.fill();

    // Заднее стекло
    ctx.fillStyle = 'rgba(180,230,255,0.5)';
    ctx.beginPath();
    this._roundRect(ctx, -w/2 + 5, h/2 - 16, w - 10, 10, 3);
    ctx.fill();

    // Колёса
    ctx.fillStyle = '#222';
    // Передние
    this._wheel(ctx, -w/2 - 3, -h/2 + 6, 7, 12);
    this._wheel(ctx,  w/2 - 4, -h/2 + 6, 7, 12);
    // Задние
    this._wheel(ctx, -w/2 - 3,  h/2 - 18, 7, 12);
    this._wheel(ctx,  w/2 - 4,  h/2 - 18, 7, 12);

    // Фары (передние)
    ctx.fillStyle = '#ffffcc';
    ctx.beginPath(); ctx.ellipse(-w/2 + 5, -h/2 + 3, 4, 3, 0, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse( w/2 - 5, -h/2 + 3, 4, 3, 0, 0, Math.PI*2); ctx.fill();

    // Задние огни
    ctx.fillStyle = '#ff2222';
    ctx.beginPath(); ctx.ellipse(-w/2 + 5, h/2 - 3, 4, 3, 0, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse( w/2 - 5, h/2 - 3, 4, 3, 0, 0, Math.PI*2); ctx.fill();

    // Номер
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.id, 0, h/4);

    ctx.restore();
  }

  _wheel(ctx, x, y, w, h) {
    ctx.save();
    ctx.translate(x + w/2, y + h/2);
    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath();
    this._roundRect(ctx, -w/2, -h/2, w, h, 2);
    ctx.fill();
    ctx.fillStyle = '#555';
    ctx.beginPath();
    ctx.arc(0, 0, w/3, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();
  }

  _roundRect(ctx, x, y, w, h, r) {
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
  }

  getSpeedKmh() {
    return Math.round(Math.abs(this.speed) * 100);
  }

  // Возвращает "hitbox" — 4 угла прямоугольника
  getCorners() {
    const cos = Math.cos(this.angle), sin = Math.sin(this.angle);
    const hw = this.w / 2, hh = this.h / 2;
    const corners = [
      {x: -hw, y: -hh}, {x: hw, y: -hh},
      {x: hw, y: hh},   {x: -hw, y: hh},
    ];
    return corners.map(c => ({
      x: this.x + c.x * cos - c.y * sin,
      y: this.y + c.x * sin + c.y * cos,
    }));
  }
}
