const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const uiMessage = document.getElementById('message');
const uiTimer = document.getElementById('timer');
const restartBtn = document.getElementById('restartBtn');

// Game state
let gameState = 'waiting'; // waiting, playing, gameover, won
let timeRemaining = 0;
let lastTime = 0;
let animationId;

// Input handling
const keys = {
    w: false, a: false, s: false, d: false,
    ArrowUp: false, ArrowLeft: false, ArrowDown: false, ArrowRight: false,
    Space: false
};

window.addEventListener('keydown', (e) => {
    if (keys.hasOwnProperty(e.key)) keys[e.key] = true;
    if (e.code === 'Space') keys.Space = true;
});

window.addEventListener('keyup', (e) => {
    if (keys.hasOwnProperty(e.key)) keys[e.key] = false;
    if (e.code === 'Space') keys.Space = false;
});

// Map definitions
const walls = [
    // Outer walls
    {x: 0, y: 0, w: 800, h: 20},
    {x: 0, y: 580, w: 800, h: 20},
    {x: 0, y: 0, w: 20, h: 600},
    {x: 780, y: 0, w: 20, h: 600},
    
    // Rooms
    {x: 200, y: 0, w: 20, h: 200},
    {x: 200, y: 300, w: 20, h: 100}, // doorway gap 200-300
    {x: 0, y: 400, w: 300, h: 20},
    {x: 400, y: 400, w: 100, h: 20}, // doorway gap 300-400
    {x: 500, y: 200, w: 300, h: 20},
    {x: 500, y: 0, w: 20, h: 100}, // doorway
];

const hidingSpots = [
    {x: 40, y: 40, w: 80, h: 120, type: 'Кровать'},
    {x: 700, y: 40, w: 60, h: 60, type: 'Шкаф'},
    {x: 40, y: 440, w: 100, h: 100, type: 'Стол'},
    {x: 650, y: 450, w: 100, h: 60, type: 'Диван'},
    {x: 350, y: 50, w: 80, h: 80, type: 'Коробки'}
];

// Entities
let player = { x: 400, y: 300, radius: 15, speed: 200, isHidden: false, currentSpot: null };
let seeker = { x: 750, y: 550, radius: 18, speed: 120, targetX: 750, targetY: 550, waitTimer: 0 };

function initGame() {
    player = { x: 400, y: 300, radius: 15, speed: 200, isHidden: false, currentSpot: null };
    seeker = { x: 750, y: 550, radius: 18, speed: 100, targetX: 750, targetY: 550, waitTimer: 0 };
    
    gameState = 'waiting';
    timeRemaining = 15; // 15 seconds to hide
    
    uiMessage.style.display = 'none';
    restartBtn.style.display = 'none';
    
    lastTime = performance.now();
    cancelAnimationFrame(animationId);
    gameLoop(lastTime);
}

function checkCollision(x, y, radius, ignoreWalls = false) {
    if (!ignoreWalls) {
        for (let w of walls) {
            // Simple AABB vs Circle collision
            let testX = x;
            let testY = y;
            
            if (x < w.x) testX = w.x;
            else if (x > w.x + w.w) testX = w.x + w.w;
            if (y < w.y) testY = w.y;
            else if (y > w.y + w.h) testY = w.y + w.h;
            
            let distX = x - testX;
            let distY = y - testY;
            let distance = Math.sqrt((distX*distX) + (distY*distY));
            
            if (distance <= radius) {
                return true;
            }
        }
    }
    return false;
}

function isInsideRect(x, y, rect) {
    return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}

function update(dt) {
    if (gameState === 'gameover' || gameState === 'won') return;

    // Time management
    timeRemaining -= dt;
    if (timeRemaining <= 0) {
        if (gameState === 'waiting') {
            gameState = 'playing';
            timeRemaining = 60; // 60 seconds to survive
            seeker.speed = 130; // seeker starts moving
        } else if (gameState === 'playing') {
            gameState = 'won';
            showGameOver('Вы победили! Время вышло.', true);
        }
    }

    // Update UI Timer
    if (gameState === 'waiting') {
        uiTimer.textContent = `У вас есть ${Math.ceil(timeRemaining)} сек чтобы спрятаться!`;
        uiTimer.style.color = 'blue';
    } else {
        uiTimer.textContent = `Выживите: ${Math.ceil(timeRemaining)} сек`;
        uiTimer.style.color = 'red';
    }

    // Player movement
    if (!player.isHidden) {
        let dx = 0;
        let dy = 0;
        if (keys.w || keys.ArrowUp) dy -= 1;
        if (keys.s || keys.ArrowDown) dy += 1;
        if (keys.a || keys.ArrowLeft) dx -= 1;
        if (keys.d || keys.ArrowRight) dx += 1;

        if (dx !== 0 && dy !== 0) {
            let length = Math.sqrt(dx*dx + dy*dy);
            dx /= length;
            dy /= length;
        }

        let nextX = player.x + dx * player.speed * dt;
        let nextY = player.y + dy * player.speed * dt;

        if (!checkCollision(nextX, player.y, player.radius)) player.x = nextX;
        if (!checkCollision(player.x, nextY, player.radius)) player.y = nextY;
    }

    // Hiding logic
    let onSpot = null;
    for (let spot of hidingSpots) {
        if (isInsideRect(player.x, player.y, spot)) {
            onSpot = spot;
            break;
        }
    }

    if (keys.Space && onSpot) {
        player.isHidden = true;
        player.currentSpot = onSpot;
    } else if (keys.Space && !onSpot) {
        // Can't hide here
    }

    // Unhide if moving
    if (player.isHidden && (keys.w || keys.s || keys.a || keys.d || keys.ArrowUp || keys.ArrowDown || keys.ArrowLeft || keys.ArrowRight)) {
        player.isHidden = false;
        player.currentSpot = null;
    }

    // Seeker AI
    if (gameState === 'playing') {
        if (seeker.waitTimer > 0) {
            seeker.waitTimer -= dt;
        } else {
            // Move to target
            let sdx = seeker.targetX - seeker.x;
            let sdy = seeker.targetY - seeker.y;
            let dist = Math.sqrt(sdx*sdx + sdy*sdy);

            if (dist < 5) {
                // Pick new target
                seeker.targetX = 50 + Math.random() * 700;
                seeker.targetY = 50 + Math.random() * 500;
                seeker.waitTimer = Math.random() * 2; // wait 0-2 seconds
            } else {
                let nsdx = sdx / dist;
                let nsdy = sdy / dist;
                
                let sNextX = seeker.x + nsdx * seeker.speed * dt;
                let sNextY = seeker.y + nsdy * seeker.speed * dt;
                
                // Extremely simple pathfinding: if hit wall, pick new target
                if (checkCollision(sNextX, sNextY, seeker.radius)) {
                    seeker.targetX = 50 + Math.random() * 700;
                    seeker.targetY = 50 + Math.random() * 500;
                } else {
                    seeker.x = sNextX;
                    seeker.y = sNextY;
                }
            }
        }

        // Catch logic
        let distToPlayer = Math.sqrt(Math.pow(seeker.x - player.x, 2) + Math.pow(seeker.y - player.y, 2));
        
        if (!player.isHidden && distToPlayer < 100) {
            // Simple line of sight (just distance for now)
            gameState = 'gameover';
            showGameOver('Вас нашли!', false);
        } else if (player.isHidden && distToPlayer < 40) {
            // Small chance to find if seeker walks right over the hiding spot
            if (Math.random() < 0.02) {
                gameState = 'gameover';
                showGameOver('Искатель проверил ваше укрытие и нашел вас!', false);
            }
        }
    }
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw floor/grid (optional, keep it simple for now)

    // Draw hiding spots
    for (let spot of hidingSpots) {
        ctx.fillStyle = 'rgba(0, 150, 255, 0.4)';
        ctx.fillRect(spot.x, spot.y, spot.w, spot.h);
        ctx.fillStyle = 'black';
        ctx.font = '14px Arial';
        ctx.fillText(spot.type, spot.x + 5, spot.y + 20);
    }

    // Draw walls
    ctx.fillStyle = '#444';
    for (let w of walls) {
        ctx.fillRect(w.x, w.y, w.w, w.h);
    }

    // Draw Player
    if (player.isHidden) {
        ctx.globalAlpha = 0.3;
    }
    ctx.beginPath();
    ctx.arc(player.x, player.y, player.radius, 0, Math.PI * 2);
    ctx.fillStyle = '#00FF00'; // Green player
    ctx.fill();
    ctx.strokeStyle = '#008800';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.globalAlpha = 1.0;

    // Draw Seeker
    if (gameState === 'playing' || gameState === 'gameover') {
        ctx.beginPath();
        ctx.arc(seeker.x, seeker.y, seeker.radius, 0, Math.PI * 2);
        ctx.fillStyle = '#FF0000'; // Red seeker
        ctx.fill();
        ctx.strokeStyle = '#880000';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        // Draw seeker vision radius
        ctx.beginPath();
        ctx.arc(seeker.x, seeker.y, 100, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 0, 0, 0.1)';
        ctx.fill();
    }
}

function showGameOver(text, won) {
    uiMessage.textContent = text;
    uiMessage.style.color = won ? '#44ff44' : '#ff3333';
    uiMessage.style.display = 'block';
    restartBtn.style.display = 'inline-block';
}

function gameLoop(timestamp) {
    let dt = (timestamp - lastTime) / 1000;
    if (dt > 0.1) dt = 0.1; // Cap delta time
    lastTime = timestamp;

    update(dt);
    draw();

    animationId = requestAnimationFrame(gameLoop);
}

// Start game
initGame();

// Mobile Controls
const bindBtn = (id, key) => {
    const btn = document.getElementById(id);
    if (!btn) return;
    
    const press = (e) => { 
        e.preventDefault(); 
        keys[key] = true; 
    };
    const release = (e) => { 
        e.preventDefault(); 
        keys[key] = false; 
    };
    
    btn.addEventListener('touchstart', press, {passive: false});
    btn.addEventListener('mousedown', press);
    btn.addEventListener('touchend', release, {passive: false});
    btn.addEventListener('mouseup', release);
    btn.addEventListener('mouseleave', release);
};

bindBtn('btn-up', 'w');
bindBtn('btn-down', 's');
bindBtn('btn-left', 'a');
bindBtn('btn-right', 'd');
bindBtn('btn-hide', 'Space');
