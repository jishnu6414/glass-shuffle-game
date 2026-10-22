// --- GAME STATE & CONSTANTS ---
let balance = parseFloat(localStorage.getItem('gs_balance')) || 1000.00;
let history = JSON.parse(localStorage.getItem('gs_history')) || [];
let currentBet = 100;
let fee = 0;
let gamePhase = 'IDLE'; 
let timerInterval = null;
let timerTime = 0;
let isPaused = false;
let isMuted = localStorage.getItem('gs_muted') === 'true';

let ballSlot = 1; 
let slotToGlass = [0, 1, 2]; 
let currentPickCallback = null; // Stores the function to run when pick timer ends
let currentPickText = "";

// DOM Elements
const balanceDisplay = document.getElementById('balance-display');
const betInput = document.getElementById('bet-input');
const startBtn = document.getElementById('start-btn');
const pauseBtn = document.getElementById('pause-btn');
const soundBtn = document.getElementById('sound-btn');
const resetBtn = document.getElementById('reset-btn');
const statusText = document.getElementById('status-text');
const timerBar = document.getElementById('timer-bar');
const glassesContainer = document.getElementById('glasses-container');
const ballWrapper = document.getElementById('ball-wrapper');
const bettingPanel = document.getElementById('betting-panel');
const historyBtn = document.getElementById('history-btn');
const historyModal = document.getElementById('history-modal');
const closeModal = document.getElementById('close-modal');
const toastContainer = document.getElementById('toast-container');

const wrappers = [
    document.getElementById('wrapper-0'),
    document.getElementById('wrapper-1'),
    document.getElementById('wrapper-2')
];

// --- INIT ---
updateUI();
updateSoundIcon();
renderHistory();
initGlasses();

// --- TOAST NOTIFICATIONS ---
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span>${message}</span>`;
    toastContainer.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'fadeOut 0.3s ease-in forwards';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// --- AUDIO API ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function playSound(type) {
    if (isMuted) return; // Mute check
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain); gain.connect(audioCtx.destination);
    
    if (type === 'shuffle') {
        osc.type = 'triangle'; osc.frequency.setValueAtTime(300, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(400, audioCtx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.05, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
        osc.start(); osc.stop(audioCtx.currentTime + 0.1);
    } else if (type === 'win') {
        osc.type = 'sine'; osc.frequency.setValueAtTime(400, audioCtx.currentTime);
        osc.frequency.setValueAtTime(600, audioCtx.currentTime + 0.1);
        osc.frequency.setValueAtTime(800, audioCtx.currentTime + 0.2);
        gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.4);
        osc.start(); osc.stop(audioCtx.currentTime + 0.4);
    } else if (type === 'lose') {
        osc.type = 'sawtooth'; osc.frequency.setValueAtTime(150, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(50, audioCtx.currentTime + 0.3);
        gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
        osc.start(); osc.stop(audioCtx.currentTime + 0.3);
    }
}

// --- UI & CONTROLS ---
function updateUI() {
    balanceDisplay.textContent = `$${balance.toFixed(2)}`;
    localStorage.setItem('gs_balance', balance);
}

function setBet(amount) {
    if (gamePhase !== 'IDLE') return;
    if (amount === 'max') {
        betInput.value = Math.floor(balance / 1.05);
    } else {
        betInput.value = amount;
    }
}

function toggleSound() {
    isMuted = !isMuted;
    localStorage.setItem('gs_muted', isMuted);
    updateSoundIcon();
}

function updateSoundIcon() {
    soundBtn.textContent = isMuted ? '🔇' : '🔊';
}

function resetGame() {
    if (confirm("Are you sure you want to reset your progress? Your balance will be reset to $1000 and history will be cleared.")) {
        localStorage.removeItem('gs_balance');
        localStorage.removeItem('gs_history');
        location.reload();
    }
}

function togglePause() {
    if (gamePhase !== 'PICK') return; // Only pause during selection

    if (isPaused) {
        // Resume
        isPaused = false;
        pauseBtn.textContent = '⏸️ Pause';
        startTimer(timerTime, currentPickCallback, currentPickText); // Restart from saved time
    } else {
        // Pause
        isPaused = true;
        pauseBtn.textContent = '▶️ Resume';
        clearInterval(timerInterval);
    }
}

function updateTimer(percentage) {
    timerBar.style.width = `${percentage}%`;
    if (percentage < 30) timerBar.style.background = 'var(--loss-red)';
    else timerBar.style.background = 'linear-gradient(90deg, var(--gold), #ff8a00)';
}

function initGlasses() {
    wrappers.forEach(w => {
        w.style.transition = 'none'; 
        w.style.transform = 'translateY(0)';
        w.style.zIndex = 2;
    });
    wrappers[0].style.left = getSlotLeft(0);
    wrappers[1].style.left = getSlotLeft(1);
    wrappers[2].style.left = getSlotLeft(2);
    
    void wrappers[0].offsetWidth; 
    wrappers.forEach(w => {
        w.style.transition = 'left 0.15s cubic-bezier(0.25, 1, 0.5, 1), transform 0.15s cubic-bezier(0.25, 1, 0.5, 1)';
    });

    slotToGlass = [0, 1, 2]; 
}

function getSlotLeft(slot) {
    const positions = [16.66, 50, 83.33];
    return positions[slot] + '%';
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function startTimer(seconds, onComplete, textPrefix = "") {
    clearInterval(timerInterval);
    timerTime = seconds;
    currentPickCallback = onComplete;
    currentPickText = textPrefix;
    
    updateTimer((timerTime / seconds) * 100);
    if (textPrefix) statusText.textContent = `${textPrefix} (${Math.ceil(timerTime)}s)`;

    timerInterval = setInterval(() => {
        if (isPaused) return; // Don't decrement if paused

        timerTime -= 0.1;
        updateTimer((timerTime / seconds) * 100);
        
        if (textPrefix && timerTime > 0) {
            statusText.textContent = `${textPrefix} (${Math.ceil(timerTime)}s)`;
        }

        if (timerTime <= 0) {
            clearInterval(timerInterval);
            updateTimer(0);
            onComplete();
        }
    }, 100);
}

// --- GAME LOGIC ---
startBtn.addEventListener('click', startRound);
pauseBtn.addEventListener('click', togglePause);
soundBtn.addEventListener('click', toggleSound);
resetBtn.addEventListener('click', resetGame);

function startRound() {
    currentBet = parseFloat(betInput.value);
    
    if (isNaN(currentBet) || currentBet < 10) {
        return showToast('Minimum bet is $10.', 'error');
    }

    fee = currentBet * 0.05; 

    if (currentBet + fee > balance) {
        return showToast('Insufficient funds to cover bet + 5% fee.', 'error');
    }

    // Deduct bet + fee
    balance -= (currentBet + fee);
    updateUI();
    
    startBtn.disabled = true;
    betInput.disabled = true;
    pauseBtn.disabled = true;
    bettingPanel.style.opacity = '0.5';

    initGlasses();
    ballWrapper.classList.remove('reveal');
    glassesContainer.classList.remove('selectable');
    
    ballSlot = Math.floor(Math.random() * 3);
    const coveringGlassIndex = slotToGlass[ballSlot];
    const coveringGlass = wrappers[coveringGlassIndex];

    coveringGlass.style.zIndex = 10;
    coveringGlass.style.transform = 'translateY(-80px)';
    
    ballWrapper.style.left = getSlotLeft(ballSlot);
    
    setTimeout(() => {
        ballWrapper.classList.add('reveal');
        gamePhase = 'REVEAL';
        statusText.style.color = 'var(--gold)';
        
        startTimer(3, async () => {
            ballWrapper.classList.remove('reveal');
            coveringGlass.style.transform = 'translateY(0)';
            
            await sleep(250); 
            coveringGlass.style.zIndex = 2;
            startShuffle();
        }, 'Watch the ball closely');
    }, 100);
}

async function startShuffle() {
    gamePhase = 'SHUFFLE';
    statusText.textContent = 'Shuffling...';
    statusText.style.color = 'white';
    
    const totalSwaps = 15 + Math.floor(Math.random() * 6);
    let lastSwap = null;

    for (let i = 0; i < totalSwaps; i++) {
        // 25% chance for a fake out
        if (Math.random() < 0.25) {
            await performFakeOut();
            continue;
        }

        let slotA, slotB;
        
        do {
            const slots = [0, 1, 2].sort(() => Math.random() - 0.5);
            slotA = slots[0];
            slotB = slots[1];
        } while (lastSwap && lastSwap[0] === slotA && lastSwap[1] === slotB);

        lastSwap = [slotA, slotB];
        
        await performSwap(slotA, slotB);
        playSound('shuffle');
    }
    
    await sleep(100);
    endShuffle();
}

async function performFakeOut() {
    const randomIndex = Math.floor(Math.random() * 3);
    const el = wrappers[randomIndex];
    
    el.style.zIndex = 10;
    el.style.transform = 'translateY(-30px) scale(1.05) rotate(5deg)';
    playSound('shuffle');
    await sleep(150); 
    
    el.style.transform = 'translateY(0) scale(1) rotate(0)';
    await sleep(150); 
    
    el.style.zIndex = 2;
}

async function performSwap(slotA, slotB) {
    const glassAIndex = slotToGlass[slotA];
    const glassBIndex = slotToGlass[slotB];
    const elA = wrappers[glassAIndex];
    const elB = wrappers[glassBIndex];

    slotToGlass[slotA] = glassBIndex;
    slotToGlass[slotB] = glassAIndex;

    if (ballSlot === slotA) ballSlot = slotB;
    else if (ballSlot === slotB) ballSlot = slotA;

    elA.style.zIndex = 10;
    elA.style.transform = 'translateY(-30px) scale(1.05) rotate(5deg)';
    
    elA.style.left = getSlotLeft(slotB);
    elB.style.left = getSlotLeft(slotA);

    await sleep(80); 

    elA.style.transform = 'translateY(0) scale(1) rotate(0)';
    
    await sleep(80); 
    
    elA.style.zIndex = 2;
}

function endShuffle() {
    gamePhase = 'PICK';
    isPaused = false;
    statusText.style.color = 'white';
    glassesContainer.classList.add('selectable');
    pauseBtn.disabled = false; // Enable pause
    pauseBtn.textContent = '⏸️ Pause';

    wrappers.forEach((wrapper, index) => {
        wrapper.onclick = () => handlePick(index);
    });

    startTimer(15, () => {
        if (gamePhase === 'PICK') handlePick(-1);
    }, 'Pick a glass!');
}

async function handlePick(clickedWrapperIndex) {
    if (gamePhase !== 'PICK') return;
    
    gamePhase = 'RESULT';
    isPaused = false;
    clearInterval(timerInterval);
    updateTimer(0);
    pauseBtn.disabled = true;
    glassesContainer.classList.remove('selectable');
    wrappers.forEach(w => w.onclick = null);

    const isWin = (slotToGlass.indexOf(clickedWrapperIndex) === ballSlot);
    
    const winningGlassIndex = slotToGlass[ballSlot];
    const winningGlass = wrappers[winningGlassIndex];
    
    winningGlass.style.zIndex = 10;
    winningGlass.style.transform = 'translateY(-80px)';
    
    ballWrapper.style.left = getSlotLeft(ballSlot);
    
    setTimeout(() => {
        ballWrapper.classList.add('reveal');
    }, 100);

    if (clickedWrapperIndex === -1) {
        statusText.textContent = '⏰ TIME OUT!';
        statusText.style.color = 'var(--loss-red)';
        showToast('You ran out of time!', 'error');
        saveHistory('LOSS', currentBet, fee, 0);
        showResult(false);
    } else if (isWin) {
        playSound('win');
        statusText.textContent = '🎉 YOU WON!';
        statusText.style.color = 'var(--win-green)';
        
        const payout = currentBet * 2;
        balance += payout;
        updateUI();
        
        showToast(`You won $${payout.toFixed(2)}!`, 'success');
        saveHistory('WIN', currentBet, fee, payout);
        showResult(true);
    } else {
        playSound('lose');
        statusText.textContent = '💀 YOU LOST!';
        statusText.style.color = 'var(--loss-red)';
        
        showToast(`You lost $${currentBet.toFixed(2)}.`, 'error');
        saveHistory('LOSS', currentBet, fee, 0);
        showResult(false);
    }
}

function showResult(isWin) {
    setTimeout(() => {
        gamePhase = 'IDLE';
        startBtn.disabled = false;
        betInput.disabled = false;
        bettingPanel.style.opacity = '1';
        statusText.textContent = 'Place your bets';
        statusText.style.color = 'white';
        updateTimer(100);
        
        ballWrapper.classList.remove('reveal');
        initGlasses(); 
    }, 3500);
}

// --- HISTORY SYSTEM ---
function saveHistory(result, bet, fee, payout) {
    const net = result === 'WIN' ? (payout - bet - fee) : (-bet - fee);
    const record = { time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}), result, bet, fee, payout, net };
    history.unshift(record);
    if (history.length > 20) history.pop();
    localStorage.setItem('gs_history', JSON.stringify(history));
    renderHistory();
}

function renderHistory() {
    const list = document.getElementById('history-list');
    const stats = document.getElementById('modal-stats');
    list.innerHTML = '';
    
    let totalWins = 0, totalLosses = 0, totalNet = 0;
    
    if (history.length === 0) list.innerHTML = '<p style="text-align:center; color:var(--text-muted); margin-top:20px;">No games played yet.</p>';
    
    history.forEach(h => {
        if (h.result === 'WIN') totalWins++; else totalLosses++;
        totalNet += h.net;
        
        const div = document.createElement('div');
        div.className = `history-item ${h.result.toLowerCase()}`;
        div.innerHTML = `
            <div>
                <strong style="color: ${h.result === 'WIN' ? 'var(--win-green)' : 'var(--loss-red)'}">${h.result}</strong>
                <div style="font-size: 0.8rem; color: var(--text-muted);">Bet: $${h.bet.toFixed(2)} | Fee: $${h.fee.toFixed(2)}</div>
            </div>
            <div style="text-align: right;">
                <div style="font-weight: bold; color: ${h.net >= 0 ? 'var(--win-green)' : 'var(--loss-red)'}">
                    ${h.net >= 0 ? '+' : ''}$${h.net.toFixed(2)}
                </div>
                <div style="font-size: 0.8rem; color: var(--text-muted);">${h.time}</div>
            </div>
        `;
        list.appendChild(div);
    });

    stats.innerHTML = `
        <div class="stat-box"><div class="val" style="color: var(--win-green)">${totalWins}</div><div class="lbl">Wins</div></div>
        <div class="stat-box"><div class="val" style="color: var(--loss-red)">${totalLosses}</div><div class="lbl">Losses</div></div>
        <div class="stat-box"><div class="val" style="color: ${totalNet >= 0 ? 'var(--win-green)' : 'var(--loss-red)'}">${totalNet >= 0 ? '+' : ''}$${totalNet.toFixed(2)}</div><div class="lbl">Net Profit</div></div>
    `;
}

historyBtn.onclick = () => historyModal.classList.add('active');
closeModal.onclick = () => historyModal.classList.remove('active');
window.onclick = (e) => { if (e.target === historyModal) historyModal.classList.remove('active'); };