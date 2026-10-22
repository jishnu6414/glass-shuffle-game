(() => {
    'use strict';

    const STORAGE_KEY = 'glass_shuffle_sandbox_v2';
    const SOUND_KEY = 'glass_shuffle_sound';
    const PHASES = ['BETTING', 'COVER', 'SHUFFLING', 'PICKING', 'RESULT'];
    const SHUFFLE_MS = 6200;
    const PICK_SECONDS = 15;
    const WIN_MULTIPLIER = 2;
    const DEFAULT_CONFIG = { feeRate: 0.05, minBet: 10, maxBet: 1000 };
    const phaseCopy = {
        BETTING: {
            title: 'Place your bet',
            message: 'Choose your stake, then place it to open a round.',
            board: 'Accepting bets'
        },
        COVER: {
            title: 'Ball covered',
            message: 'The ball is under one cup. Keep your eyes on the table.',
            board: 'Ball covered'
        },
        SHUFFLING: {
            title: 'Cups in motion',
            message: 'The shuffle is underway. The outcome is not revealed on this device.',
            board: 'Shuffling'
        },
        PICKING: {
            title: 'Make your selection',
            message: 'Choose a cup by clicking it or pressing 1, 2, or 3.',
            board: 'Selection open'
        },
        SUBMITTING: {
            title: 'Selection locked',
            message: 'Your selection is with the server. Waiting for settlement.',
            board: 'Submitting'
        },
        RESULT: {
            title: 'Round settled',
            message: 'The authoritative result is now visible.',
            board: 'Settled'
        }
    };

    const dom = {
        body: document.body,
        modeLabel: document.getElementById('mode-label'),
        connectionBanner: document.getElementById('connection-banner'),
        connectionMessage: document.getElementById('connection-message'),
        reconnectButton: document.getElementById('reconnect-button'),
        footerStatus: document.getElementById('footer-status'),
        navLinks: Array.from(document.querySelectorAll('[data-view]')),
        views: Array.from(document.querySelectorAll('[data-view-panel]')),
        adminNav: document.querySelector('.nav-link-admin'),
        authNavButton: document.getElementById('auth-nav-button'),
        soundToggle: document.getElementById('sound-toggle'),
        soundIcon: document.querySelector('.sound-icon'),
        soundLabel: document.querySelector('.sound-label'),
        topBalance: document.getElementById('top-balance-value'),
        phaseTitle: document.getElementById('phase-title'),
        phaseMessage: document.getElementById('phase-message'),
        phaseClockLabel: document.getElementById('phase-clock-label'),
        phaseProgress: document.getElementById('phase-progress'),
        phaseSteps: Array.from(document.querySelectorAll('[data-phase-step]')),
        roundId: document.getElementById('round-id'),
        boardStatus: document.getElementById('board-status'),
        tableSurface: document.getElementById('table-surface'),
        selectionHelp: document.getElementById('selection-help'),
        ball: document.getElementById('ball'),
        cupWraps: [0, 1, 2].map((id) => document.getElementById(`cup-wrap-${id}`)),
        cups: [0, 1, 2].map((id) => document.getElementById(`cup-${id}`)),
        betForm: document.getElementById('bet-form'),
        betInput: document.getElementById('bet-input'),
        quickBets: Array.from(document.querySelectorAll('.quick-bet')),
        betBalance: document.getElementById('bet-balance'),
        minBet: document.getElementById('min-bet'),
        maxBet: document.getElementById('max-bet'),
        feeBadge: document.getElementById('fee-badge'),
        summaryStake: document.getElementById('summary-stake'),
        summaryFee: document.getElementById('summary-fee'),
        summaryTotal: document.getElementById('summary-total'),
        summaryPayout: document.getElementById('summary-payout'),
        summaryProfit: document.getElementById('summary-profit'),
        betValidation: document.getElementById('bet-validation'),
        startRoundButton: document.getElementById('start-round-button'),
        betAuthNote: document.getElementById('bet-auth-note'),
        historyList: document.getElementById('history-list'),
        historyRounds: document.getElementById('history-rounds'),
        historyWinRate: document.getElementById('history-win-rate'),
        historyStaked: document.getElementById('history-staked'),
        historyNet: document.getElementById('history-net'),
        historyFilters: Array.from(document.querySelectorAll('[data-history-filter]')),
        refreshHistoryButton: document.getElementById('refresh-history-button'),
        betsList: document.getElementById('bets-list'),
        refreshBetsButton: document.getElementById('refresh-bets-button'),
        walletBalance: document.getElementById('wallet-balance-value'),
        walletReserved: document.getElementById('wallet-reserved-value'),
        walletFee: document.getElementById('wallet-fee-value'),
        walletModeNote: document.getElementById('wallet-mode-note'),
        transactionsList: document.getElementById('transactions-list'),
        refreshWalletButton: document.getElementById('refresh-wallet-button'),
        sandboxTools: document.getElementById('sandbox-tools'),
        sandboxFundsForm: document.getElementById('sandbox-funds-form'),
        sandboxFundsInput: document.getElementById('sandbox-funds-input'),
        resetSandboxButton: document.getElementById('reset-sandbox-button'),
        signedOutPanel: document.getElementById('signed-out-panel'),
        signedInPanel: document.getElementById('signed-in-panel'),
        authTabs: Array.from(document.querySelectorAll('[data-auth-mode]')),
        authHeading: document.getElementById('auth-form-heading'),
        authCopy: document.getElementById('auth-form-copy'),
        loginForm: document.getElementById('login-form'),
        registerForm: document.getElementById('register-form'),
        loginError: document.getElementById('login-error'),
        registerError: document.getElementById('register-error'),
        profileForm: document.getElementById('profile-form'),
        profileAvatar: document.getElementById('profile-avatar'),
        profileName: document.getElementById('profile-name'),
        profileEmail: document.getElementById('profile-email'),
        profileDisplayName: document.getElementById('profile-display-name'),
        profileEmailInput: document.getElementById('profile-email-input'),
        profileRole: document.getElementById('profile-role'),
        profileError: document.getElementById('profile-error'),
        logoutButton: document.getElementById('logout-button'),
        refreshAdminButton: document.getElementById('refresh-admin-button'),
        adminState: document.getElementById('admin-state'),
        adminContent: document.getElementById('admin-content'),
        adminRounds: document.getElementById('admin-rounds'),
        adminPlayers: document.getElementById('admin-players'),
        adminVolume: document.getElementById('admin-volume'),
        adminRevenue: document.getElementById('admin-revenue'),
        adminConfigForm: document.getElementById('admin-config-form'),
        configFee: document.getElementById('config-fee'),
        configMin: document.getElementById('config-min'),
        configMax: document.getElementById('config-max'),
        adminError: document.getElementById('admin-error'),
        toastRegion: document.getElementById('toast-region'),
        announcer: document.getElementById('announcer')
    };

    const runtimeConfig = window.GLASS_SHUFFLE_CONFIG && typeof window.GLASS_SHUFFLE_CONFIG === 'object'
        ? window.GLASS_SHUFFLE_CONFIG
        : {};
    let api;

    const saved = readJson(STORAGE_KEY, {});
    const state = {
        view: 'game',
        mode: 'checking',
        serverOnline: false,
        connectionMessage: 'Checking for the game server…',
        user: normalizeUser(saved.user),
        balance: finiteOr(saved.balance, 1000),
        config: {
            feeRate: finiteOr(saved.feeRate, DEFAULT_CONFIG.feeRate),
            minBet: finiteOr(saved.minBet, DEFAULT_CONFIG.minBet),
            maxBet: finiteOr(saved.maxBet, DEFAULT_CONFIG.maxBet)
        },
        betAmount: finiteOr(saved.betAmount, 100),
        phase: 'BETTING',
        phaseTimer: null,
        history: Array.isArray(saved.history) ? saved.history.map(normalizeHistoryRecord).filter(Boolean) : [],
        bets: Array.isArray(saved.bets) ? saved.bets.map(normalizeBetRecord).filter(Boolean) : [],
        transactions: Array.isArray(saved.transactions) ? saved.transactions.map(normalizeTransaction).filter(Boolean) : [],
        historyFilter: 'all',
        loading: { history: false, bets: false, transactions: false, profile: false, admin: false },
        errors: { history: '', bets: '', transactions: '', profile: '' },
        round: null,
        slotToCup: [0, 1, 2],
        ballVisible: false,
        ballSlot: null,
        selectedSlot: null,
        roundBusy: false,
        muted: readStorage(SOUND_KEY) === 'true',
        reducedMotion: Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches),
        authMode: 'login',
        admin: { allowed: false, stats: null, config: null, error: '' }
    };

    const timeoutIds = new Set();
    const intervalIds = new Set();
    const toastTimeouts = new Set();
    let roundToken = 0;
    let pollPromise = null;
    let audioContext = null;

    function readStorage(key) {
        try {
            return window.localStorage.getItem(key) || '';
        } catch (error) {
            return '';
        }
    }

    function writeStorage(key, value) {
        try {
            window.localStorage.setItem(key, value);
        } catch (error) {
            // Storage can be disabled in private browsing; the app remains usable in memory.
        }
    }

    function readJson(key, fallback) {
        try {
            const raw = window.localStorage.getItem(key);
            return raw ? JSON.parse(raw) : fallback;
        } catch (error) {
            return fallback;
        }
    }

    function persistSandbox() {
        if (state.mode === 'live') return;
        writeStorage(STORAGE_KEY, JSON.stringify({
            user: state.user,
            balance: state.balance,
            feeRate: state.config.feeRate,
            minBet: state.config.minBet,
            maxBet: state.config.maxBet,
            betAmount: state.betAmount,
            history: state.history.slice(0, 100),
            bets: state.bets.slice(0, 100),
            transactions: state.transactions.slice(0, 100)
        }));
    }

    function finiteOr(value, fallback) {
        const number = Number(value);
        return Number.isFinite(number) ? number : fallback;
    }

    function safeText(value, fallback = '') {
        if (value === null || value === undefined) return fallback;
        if (typeof value === 'string') return value.trim() || fallback;
        if (typeof value === 'number' || typeof value === 'boolean') return String(value);
        return fallback;
    }

    function currency(value, withSign = false) {
        const amount = finiteOr(value, 0);
        const sign = withSign && amount > 0 ? '+' : '';
        return `${sign}${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)}`;
    }

    function compactDate(value) {
        const date = value ? new Date(value) : new Date();
        if (Number.isNaN(date.getTime())) return '—';
        return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date);
    }

    function initials(name) {
        const parts = safeText(name, 'Glass Shuffle').split(/\s+/).filter(Boolean).slice(0, 2);
        return parts.map((part) => part.charAt(0).toUpperCase()).join('') || 'GS';
    }

    function getObject(payload) {
        if (!payload || typeof payload !== 'object') return {};
        if (payload.data && typeof payload.data === 'object') return payload.data;
        if (payload.result && typeof payload.result === 'object' && !Array.isArray(payload.result)) return payload.result;
        return payload;
    }

    function getArray(payload, keys = []) {
        const object = getObject(payload);
        if (Array.isArray(payload)) return payload;
        for (const key of keys) {
            if (Array.isArray(object[key])) return object[key];
        }
        return [];
    }

    function valueAt(object, keys, fallback = undefined) {
        if (!object || typeof object !== 'object') return fallback;
        for (const key of keys) {
            if (object[key] !== undefined && object[key] !== null) return object[key];
        }
        return fallback;
    }

    function normalizeUser(payload) {
        if (!payload || typeof payload !== 'object') return null;
        const object = getObject(payload);
        if (object.authenticated === false || object.user === null) return null;
        const raw = object.user || object.account || object.profile || object;
        if (!raw || typeof raw !== 'object') return null;
        const hasIdentity = ['id', 'userId', 'accountId', 'email', 'emailAddress', 'name', 'displayName', 'username', 'handle', 'role', 'isAdmin']
            .some((key) => raw[key] !== undefined && raw[key] !== null);
        if (!hasIdentity) return null;
        const email = safeText(valueAt(raw, ['email', 'emailAddress']));
        const name = safeText(valueAt(raw, ['name', 'displayName', 'username', 'handle']), email ? email.split('@')[0] : 'Player');
        const role = safeText(valueAt(raw, ['role', 'access', 'permission']), 'player').toLowerCase();
        const id = safeText(valueAt(raw, ['id', 'userId', 'accountId']), email || name);
        if (!email && !id && !name) return null;
        return { id, name, email, role, isAdmin: Boolean(raw.isAdmin || ['admin', 'operator', 'owner'].includes(role)) };
    }

    function normalizePhase(value) {
        const phase = safeText(value).toUpperCase().replace(/[-\s]+/g, '_');
        if (phase.includes('BET')) return 'BETTING';
        if (phase.includes('COVER') || phase.includes('REVEAL_START')) return 'COVER';
        if (phase.includes('SHUFF')) return 'SHUFFLING';
        if (phase.includes('PICK') || phase.includes('SELECT')) return 'PICKING';
        if (phase.includes('RESULT') || phase.includes('SETT') || phase.includes('COMPLETE') || phase.includes('FINISH')) return 'RESULT';
        return PHASES.includes(phase) ? phase : '';
    }

    function normalizeIndex(value, oneBased = false) {
        const number = Number(value);
        if (!Number.isFinite(number)) return null;
        const index = oneBased ? number - 1 : number;
        return index >= 0 && index <= 2 ? Math.round(index) : null;
    }

    function moneyMajor(object, majorKeys, minorKeys, fallback = 0) {
        const major = valueAt(object, majorKeys);
        if (major !== undefined && major !== null && Number.isFinite(Number(major))) return Number(major);
        const minor = valueAt(object, minorKeys);
        if (minor !== undefined && minor !== null && Number.isFinite(Number(minor))) return Number(minor) / 100;
        return fallback;
    }

    function normalizeRound(payload) {
        const object = getObject(payload);
        const raw = object.round || object.game || object;
        if (!raw || typeof raw !== 'object') return {};
        const result = raw.result && typeof raw.result === 'object' ? raw.result : {};
        const winningSlot = normalizeIndex(valueAt(raw, ['winningSlot', 'winnerSlot', 'resultSlot', 'winningGlass'], valueAt(result, ['winningSlot', 'winnerSlot', 'winningGlass'])))
            ?? normalizeIndex(valueAt(raw, ['winningCup', 'winnerCup'], valueAt(result, ['winningCup', 'winnerCup'])), true);
        const selectedSlot = normalizeIndex(valueAt(raw, ['selectedSlot', 'selectionSlot', 'selectedGlass'], valueAt(result, ['selectedSlot', 'selectedGlass'])))
            ?? normalizeIndex(valueAt(raw, ['selectedCup', 'selection', 'cup'], valueAt(result, ['selectedCup', 'selection'])), true);
        const phase = normalizePhase(valueAt(raw, ['phase', 'status', 'state']));
        const id = safeText(valueAt(raw, ['id', 'roundId', 'gameId']));
        const statusText = safeText(valueAt(raw, ['message', 'statusMessage']));
        const rawWon = valueAt(raw, ['won', 'isWin'], valueAt(result, ['won', 'isWin']));
        const outcome = safeText(valueAt(raw, ['outcome', 'resultStatus'], valueAt(result, ['outcome', 'status']))).toUpperCase();
        const hasResult = winningSlot !== null || rawWon !== undefined || ['WIN', 'LOSS', 'WON', 'LOST'].includes(outcome) || phase === 'RESULT';
        return {
            id,
            betId: safeText(valueAt(raw, ['betId', 'wagerId', 'bet_id'])),
            phase,
            amount: moneyMajor(raw, ['amount', 'stake', 'betAmount'], ['betMinor']),
            fee: moneyMajor(raw, ['fee', 'houseFee'], ['feeMinor']),
            total: moneyMajor(raw, ['total', 'totalAtRisk'], ['totalDebitedMinor']),
            selectedSlot,
            winningSlot,
            won: rawWon === undefined ? (outcome === 'WIN' || outcome === 'WON' ? true : outcome === 'LOSS' || outcome === 'LOST' ? false : null) : Boolean(rawWon),
            payout: moneyMajor(raw, ['payout', 'grossPayout', 'return'], ['payoutMinor'], moneyMajor(result, ['payout', 'grossPayout'], ['payoutMinor'])),
            net: moneyMajor(raw, ['net', 'netProfit'], ['netMinor'], moneyMajor(result, ['net', 'netProfit'], ['netMinor'])),
            balance: valueAt(raw, ['balance', 'availableBalance'], valueAt(result, ['balance'])) !== undefined
                ? finiteOr(valueAt(raw, ['balance', 'availableBalance'], valueAt(result, ['balance'])), 0)
                : (valueAt(raw, ['balanceMinor'], valueAt(result, ['balanceMinor'])) !== undefined ? finiteOr(valueAt(raw, ['balanceMinor'], valueAt(result, ['balanceMinor'])), 0) / 100 : undefined),
            expiresAt: valueAt(raw, ['expiresAt', 'selectionExpiresAt', 'deadline']),
            message: statusText,
            hasResult,
            raw
        };
    }

    function normalizeHistoryRecord(raw) {
        if (!raw || typeof raw !== 'object') return null;
        const object = raw.record && typeof raw.record === 'object' ? raw.record : raw;
        const result = safeText(valueAt(object, ['result', 'outcome', 'status']), 'PENDING').toUpperCase();
        const won = result === 'WIN' || result === 'WON' || object.won === true || object.isWin === true;
        const amount = moneyMajor(object, ['amount', 'stake', 'bet', 'betAmount'], ['betMinor']);
        const fee = moneyMajor(object, ['fee', 'houseFee'], ['feeMinor'], amount * DEFAULT_CONFIG.feeRate);
        const payout = moneyMajor(object, ['payout', 'grossPayout', 'return'], ['payoutMinor'], won ? amount * WIN_MULTIPLIER : 0);
        const net = valueAt(object, ['net', 'netProfit']) === undefined
            ? (won ? payout - amount - fee : -amount - fee)
            : finiteOr(valueAt(object, ['net', 'netProfit']), 0);
        return {
            id: safeText(valueAt(object, ['id', 'roundId', 'betId']), `record-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`),
            roundId: safeText(valueAt(object, ['roundId', 'gameId'])),
            result: won ? 'WIN' : result === 'PENDING' ? 'PENDING' : 'LOSS',
            amount,
            fee,
            payout,
            net,
            selectedSlot: normalizeIndex(valueAt(object, ['selectedSlot', 'selectionSlot', 'selectedGlass'])) ?? normalizeIndex(valueAt(object, ['selectedCup', 'selection']), true),
            winningSlot: normalizeIndex(valueAt(object, ['winningSlot', 'winnerSlot', 'winningGlass'])) ?? normalizeIndex(valueAt(object, ['winningCup', 'winnerCup']), true),
            createdAt: valueAt(object, ['createdAt', 'created', 'timestamp', 'time']) || new Date().toISOString()
        };
    }

    function normalizeBetRecord(raw) {
        const record = normalizeHistoryRecord(raw);
        if (!record) return null;
        return {
            ...record,
            status: safeText(valueAt(raw, ['status', 'state']), record.result === 'PENDING' ? 'OPEN' : 'SETTLED').toUpperCase()
        };
    }

    function normalizeTransaction(raw) {
        if (!raw || typeof raw !== 'object') return null;
        const object = raw.transaction && typeof raw.transaction === 'object' ? raw.transaction : raw;
        const amount = moneyMajor(object, ['amount', 'value', 'delta'], ['amountMinor']);
        return {
            id: safeText(valueAt(object, ['id', 'transactionId']), `txn-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`),
            type: safeText(valueAt(object, ['type', 'kind']), 'Adjustment').replace(/[_-]+/g, ' '),
            description: safeText(valueAt(object, ['description', 'memo', 'note']), ''),
            amount,
            balance: valueAt(object, ['balance', 'runningBalance']) !== undefined
                ? finiteOr(valueAt(object, ['balance', 'runningBalance']), 0)
                : valueAt(object, ['balanceAfterMinor']) === undefined ? null : finiteOr(valueAt(object, ['balanceAfterMinor']), 0) / 100,
            createdAt: valueAt(object, ['createdAt', 'timestamp', 'time']) || new Date().toISOString()
        };
    }

    function normalizeAdmin(payload) {
        const object = getObject(payload);
        const stats = object.stats || object.metrics || object;
        const config = object.config || object.settings || object;
        return {
            stats: {
                rounds: finiteOr(valueAt(stats, ['roundsToday', 'todayRounds', 'rounds', 'totalRounds']), 0),
                players: finiteOr(valueAt(stats, ['activePlayers', 'players', 'users']), 0),
                volume: moneyMajor(stats, ['volumeToday', 'volume', 'handle'], ['totalBetMinor']),
                revenue: moneyMajor(stats, ['houseRevenue', 'revenue', 'fees'], ['totalFeeMinor'])
            },
            config: {
                feeRate: valueAt(config, ['feeRate', 'houseFeeRate']) !== undefined
                    ? finiteOr(valueAt(config, ['feeRate', 'houseFeeRate']), state.config.feeRate)
                    : finiteOr(valueAt(config, ['feeBps']), state.config.feeRate * 10000) / 10000,
                minBet: moneyMajor(config, ['minBet', 'minimumBet'], ['minBetMinor'], state.config.minBet),
                maxBet: moneyMajor(config, ['maxBet', 'maximumBet'], ['maxBetMinor'], state.config.maxBet)
            }
        };
    }

    function readBalance(payload) {
        const object = getObject(payload);
        const wallet = object.wallet && typeof object.wallet === 'object' ? object.wallet : object;
        const major = valueAt(wallet, ['balance', 'availableBalance', 'available', 'currentBalance']);
        if (major !== undefined && Number.isFinite(Number(major))) return Number(major);
        return finiteOr(valueAt(wallet, ['balanceMinor', 'availableBalanceMinor']), NaN) / 100;
    }

    class ApiError extends Error {
        constructor(message, details = {}) {
            super(message);
            this.name = 'ApiError';
            this.status = details.status || 0;
            this.network = Boolean(details.network);
            this.payload = details.payload;
        }
    }

    class ApiClient {
        constructor(baseUrl, explicitBase) {
            this.baseUrl = String(baseUrl || '/api').replace(/\/$/, '');
            this.explicitBase = explicitBase;
            this.timeoutMs = 10000;
        }

        url(path) {
            if (/^https?:\/\//i.test(path)) return path;
            return `${this.baseUrl}/${String(path).replace(/^\/+/, '')}`;
        }

        async request(path, options = {}) {
            if (window.location.protocol === 'file:' && !this.explicitBase && !/^https?:\/\//i.test(this.baseUrl)) {
                throw new ApiError('The API is not available from a local file.', { network: true });
            }
            const controller = new AbortController();
            const timeoutId = window.setTimeout(() => controller.abort(), this.timeoutMs);
            const headers = new Headers(options.headers || {});
            headers.set('Accept', 'application/json');
            if (options.body !== undefined && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
            const token = readStorage('glass_shuffle_session');
            if (token && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`);
            let response;
            try {
                response = await window.fetch(this.url(path), {
                    ...options,
                    headers,
                    credentials: 'include',
                    signal: controller.signal
                });
            } catch (error) {
                throw new ApiError(error.name === 'AbortError' ? 'The API request timed out.' : 'The game server could not be reached.', { network: true });
            } finally {
                window.clearTimeout(timeoutId);
            }
            const contentType = response.headers.get('content-type') || '';
            let payload = null;
            try {
                payload = contentType.includes('json') ? await response.json() : await response.text();
            } catch (error) {
                payload = null;
            }
            if (!response.ok) {
                const nestedError = payload && typeof payload === 'object' && payload.error && typeof payload.error === 'object' ? payload.error : null;
                const message = safeText(payload && typeof payload === 'object'
                    ? valueAt(payload, ['message', 'detail'], nestedError && valueAt(nestedError, ['message', 'detail']))
                    : payload, `Request failed (${response.status})`);
                throw new ApiError(message, { status: response.status, payload });
            }
            return payload;
        }

        async first(paths, options = {}) {
            let lastError = null;
            for (const path of paths) {
                try {
                    return await this.request(path, options);
                } catch (error) {
                    lastError = error;
                    if (!(error instanceof ApiError) || (error.status !== 404 && error.status !== 405)) throw error;
                }
            }
            throw lastError || new ApiError('No API endpoint was available.');
        }

        getSession() { return this.first(['auth/me', 'session', 'auth/session', 'me']); }
        getConfig() { return this.first(['game/config', 'config']); }
        login(body) { return this.first(['auth/login', 'login'], { method: 'POST', body: JSON.stringify(body) }); }
        register(body) { return this.first(['auth/register', 'register'], { method: 'POST', body: JSON.stringify(body) }); }
        logout() { return this.first(['auth/logout', 'logout'], { method: 'POST', body: JSON.stringify({}) }); }
        getBalance() { return this.first(['wallet/balance', 'balance', 'wallet']); }
        getHistory() { return this.first(['history', 'rounds/history', 'games/history']); }
        async getBets() {
            try {
                return await this.first(['bets', 'wagers']);
            } catch (error) {
                if (error instanceof ApiError && (error.status === 404 || error.status === 405)) return this.getHistory();
                throw error;
            }
        }
        getTransactions() { return this.first(['wallet/transactions', 'transactions']); }
        getProfile() { return this.first(['profile', 'account/profile', 'me']); }
        placeBet(body) {
            const amountMinor = Number.isFinite(Number(body.amountMinor)) ? Math.round(Number(body.amountMinor)) : Math.round(Number(body.amount) * 100);
            const idempotencyKey = body.idempotencyKey || `gs-bet-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
            return this.first(['bets', 'bet'], {
                method: 'POST',
                headers: { 'Idempotency-Key': idempotencyKey },
                body: JSON.stringify({ amountMinor })
            });
        }
        async startRound(body, fallbackRound) {
            try {
                return await this.first(['rounds/start', 'round/start', 'games/start'], { method: 'POST', body: JSON.stringify(body) });
            } catch (error) {
                if (fallbackRound && error instanceof ApiError && (error.status === 404 || error.status === 405)) return { round: fallbackRound };
                throw error;
            }
        }
        advanceRound(id, body = {}) { return this.first([`rounds/${encodeURIComponent(id)}/advance`, `round/${encodeURIComponent(id)}/advance`], { method: 'POST', body: JSON.stringify(body) }); }
        getRound(id) { return this.first([`rounds/${encodeURIComponent(id)}`, `round/${encodeURIComponent(id)}`, `games/${encodeURIComponent(id)}`]); }
        submitSelection(id, body) {
            const selectedGlass = body.selectedGlass !== undefined ? body.selectedGlass : body.slot;
            const idempotencyKey = body.idempotencyKey || `gs-settle-${id}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
            return this.first([
                `rounds/${encodeURIComponent(id)}/selection`,
                `round/${encodeURIComponent(id)}/select`,
                `games/${encodeURIComponent(id)}/selection`,
                `bets/${encodeURIComponent(id)}/settle`
            ], {
                method: 'POST',
                headers: { 'Idempotency-Key': idempotencyKey },
                body: JSON.stringify({ selectedGlass: selectedGlass === null || selectedGlass === undefined ? null : Number(selectedGlass) })
            });
        }
        updateProfile(body) { return this.first(['profile', 'account/profile'], { method: 'PUT', body: JSON.stringify(body) }); }
        getAdminStats() { return this.first(['admin/stats', 'admin/metrics']); }
        getAdminConfig() { return this.first(['admin/config', 'admin/settings']); }
        updateAdminConfig(body) { return this.first(['admin/config', 'admin/settings'], { method: 'PATCH', body: JSON.stringify(body) }); }
    }

    api = new ApiClient(
        runtimeConfig.apiBase || document.querySelector('meta[name="api-base"]')?.content || '/api',
        Boolean(runtimeConfig.apiBase || document.querySelector('meta[name="api-base"]'))
    );

    function setText(element, value) {
        if (element) element.textContent = safeText(value);
    }

    function makeElement(tag, className, text) {
        const element = document.createElement(tag);
        if (className) element.className = className;
        if (text !== undefined) element.textContent = safeText(text);
        return element;
    }

    function clearElement(element) {
        while (element && element.firstChild) element.removeChild(element.firstChild);
    }

    function showFieldError(element, message) {
        if (!element) return;
        setText(element, message);
        element.hidden = !message;
    }

    function renderStateBlock(container, title, message, type = 'empty') {
        if (!container) return;
        clearElement(container);
        const block = makeElement('div', `state-block${type === 'error' ? ' is-error' : ''}`);
        const wrapper = makeElement('div');
        wrapper.appendChild(makeElement('strong', '', title));
        wrapper.appendChild(makeElement('p', '', message));
        block.appendChild(wrapper);
        container.appendChild(block);
    }

    function setBusy(button, busy, busyLabel, idleLabel) {
        if (!button) return;
        button.disabled = busy;
        setText(button, busy ? busyLabel : idleLabel);
    }

    function schedule(callback, delay) {
        const id = window.setTimeout(() => {
            timeoutIds.delete(id);
            callback();
        }, delay);
        timeoutIds.add(id);
        return id;
    }

    function scheduleInterval(callback, delay) {
        const id = window.setInterval(callback, delay);
        intervalIds.add(id);
        return id;
    }

    function clearTimer(id) {
        if (id === null || id === undefined) return;
        window.clearTimeout(id);
        window.clearInterval(id);
        timeoutIds.delete(id);
        intervalIds.delete(id);
    }

    function clearRoundTimers() {
        if (state.phaseTimer) {
            clearTimer(state.phaseTimer);
            state.phaseTimer = null;
        }
        for (const id of Array.from(intervalIds)) {
            window.clearInterval(id);
            intervalIds.delete(id);
        }
        for (const id of Array.from(timeoutIds)) {
            window.clearTimeout(id);
            timeoutIds.delete(id);
        }
        pollPromise = null;
    }

    function wait(ms, token) {
        if (ms <= 0) return Promise.resolve(token === roundToken);
        return new Promise((resolve) => {
            const id = window.setTimeout(() => {
                timeoutIds.delete(id);
                resolve(token === roundToken);
            }, ms);
            timeoutIds.add(id);
        });
    }

    function setMode(mode, message) {
        state.mode = mode;
        state.serverOnline = mode === 'live';
        state.connectionMessage = message;
        renderConnection();
        renderAuth();
        renderBetPanel();
        renderWallet();
    }

    function renderConnection() {
        const modeText = state.mode === 'live' ? 'Live API' : state.mode === 'sandbox' ? 'Sandbox demo' : 'Connecting';
        setText(dom.modeLabel, modeText);
        setText(dom.footerStatus, state.mode === 'live' ? 'Live account data is served by the game API.' : state.mode === 'sandbox' ? 'Sandbox data stays in this browser.' : 'Checking for a live game API.');
        if (dom.connectionBanner) {
            const visible = state.mode !== 'live' || Boolean(state.connectionMessage && state.connectionMessage !== '');
            dom.connectionBanner.hidden = !visible;
            dom.connectionBanner.classList.toggle('is-live', state.mode === 'live');
            dom.connectionBanner.classList.toggle('is-error', state.mode === 'sandbox' && state.connectionMessage.includes('unavailable'));
            setText(dom.connectionMessage, state.connectionMessage);
            if (dom.reconnectButton) dom.reconnectButton.hidden = state.mode === 'checking';
        }
    }

    function renderView() {
        dom.views.forEach((view) => {
            const active = view.dataset.viewPanel === state.view;
            view.hidden = !active;
            view.classList.toggle('is-active', active);
        });
        dom.navLinks.forEach((link) => {
            if (!link.dataset.view) return;
            link.classList.toggle('is-active', link.dataset.view === state.view);
        });
        if (state.view === 'admin' && !state.admin.allowed) {
            state.view = 'profile';
            renderView();
        }
    }

    function setView(view) {
        const allowed = ['game', 'history', 'bets', 'wallet', 'profile', 'admin'];
        if (!allowed.includes(view)) return;
        if (view === 'admin' && !state.admin.allowed) {
            showToast('Admin access is not available for this account.', 'error');
            view = 'profile';
        }
        state.view = view;
        renderView();
        if (view === 'admin' && state.mode === 'live' && !state.admin.stats) loadAdmin();
        if (view === 'history' && state.mode === 'live' && !state.history.length) refreshAccount();
        if (view === 'wallet' && state.mode === 'live' && !state.transactions.length) refreshAccount();
        window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: state.reducedMotion ? 'auto' : 'smooth' }));
    }

    function renderAuthNav() {
        setText(dom.authNavButton, state.user ? safeText(state.user.name, 'Account') : 'Sign in');
        if (dom.adminNav) dom.adminNav.hidden = !state.admin.allowed;
    }

    function renderSound() {
        dom.soundToggle.setAttribute('aria-pressed', String(!state.muted));
        dom.soundIcon.classList.toggle('is-off', state.muted);
        setText(dom.soundLabel, state.muted ? 'Sound off' : 'Sound on');
    }

    function renderBalances() {
        const availableMax = Math.max(0, Math.min(state.config.maxBet, state.balance / (1 + state.config.feeRate)));
        setText(dom.topBalance, currency(state.balance));
        setText(dom.betBalance, currency(state.balance));
        setText(dom.minBet, currency(state.config.minBet).replace('.00', ''));
        setText(dom.maxBet, currency(availableMax).replace('.00', ''));
        setText(dom.walletBalance, currency(state.balance));
        const reserved = state.round && state.round.amount && state.phase !== 'BETTING' && state.phase !== 'RESULT'
            ? state.round.total || state.round.amount + state.round.fee
            : 0;
        setText(dom.walletReserved, currency(reserved));
        setText(dom.walletFee, `${(state.config.feeRate * 100).toFixed(2)}%`);
        setText(dom.walletModeNote, state.mode === 'live' ? 'Live server balance' : 'Local sandbox balance');
    }

    function currentBetValues() {
        const amount = finiteOr(dom.betInput && dom.betInput.value, state.betAmount);
        const fee = amount * state.config.feeRate;
        const total = amount + fee;
        const payout = amount * WIN_MULTIPLIER;
        return { amount, fee, total, payout, profit: payout - total };
    }

    function validateBet(amount = currentBetValues().amount) {
        if (state.mode === 'checking') return 'Still checking for a game server.';
        if (state.roundBusy || state.phase !== 'BETTING') return 'Finish the current round before placing another bet.';
        if (!Number.isFinite(amount) || amount <= 0) return 'Enter a valid stake amount.';
        if (amount < state.config.minBet) return `Minimum stake is ${currency(state.config.minBet)}.`;
        if (amount > state.config.maxBet) return `Maximum stake is ${currency(state.config.maxBet)}.`;
        if (amount * (1 + state.config.feeRate) > state.balance + 0.000001) return 'Your balance does not cover the stake and house fee.';
        if (state.mode === 'live' && !state.user) return 'Sign in to place a live bet.';
        return '';
    }

    function renderBetPanel() {
        const values = currentBetValues();
        const validation = validateBet(values.amount);
        state.betAmount = Number.isFinite(values.amount) ? values.amount : state.betAmount;
        setText(dom.summaryStake, currency(values.amount));
        setText(dom.summaryFee, currency(values.fee));
        setText(dom.summaryTotal, currency(values.total));
        setText(dom.summaryPayout, currency(values.payout));
        setText(dom.summaryProfit, currency(values.profit, true));
        dom.summaryProfit.classList.toggle('is-negative', values.profit < 0);
        dom.betInput.disabled = state.roundBusy || state.phase !== 'BETTING';
        dom.quickBets.forEach((button) => {
            const quickValue = button.dataset.amount === 'max' ? Math.floor(Math.min(state.config.maxBet, state.balance / (1 + state.config.feeRate))) : Number(button.dataset.amount);
            button.classList.toggle('is-active', Number.isFinite(values.amount) && Math.abs(values.amount - quickValue) < 0.001);
            button.disabled = dom.betInput.disabled;
        });
        dom.betValidation.hidden = !validation;
        setText(dom.betValidation, validation);
        dom.startRoundButton.disabled = Boolean(validation) || state.roundBusy || state.phase !== 'BETTING';
        if (state.roundBusy) setText(dom.startRoundButton, 'Round in progress…');
        else if (state.phase !== 'BETTING') setText(dom.startRoundButton, 'Round in progress');
        else setText(dom.startRoundButton, state.mode === 'live' && !state.user ? 'Sign in to play live' : 'Place bet & start round');
        setText(dom.feeBadge, `${(state.config.feeRate * 100).toFixed(2).replace('.00', '')}% fee`);
        setText(dom.betAuthNote, state.mode === 'live'
            ? (state.user ? 'Live rounds are settled by the game server.' : 'Sign in to sync your live wallet, bets, and history.')
            : 'Sandbox demo is active while the game server is unavailable. Results are simulated locally.');
    }

    function renderPhase() {
        const copy = phaseCopy[state.phase] || phaseCopy.BETTING;
        setText(dom.phaseTitle, copy.title);
        setText(dom.phaseMessage, copy.message);
        setText(dom.boardStatus, copy.board);
        dom.phaseSteps.forEach((step) => {
            const phase = step.dataset.phaseStep;
            const current = phase === state.phase;
            const currentIndex = PHASES.indexOf(state.phase === 'SUBMITTING' ? 'PICKING' : state.phase);
            const stepIndex = PHASES.indexOf(phase);
            step.classList.toggle('is-current', current || (state.phase === 'SUBMITTING' && phase === 'PICKING'));
            step.classList.toggle('is-complete', stepIndex >= 0 && stepIndex < currentIndex);
        });
        if (!state.phaseTimer) {
            setText(dom.phaseClockLabel, state.phase === 'BETTING' ? 'Waiting' : state.phase === 'RESULT' ? 'Settled' : 'In progress');
            dom.phaseProgress.style.transform = state.phase === 'BETTING' || state.phase === 'RESULT' ? 'scaleX(1)' : 'scaleX(0.18)';
        }
        if (state.round) setText(dom.roundId, state.round.id || 'Live');
        else setText(dom.roundId, 'Ready');
        setText(dom.selectionHelp, state.phase === 'PICKING'
            ? 'Selection is open. Choose a cup before the timer runs out.'
            : state.phase === 'RESULT'
                ? (state.round && state.round.won ? 'The server confirmed a winning selection.' : 'The server confirmed the settled result.')
                : 'Place a bet to activate the table.');
    }

    function renderBoard() {
        dom.tableSurface.classList.toggle('is-selectable', state.phase === 'PICKING');
        const positionPercent = ['16.66%', '50%', '83.33%'];
        state.slotToCup.forEach((cupId, slot) => {
            const wrapper = dom.cupWraps[cupId];
            if (wrapper) wrapper.style.left = positionPercent[slot];
        });
        dom.cups.forEach((cup, cupId) => {
            const slot = state.slotToCup.indexOf(cupId);
            const label = `Cup ${slot + 1}`;
            cup.disabled = state.phase !== 'PICKING';
            cup.setAttribute('aria-label', state.phase === 'PICKING' ? `Select ${label}` : label);
            cup.setAttribute('aria-pressed', String(state.selectedSlot === slot));
            const wrapper = dom.cupWraps[cupId];
            if (wrapper) {
                wrapper.classList.toggle('is-winner', state.phase === 'RESULT' && state.round && state.round.winningSlot === slot);
                wrapper.classList.toggle('is-loser', state.phase === 'RESULT' && state.round && state.round.winningSlot !== null && state.round.winningSlot !== slot);
            }
        });
        const ballSlot = state.ballSlot === null ? 1 : state.ballSlot;
        dom.ball.style.left = positionPercent[ballSlot];
        dom.ball.classList.toggle('is-visible', state.ballVisible);
        dom.ball.classList.toggle('is-result', state.phase === 'RESULT');
    }

    function renderHistory() {
        const records = state.history.filter((record) => state.historyFilter === 'all' || record.result.toLowerCase() === state.historyFilter);
        const settled = state.history.filter((record) => record.result !== 'PENDING');
        const wins = settled.filter((record) => record.result === 'WIN').length;
        const staked = settled.reduce((sum, record) => sum + record.amount, 0);
        const net = settled.reduce((sum, record) => sum + record.net, 0);
        setText(dom.historyRounds, settled.length);
        setText(dom.historyWinRate, `${settled.length ? Math.round((wins / settled.length) * 100) : 0}%`);
        setText(dom.historyStaked, currency(staked));
        setText(dom.historyNet, currency(net, true));
        dom.historyNet.classList.toggle('is-positive', net >= 0);
        if (state.loading.history) return renderStateBlock(dom.historyList, 'Loading history', 'Fetching your settled rounds from the game server.', 'loading');
        if (state.errors.history) return renderStateBlock(dom.historyList, 'History unavailable', state.errors.history, 'error');
        if (!records.length) return renderStateBlock(dom.historyList, 'No rounds yet', state.mode === 'sandbox' ? 'Play a sandbox round and your result will appear here.' : 'Your settled rounds will appear here after your first game.', 'empty');
        renderRecordList(dom.historyList, records, 'history');
    }

    function renderBets() {
        if (state.loading.bets) return renderStateBlock(dom.betsList, 'Loading bets', 'Fetching your bet ledger.', 'loading');
        if (state.errors.bets) return renderStateBlock(dom.betsList, 'Bets unavailable', state.errors.bets, 'error');
        if (!state.bets.length) return renderStateBlock(dom.betsList, 'No bets yet', state.mode === 'sandbox' ? 'Your sandbox stakes will be listed here.' : 'Place a live bet to begin your ledger.', 'empty');
        renderRecordList(dom.betsList, state.bets, 'bets');
    }

    function renderRecordList(container, records, type) {
        clearElement(container);
        const list = makeElement('div', 'record-list');
        records.slice(0, 100).forEach((record) => {
            const row = makeElement('article', 'record-row');
            const main = makeElement('div', 'record-main');
            const status = record.result === 'WIN' ? 'WIN' : record.result === 'LOSS' ? 'LOSS' : 'OPEN';
            const mark = makeElement('span', `record-mark ${status === 'WIN' ? 'is-win' : status === 'LOSS' ? 'is-loss' : ''}`, status === 'WIN' ? 'W' : status === 'LOSS' ? 'L' : '·');
            const copy = makeElement('div');
            copy.appendChild(makeElement('div', 'record-title', type === 'bets' ? `${record.status} · ${record.roundId || record.id}` : `${status} round`));
            copy.appendChild(makeElement('div', 'record-detail', `Stake ${currency(record.amount)} · Fee ${currency(record.fee)}`));
            main.append(mark, copy);
            const side = makeElement('div', 'record-side');
            const amount = type === 'bets' && record.status === 'OPEN' ? record.amount : record.net;
            side.appendChild(makeElement('div', `record-amount ${record.net >= 0 ? 'is-positive' : 'is-negative'}`, type === 'bets' && record.status === 'OPEN' ? `At risk ${currency(amount)}` : currency(amount, true)));
            side.appendChild(makeElement('div', 'record-date', compactDate(record.createdAt)));
            row.append(main, side);
            list.appendChild(row);
        });
        container.appendChild(list);
    }

    function renderTransactions() {
        if (state.loading.transactions) return renderStateBlock(dom.transactionsList, 'Loading transactions', 'Fetching wallet activity.', 'loading');
        if (state.errors.transactions) return renderStateBlock(dom.transactionsList, 'Transactions unavailable', state.errors.transactions, 'error');
        if (!state.transactions.length) return renderStateBlock(dom.transactionsList, 'No transactions yet', state.mode === 'sandbox' ? 'Sandbox stakes and test credits will appear here.' : 'Wallet activity will appear here.', 'empty');
        clearElement(dom.transactionsList);
        const list = makeElement('div', 'record-list');
        state.transactions.slice(0, 100).forEach((transaction) => {
            const row = makeElement('article', 'record-row');
            const main = makeElement('div', 'record-main');
            main.appendChild(makeElement('span', 'record-mark', transaction.type.slice(0, 1).toUpperCase()));
            const copy = makeElement('div');
            copy.appendChild(makeElement('div', 'record-title', transaction.type));
            copy.appendChild(makeElement('div', 'record-detail', transaction.description || `Transaction ${transaction.id}`));
            main.appendChild(copy);
            const side = makeElement('div', 'record-side');
            side.appendChild(makeElement('div', `record-amount ${transaction.amount >= 0 ? 'is-positive' : 'is-negative'}`, currency(transaction.amount, true)));
            side.appendChild(makeElement('div', 'record-date', compactDate(transaction.createdAt)));
            row.append(main, side);
            list.appendChild(row);
        });
        dom.transactionsList.appendChild(list);
    }

    function renderWallet() {
        renderBalances();
        renderTransactions();
        dom.sandboxTools.hidden = state.mode !== 'sandbox';
    }

    function renderAuth() {
        renderAuthNav();
        dom.signedOutPanel.hidden = Boolean(state.user);
        dom.signedInPanel.hidden = !state.user;
        if (state.user) {
            const name = safeText(state.user.name, 'Player');
            setText(dom.profileAvatar, initials(name));
            setText(dom.profileName, name);
            setText(dom.profileEmail, state.user.email || 'Sandbox identity');
            dom.profileDisplayName.value = name;
            dom.profileEmailInput.value = state.user.email || '';
            setText(dom.profileRole, state.user.isAdmin ? 'Administrator' : state.user.role || 'Player');
        }
        dom.loginForm.hidden = state.authMode !== 'login';
        dom.registerForm.hidden = state.authMode !== 'register';
        dom.authTabs.forEach((tab) => {
            const active = tab.dataset.authMode === state.authMode;
            tab.classList.toggle('is-active', active);
            tab.setAttribute('aria-selected', String(active));
        });
        setText(dom.authHeading, state.authMode === 'login' ? 'Welcome back' : 'Open your table account');
        setText(dom.authCopy, state.authMode === 'login'
            ? 'Sign in to sync bets, wallet, and history with the server.'
            : 'Create an account to keep live rounds and wallet activity together.');
    }

    function renderAdmin() {
        dom.adminNav.hidden = !state.admin.allowed;
        if (!state.admin.allowed) {
            dom.adminContent.hidden = true;
            renderStateBlock(dom.adminState, 'Admin access required', 'This account is not authorized to view operational controls.', 'error');
            return;
        }
        if (state.loading.admin) {
            dom.adminContent.hidden = true;
            renderStateBlock(dom.adminState, 'Loading admin data', 'Fetching operational metrics and configuration.', 'loading');
            return;
        }
        if (state.admin.error) {
            dom.adminContent.hidden = true;
            renderStateBlock(dom.adminState, 'Admin data unavailable', state.admin.error, 'error');
            return;
        }
        dom.adminContent.hidden = false;
        clearElement(dom.adminState);
        const stats = state.admin.stats || { rounds: 0, players: 0, volume: 0, revenue: 0 };
        setText(dom.adminRounds, stats.rounds);
        setText(dom.adminPlayers, stats.players);
        setText(dom.adminVolume, currency(stats.volume));
        setText(dom.adminRevenue, currency(stats.revenue));
        const config = state.admin.config || state.config;
        dom.configFee.value = (config.feeRate * 100).toFixed(2);
        dom.configMin.value = config.minBet;
        dom.configMax.value = config.maxBet;
    }

    function renderAll() {
        renderConnection();
        renderView();
        renderSound();
        renderAuth();
        renderBalances();
        renderPhase();
        renderBoard();
        renderBetPanel();
        renderHistory();
        renderBets();
        renderWallet();
        renderAdmin();
    }

    function setPhase(phase) {
        const next = phase === 'SUBMITTING' ? 'SUBMITTING' : normalizePhase(phase) || 'BETTING';
        state.phase = next;
        if (next !== 'BETTING') state.roundBusy = true;
        if (next === 'BETTING') state.roundBusy = false;
        if (next === 'COVER') {
            state.ballVisible = true;
            state.ballSlot = state.round && state.round.previewSlot !== undefined ? state.round.previewSlot : (state.ballSlot ?? 1);
        } else if (next === 'SHUFFLING' || next === 'PICKING' || next === 'SUBMITTING') {
            state.ballVisible = false;
        } else if (next === 'RESULT') {
            state.ballVisible = true;
            if (state.round && state.round.winningSlot !== null && state.round.winningSlot !== undefined) state.ballSlot = state.round.winningSlot;
        }
        renderPhase();
        renderBoard();
        renderBetPanel();
        renderBalances();
    }

    function startPhaseTimer(seconds, label, token, onComplete) {
        if (state.phaseTimer) clearTimer(state.phaseTimer);
        const started = Date.now();
        const duration = Math.max(0.1, seconds) * 1000;
        const tick = () => {
            if (token !== roundToken) return;
            const remaining = Math.max(0, duration - (Date.now() - started));
            const fraction = Math.max(0, Math.min(1, remaining / duration));
            setText(dom.phaseClockLabel, `${label} · ${Math.ceil(remaining / 1000)}s`);
            dom.phaseProgress.style.transform = `scaleX(${fraction})`;
            if (remaining <= 0) {
                if (state.phaseTimer) clearTimer(state.phaseTimer);
                state.phaseTimer = null;
                onComplete();
            }
        };
        tick();
        state.phaseTimer = scheduleInterval(tick, 100);
    }

    function resetCupPositions() {
        state.slotToCup = [0, 1, 2];
        dom.cupWraps.forEach((wrapper, cupId) => {
            wrapper.style.left = ['16.66%', '50%', '83.33%'][cupId];
            wrapper.style.zIndex = '4';
            wrapper.classList.remove('is-lifted', 'is-winner', 'is-loser');
        });
        dom.ball.classList.remove('is-result');
        renderBoard();
    }

    function swapVisualSlots(slotA, slotB, sandboxOutcome) {
        if (slotA === slotB || !state.round) return;
        const cupA = state.slotToCup[slotA];
        const cupB = state.slotToCup[slotB];
        state.slotToCup[slotA] = cupB;
        state.slotToCup[slotB] = cupA;
        if (sandboxOutcome && state.round.hiddenSlot !== null && state.round.hiddenSlot !== undefined) {
            if (state.round.hiddenSlot === slotA) state.round.hiddenSlot = slotB;
            else if (state.round.hiddenSlot === slotB) state.round.hiddenSlot = slotA;
        }
        renderBoard();
    }

    async function animateShuffle(token, sandboxOutcome) {
        setPhase('SHUFFLING');
        const reduced = state.reducedMotion;
        const stepCount = reduced ? 3 : 9;
        const stepDelay = reduced ? 0 : Math.floor(SHUFFLE_MS / stepCount);
        let previousPair = '';
        for (let index = 0; index < stepCount; index += 1) {
            if (token !== roundToken || state.phase === 'PICKING' || state.phase === 'RESULT' || state.phase === 'SUBMITTING') return false;
            let slotA = 0;
            let slotB = 1;
            do {
                slotA = Math.floor(Math.random() * 3);
                slotB = Math.floor(Math.random() * 3);
            } while (slotA === slotB || `${slotA}-${slotB}` === previousPair || `${slotB}-${slotA}` === previousPair);
            previousPair = `${slotA}-${slotB}`;
            const liftCup = state.slotToCup[slotA];
            const wrapper = dom.cupWraps[liftCup];
            if (wrapper) wrapper.classList.add('is-lifted');
            swapVisualSlots(slotA, slotB, sandboxOutcome);
            playTone('shuffle');
            await wait(stepDelay, token);
            if (wrapper) wrapper.classList.remove('is-lifted');
            await wait(reduced ? 0 : 46, token);
        }
        return token === roundToken;
    }

    async function startSandboxRound(amount) {
        const token = ++roundToken;
        clearRoundTimers();
        resetCupPositions();
        const fee = amount * state.config.feeRate;
        const total = amount + fee;
        const hiddenSlot = Math.floor(Math.random() * 3);
        state.round = {
            id: `demo-${Date.now().toString(36)}`,
            betId: `demo-bet-${Date.now().toString(36)}`,
            amount,
            fee,
            total,
            hiddenSlot,
            previewSlot: hiddenSlot,
            selectedSlot: null,
            winningSlot: null,
            won: null,
            payout: 0,
            net: 0,
            resultHandled: false
        };
        state.selectedSlot = null;
        state.ballSlot = hiddenSlot;
        state.balance -= total;
        state.transactions.unshift({
            id: `txn-${Date.now().toString(36)}-stake`,
            type: 'Stake',
            description: `Round ${state.round.id}`,
            amount: -total,
            balance: state.balance,
            createdAt: new Date().toISOString()
        });
        const existingBet = {
            id: state.round.betId,
            roundId: state.round.id,
            result: 'PENDING',
            status: 'OPEN',
            amount,
            fee,
            payout: 0,
            net: -total,
            createdAt: new Date().toISOString()
        };
        state.bets.unshift(existingBet);
        state.history.unshift(existingBet);
        persistSandbox();
        setPhase('COVER');
        await wait(state.reducedMotion ? 0 : 850, token);
        if (token !== roundToken) return;
        state.ballVisible = false;
        renderBoard();
        await animateShuffle(token, true);
        if (token !== roundToken) return;
        enterPicking(token, null);
    }

    function enterPicking(token, expiresAt) {
        if (token !== roundToken || !state.round || state.phase === 'RESULT') return;
        setPhase('PICKING');
        state.selectedSlot = null;
        renderBoard();
        const remaining = expiresAt ? Math.max(0, (new Date(expiresAt).getTime() - Date.now()) / 1000) : PICK_SECONDS;
        startPhaseTimer(remaining || PICK_SECONDS, 'Pick now', token, () => {
            if (state.phase === 'PICKING') handleSelection(null);
        });
    }

    async function handleSelection(slot) {
        if (state.phase !== 'PICKING' || !state.round || slot === undefined) return;
        if (slot !== null && (!Number.isInteger(slot) || slot < 0 || slot > 2)) return;
        if (state.phaseTimer) {
            clearTimer(state.phaseTimer);
            state.phaseTimer = null;
        }
        state.selectedSlot = slot;
        state.round.selectedSlot = slot;
        renderBoard();
        if (state.mode === 'live') {
            await submitLiveSelection(slot);
        } else {
            await settleSandboxRound(slot);
        }
    }

    async function submitLiveSelection(slot) {
        const token = roundToken;
        setPhase('SUBMITTING');
        const payload = {
            roundId: state.round.id,
            selection: slot === null ? null : slot + 1,
            cup: slot === null ? null : slot + 1,
            slot,
            timedOut: slot === null
        };
        try {
            const response = await api.submitSelection(state.round.id, payload);
            if (token !== roundToken) return;
            const normalized = normalizeRound(response);
            state.round = { ...state.round, ...normalized, selectedSlot: slot };
            if (normalized.hasResult || normalized.phase === 'RESULT') {
                settleLiveRound(normalized);
            } else {
                announce('Selection submitted. Waiting for the server to settle the round.');
                startLivePolling(token);
            }
        } catch (error) {
            if (token !== roundToken) return;
            if (error.network) {
                state.connectionMessage = 'Live round connection lost. Reconnect to retrieve the authoritative result.';
                renderConnection();
                showToast('Selection was sent, but the result is still pending on the server.', 'error');
            } else {
                setPhase('PICKING');
                showToast(error.message || 'The server rejected that selection. Try again.', 'error');
            }
        }
    }

    async function settleSandboxRound(selectedSlot) {
        if (!state.round || state.round.resultHandled) return;
        const token = roundToken;
        const winningSlot = state.round.hiddenSlot;
        const won = selectedSlot !== null && selectedSlot === winningSlot;
        const payout = won ? state.round.amount * WIN_MULTIPLIER : 0;
        const net = won ? payout - state.round.total : -state.round.total;
        state.round = { ...state.round, winningSlot, won, payout, net, resultHandled: true };
        state.balance += payout;
        const bet = state.bets.find((item) => item.id === state.round.betId);
        if (bet) Object.assign(bet, { result: won ? 'WIN' : 'LOSS', status: 'SETTLED', payout, net, winningSlot, selectedSlot });
        const history = state.history.find((item) => item.id === state.round.betId);
        if (history) Object.assign(history, { result: won ? 'WIN' : 'LOSS', payout, net, winningSlot, selectedSlot });
        if (payout > 0) {
            state.transactions.unshift({
                id: `txn-${Date.now().toString(36)}-payout`,
                type: 'Payout',
                description: `Round ${state.round.id}`,
                amount: payout,
                balance: state.balance,
                createdAt: new Date().toISOString()
            });
        }
        persistSandbox();
        setPhase('RESULT');
        playTone(won ? 'win' : 'lose');
        announce(won ? 'You won the sandbox round.' : 'The sandbox round was a loss.');
        showToast(won ? `Win confirmed. Gross payout ${currency(payout)}.` : selectedSlot === null ? 'Time expired. The round was settled as a loss.' : 'Loss confirmed. Try another round.', won ? 'success' : 'error');
        renderHistory();
        renderBets();
        renderWallet();
        schedule(() => {
            if (token === roundToken) resetRound();
        }, state.reducedMotion ? 900 : 3600);
    }

    async function startLiveRound(amount) {
        const token = ++roundToken;
        clearRoundTimers();
        resetCupPositions();
        const fee = amount * state.config.feeRate;
        const total = amount + fee;
        try {
            const betResponse = await api.placeBet({ amount, stake: amount, fee, total, currency: 'USD' });
            if (token !== roundToken) return;
            const betObject = getObject(betResponse);
            const betRound = betObject.round && typeof betObject.round === 'object' ? betObject.round : null;
            const betId = safeText(valueAt(betObject, ['betId', 'id', 'wagerId']), safeText(betRound && betRound.id));
            const roundResponse = await api.startRound({ betId: betId || undefined, amount, stake: amount, currency: 'USD' }, betRound);
            if (token !== roundToken) return;
            const normalized = normalizeRound(roundResponse);
            if (!normalized.id) throw new ApiError('The server accepted the bet but did not return a round id.');
            state.round = {
                ...normalized,
                id: normalized.id,
                betId: normalized.betId || betId,
                amount: normalized.amount || amount,
                fee: normalized.fee || fee,
                total: normalized.total || total,
                previewSlot: 1,
                resultHandled: false
            };
            state.selectedSlot = null;
            state.ballSlot = 1;
            setPhase(normalized.phase === 'PICKING' ? 'PICKING' : 'COVER');
            startLivePolling(token);
            if (state.phase === 'PICKING') {
                enterPicking(token, normalized.expiresAt);
            } else {
                void runLiveVisual(token);
            }
        } catch (error) {
            if (token !== roundToken) return;
            state.roundBusy = false;
            state.round = null;
            state.phase = 'BETTING';
            renderAll();
            showToast(error.message || 'The live server could not start this round.', 'error');
            if (error.network) {
                state.connectionMessage = 'The live API is unavailable. No local live result was created.';
                renderConnection();
            }
            void refreshAccount({ silent: true });
        }
    }

    async function runLiveVisual(token) {
        state.ballVisible = true;
        renderBoard();
        await wait(state.reducedMotion ? 0 : 850, token);
        if (token !== roundToken || state.phase === 'RESULT' || state.phase === 'PICKING') return;
        state.ballVisible = false;
        renderBoard();
        await animateShuffle(token, false);
        if (token !== roundToken || state.phase === 'RESULT' || state.phase === 'PICKING') return;
        try {
            const response = await api.advanceRound(state.round.id, { phase: 'PICKING' });
            if (token !== roundToken) return;
            applyLiveRound(normalizeRound(response), token);
        } catch (error) {
            if ((error.status === 404 || error.status === 405) && state.phase === 'SHUFFLING') {
                // The bundled backend treats an OPEN round as ready for a pick after the visual shuffle.
                enterPicking(token, null);
            } else if (error.status !== 404 && error.status !== 405 && !error.network) {
                showToast(error.message || 'The server did not advance the round.', 'error');
            }
        }
    }

    function startLivePolling(token) {
        if (state.mode !== 'live' || !state.round || !state.round.id) return;
        const poll = async () => {
            if (pollPromise || token !== roundToken || !state.round || state.round.resultHandled) return;
            pollPromise = pollLiveRound(token).finally(() => { pollPromise = null; });
            await pollPromise;
        };
        scheduleInterval(() => { void poll(); }, 1000);
        void poll();
    }

    async function pollLiveRound(token) {
        if (token !== roundToken || !state.round || !state.round.id) return;
        try {
            const response = await api.getRound(state.round.id);
            if (token !== roundToken) return;
            applyLiveRound(normalizeRound(response), token);
        } catch (error) {
            if (error.network) {
                state.connectionMessage = 'Live round status is temporarily unavailable. The server remains authoritative.';
                renderConnection();
            }
        }
    }

    function applyLiveRound(normalized, token) {
        if (token !== roundToken || !state.round) return;
        state.round = { ...state.round, ...normalized };
        if (normalized.selectedSlot !== null && normalized.selectedSlot !== undefined) state.selectedSlot = normalized.selectedSlot;
        if (normalized.winningSlot !== null && normalized.winningSlot !== undefined) state.ballSlot = normalized.winningSlot;
        if (normalized.hasResult || normalized.phase === 'RESULT') {
            settleLiveRound(normalized);
            return;
        }
        if (normalized.phase === 'PICKING') {
            if (state.phase !== 'PICKING' && state.phase !== 'SUBMITTING') enterPicking(token, normalized.expiresAt);
            return;
        }
        if (normalized.phase === 'SHUFFLING') {
            if (state.phase !== 'SHUFFLING') setPhase('SHUFFLING');
            return;
        }
        if (normalized.phase === 'COVER') {
            if (state.phase !== 'COVER') setPhase('COVER');
        }
    }

    function settleLiveRound(normalized) {
        if (!state.round || state.round.resultHandled) return;
        state.round = { ...state.round, ...normalized, resultHandled: true };
        state.round.won = normalized.won === null || normalized.won === undefined
            ? (state.selectedSlot !== null && normalized.winningSlot !== null ? state.selectedSlot === normalized.winningSlot : null)
            : normalized.won;
        state.round.payout = normalized.payout;
        state.round.net = normalized.net || (state.round.won ? normalized.payout - state.round.total : -state.round.total);
        if (normalized.balance !== undefined && Number.isFinite(Number(normalized.balance))) state.balance = Number(normalized.balance);
        setPhase('RESULT');
        playTone(state.round.won ? 'win' : 'lose');
        announce(state.round.won ? 'The server confirmed a win.' : 'The server confirmed a loss.');
        showToast(state.round.won ? `Server result: win. Gross payout ${currency(state.round.payout)}.` : 'Server result: loss.', state.round.won ? 'success' : 'error');
        void refreshAccount({ silent: true });
        schedule(() => resetRound(), state.reducedMotion ? 900 : 3600);
    }

    function resetRound() {
        clearRoundTimers();
        roundToken += 1;
        state.round = null;
        state.selectedSlot = null;
        state.ballVisible = false;
        state.ballSlot = null;
        state.phase = 'BETTING';
        state.roundBusy = false;
        resetCupPositions();
        renderAll();
    }

    function extractToken(payload) {
        const object = getObject(payload);
        return safeText(valueAt(object, ['token', 'accessToken', 'access_token', 'sessionToken']));
    }

    function applyConfig(payload) {
        const object = getObject(payload);
        const config = object.config || object.settings || object;
        const explicitFee = valueAt(config, ['feeRate', 'houseFeeRate', 'fee']);
        const rawFee = explicitFee !== undefined ? Number(explicitFee) : finiteOr(valueAt(config, ['feeBps']), state.config.feeRate * 10000) / 10000;
        const feeRate = explicitFee !== undefined && rawFee > 1 ? rawFee / 100 : rawFee;
        state.config.feeRate = Math.max(0, Math.min(1, feeRate));
        state.config.minBet = Math.max(0, moneyMajor(config, ['minBet', 'minimumBet', 'min'], ['minBetMinor'], state.config.minBet));
        state.config.maxBet = Math.max(state.config.minBet, moneyMajor(config, ['maxBet', 'maximumBet', 'max'], ['maxBetMinor'], state.config.maxBet));
    }

    async function loadPublicConfig() {
        if (state.mode !== 'live') return;
        try {
            applyConfig(await api.getConfig());
        } catch (error) {
            if (error.status !== 404 && error.status !== 405 && !error.network) {
                state.connectionMessage = 'Live API is connected, but game configuration could not be loaded.';
            }
        }
    }

    async function refreshAccount(options = {}) {
        if (state.mode !== 'live') {
            renderHistory();
            renderBets();
            renderWallet();
            return;
        }
        state.loading.history = true;
        state.loading.bets = true;
        state.loading.transactions = true;
        state.errors.history = '';
        state.errors.bets = '';
        state.errors.transactions = '';
        renderHistory();
        renderBets();
        renderTransactions();
        const tasks = [
            ['balance', api.getBalance()],
            ['history', state.user ? api.getHistory() : Promise.resolve([])],
            ['bets', state.user ? api.getBets() : Promise.resolve([])],
            ['transactions', state.user ? api.getTransactions() : Promise.resolve([])],
            ['profile', state.user ? api.getProfile() : Promise.resolve(null)]
        ];
        const results = await Promise.allSettled(tasks.map(([, promise]) => promise));
        results.forEach((result, index) => {
            const key = tasks[index][0];
            if (result.status === 'fulfilled') {
                if (key === 'balance') {
                    const balance = readBalance(result.value);
                    if (Number.isFinite(balance)) state.balance = balance;
                } else if (key === 'history') {
                    state.history = getArray(result.value, ['history', 'rounds', 'records', 'items']).map(normalizeHistoryRecord).filter(Boolean);
                } else if (key === 'bets') {
                    state.bets = getArray(result.value, ['bets', 'wagers', 'items', 'records']).map(normalizeBetRecord).filter(Boolean);
                } else if (key === 'transactions') {
                    state.transactions = getArray(result.value, ['transactions', 'items', 'records']).map(normalizeTransaction).filter(Boolean);
                } else if (key === 'profile') {
                    const profile = normalizeUser(result.value);
                    if (profile) state.user = { ...state.user, ...profile };
                }
            } else if (result.reason instanceof ApiError && result.reason.status === 401) {
                if (key !== 'balance') state.errors[key] = 'Sign in to load this account data.';
            } else if (key === 'balance') {
                state.connectionMessage = result.reason && result.reason.network ? 'The live wallet could not be reached.' : '';
            } else if (key !== 'profile') {
                state.errors[key] = result.reason instanceof Error ? result.reason.message : 'The server did not return this data.';
            }
        });
        state.loading.history = false;
        state.loading.bets = false;
        state.loading.transactions = false;
        state.loading.profile = false;
        state.admin.allowed = Boolean(state.user && state.user.isAdmin);
        renderAll();
        if (state.admin.allowed) await loadAdmin({ silent: options.silent });
    }

    async function loadAdmin() {
        if (!state.admin.allowed || state.mode !== 'live') return;
        state.loading.admin = true;
        state.admin.error = '';
        renderAdmin();
        const [statsResult, configResult] = await Promise.allSettled([api.getAdminStats(), api.getAdminConfig()]);
        if (statsResult.status === 'rejected' && configResult.status === 'rejected') {
            const error = statsResult.reason || configResult.reason;
            state.admin.error = error instanceof Error ? error.message : 'The server did not return admin data.';
            if (error && error.status === 403) state.admin.allowed = false;
        } else {
            if (statsResult.status === 'fulfilled') state.admin.stats = normalizeAdmin(statsResult.value).stats;
            if (configResult.status === 'fulfilled') state.admin.config = normalizeAdmin(configResult.value).config;
        }
        state.loading.admin = false;
        renderAdmin();
    }

    function showToast(message, type = 'info') {
        if (!dom.toastRegion) return;
        const toast = makeElement('div', `toast is-${type}`);
        toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
        toast.appendChild(makeElement('span', '', message));
        dom.toastRegion.appendChild(toast);
        const id = window.setTimeout(() => {
            toastTimeouts.delete(id);
            toast.style.animation = 'toast-out 180ms ease-in forwards';
            schedule(() => toast.remove(), 190);
        }, 3600);
        toastTimeouts.add(id);
    }

    function announce(message) {
        setText(dom.announcer, message);
    }

    function playTone(type) {
        if (state.muted || state.reducedMotion && type === 'shuffle') return;
        try {
            if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
            if (audioContext.state === 'suspended') void audioContext.resume();
            const oscillator = audioContext.createOscillator();
            const gain = audioContext.createGain();
            oscillator.connect(gain);
            gain.connect(audioContext.destination);
            const now = audioContext.currentTime;
            if (type === 'shuffle') {
                oscillator.type = 'triangle';
                oscillator.frequency.setValueAtTime(230, now);
                oscillator.frequency.exponentialRampToValueAtTime(340, now + 0.08);
                gain.gain.setValueAtTime(0.035, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
                oscillator.start(now);
                oscillator.stop(now + 0.12);
            } else if (type === 'win') {
                oscillator.type = 'sine';
                oscillator.frequency.setValueAtTime(420, now);
                oscillator.frequency.setValueAtTime(620, now + 0.1);
                oscillator.frequency.setValueAtTime(820, now + 0.2);
                gain.gain.setValueAtTime(0.075, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.42);
                oscillator.start(now);
                oscillator.stop(now + 0.43);
            } else {
                oscillator.type = 'sawtooth';
                oscillator.frequency.setValueAtTime(155, now);
                oscillator.frequency.exponentialRampToValueAtTime(55, now + 0.28);
                gain.gain.setValueAtTime(0.055, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
                oscillator.start(now);
                oscillator.stop(now + 0.31);
            }
        } catch (error) {
            // Audio is an enhancement; browsers can reject it until a user gesture.
        }
    }

    function toggleSound() {
        state.muted = !state.muted;
        writeStorage(SOUND_KEY, String(state.muted));
        renderSound();
        if (!state.muted) playTone('win');
    }

    async function handlePlaceBet(event) {
        event.preventDefault();
        const values = currentBetValues();
        const validation = validateBet(values.amount);
        showFieldError(dom.betValidation, validation);
        if (validation) {
            if (state.mode === 'live' && !state.user) setView('profile');
            return;
        }
        state.betAmount = values.amount;
        state.roundBusy = true;
        renderBetPanel();
        if (state.mode === 'sandbox') {
            await startSandboxRound(values.amount);
        } else {
            await startLiveRound(values.amount);
        }
    }

    function setAuthMode(mode) {
        state.authMode = mode === 'register' ? 'register' : 'login';
        showFieldError(dom.loginError, '');
        showFieldError(dom.registerError, '');
        renderAuth();
    }

    function formValues(form) {
        return Object.fromEntries(new FormData(form).entries());
    }

    async function handleLogin(event) {
        event.preventDefault();
        if (!dom.loginForm.checkValidity()) {
            dom.loginForm.reportValidity();
            return;
        }
        const values = formValues(dom.loginForm);
        const fallback = { id: values.email, name: values.email.split('@')[0], email: values.email, role: 'player', isAdmin: false };
        const button = dom.loginForm.querySelector('button[type="submit"]');
        setBusy(button, true, 'Signing in…', 'Sign in');
        showFieldError(dom.loginError, '');
        try {
            if (state.mode === 'sandbox') {
                state.user = fallback;
                persistSandbox();
                showToast('Sandbox identity ready. Live sync will start when an API is available.', 'success');
            } else {
                const response = await api.login({ email: values.email, password: values.password });
                const token = extractToken(response);
                if (token) writeStorage('glass_shuffle_session', token);
                state.user = normalizeUser(response) || fallback;
                await loadPublicConfig();
                await refreshAccount({ silent: true });
                showToast('Signed in successfully.', 'success');
            }
            dom.loginForm.reset();
            state.admin.allowed = Boolean(state.user && state.user.isAdmin);
            renderAll();
            setView('game');
        } catch (error) {
            showFieldError(dom.loginError, error.message || 'Sign in failed. Check your details and try again.');
        } finally {
            setBusy(button, false, 'Signing in…', 'Sign in');
        }
    }

    async function handleRegister(event) {
        event.preventDefault();
        if (!dom.registerForm.checkValidity()) {
            dom.registerForm.reportValidity();
            return;
        }
        const values = formValues(dom.registerForm);
        const fallback = { id: values.email, name: values.name, email: values.email, role: 'player', isAdmin: false };
        const button = dom.registerForm.querySelector('button[type="submit"]');
        setBusy(button, true, 'Creating…', 'Create account');
        showFieldError(dom.registerError, '');
        try {
            if (state.mode === 'sandbox') {
                state.user = fallback;
                persistSandbox();
                showToast('Sandbox account created locally.', 'success');
            } else {
                const response = await api.register({ name: values.name, displayName: values.name, email: values.email, password: values.password });
                const token = extractToken(response);
                if (token) writeStorage('glass_shuffle_session', token);
                state.user = normalizeUser(response) || fallback;
                await loadPublicConfig();
                await refreshAccount({ silent: true });
                showToast('Account created successfully.', 'success');
            }
            dom.registerForm.reset();
            state.admin.allowed = Boolean(state.user && state.user.isAdmin);
            renderAll();
            setView('game');
        } catch (error) {
            showFieldError(dom.registerError, error.message || 'Registration failed. Try a different email.');
        } finally {
            setBusy(button, false, 'Creating…', 'Create account');
        }
    }

    async function handleLogout() {
        if (state.mode === 'live') {
            try { await api.logout(); } catch (error) { /* Clear local session even when the server is unavailable. */ }
            writeStorage('glass_shuffle_session', '');
        }
        state.user = null;
        state.admin = { allowed: false, stats: null, config: null, error: '' };
        persistSandbox();
        renderAll();
        setView('profile');
        showToast('Signed out.', 'info');
    }

    async function handleProfileSave(event) {
        event.preventDefault();
        if (!state.user || !dom.profileForm.checkValidity()) {
            dom.profileForm.reportValidity();
            return;
        }
        const name = safeText(dom.profileDisplayName.value, state.user.name);
        const button = dom.profileForm.querySelector('button[type="submit"]');
        setBusy(button, true, 'Saving…', 'Save profile');
        showFieldError(dom.profileError, '');
        try {
            if (state.mode === 'live') {
                const response = await api.updateProfile({ name, displayName: name });
                state.user = { ...state.user, ...(normalizeUser(response) || { name }) };
            } else {
                state.user = { ...state.user, name };
                persistSandbox();
            }
            renderAuth();
            showToast('Profile saved.', 'success');
        } catch (error) {
            showFieldError(dom.profileError, error.message || 'Profile changes could not be saved.');
        } finally {
            setBusy(button, false, 'Saving…', 'Save profile');
        }
    }

    function handleSandboxFunds(event) {
        event.preventDefault();
        const amount = Number(dom.sandboxFundsInput.value);
        if (!Number.isFinite(amount) || amount <= 0) {
            showToast('Enter a positive amount of test funds.', 'error');
            return;
        }
        state.balance += amount;
        state.transactions.unshift({
            id: `txn-${Date.now().toString(36)}-credit`,
            type: 'Test credit',
            description: 'Sandbox-only wallet adjustment',
            amount,
            balance: state.balance,
            createdAt: new Date().toISOString()
        });
        persistSandbox();
        renderAll();
        showToast(`${currency(amount)} added to the sandbox wallet.`, 'success');
    }

    function resetSandbox() {
        if (state.mode !== 'sandbox') return;
        if (!window.confirm('Reset sandbox balance, account, transactions, and round history?')) return;
        try {
            window.localStorage.removeItem(STORAGE_KEY);
        } catch (error) { /* In-memory state is reset below. */ }
        state.user = null;
        state.balance = 1000;
        state.config = { ...DEFAULT_CONFIG };
        state.history = [];
        state.bets = [];
        state.transactions = [];
        resetRound();
        showToast('Sandbox data reset.', 'success');
    }

    async function handleAdminConfig(event) {
        event.preventDefault();
        const feePercent = Number(dom.configFee.value);
        const minBet = Number(dom.configMin.value);
        const maxBet = Number(dom.configMax.value);
        if (!Number.isFinite(feePercent) || feePercent < 0 || feePercent > 25 || !Number.isFinite(minBet) || !Number.isFinite(maxBet) || minBet < 0 || maxBet < minBet) {
            showFieldError(dom.adminError, 'Enter a valid fee between 0% and 25%, with max stake at least the minimum.');
            return;
        }
        const button = dom.adminConfigForm.querySelector('button[type="submit"]');
        setBusy(button, true, 'Saving…', 'Save configuration');
        showFieldError(dom.adminError, '');
        try {
            const next = { feeBps: Math.round(feePercent * 100), minBetMinor: Math.round(minBet * 100), maxBetMinor: Math.round(maxBet * 100) };
            if (state.mode === 'live') {
                const response = await api.updateAdminConfig(next);
                state.admin.config = normalizeAdmin(response).config;
                state.config = { ...state.config, ...state.admin.config };
            }
            renderAll();
            showToast('Round configuration saved.', 'success');
        } catch (error) {
            showFieldError(dom.adminError, error.message || 'Configuration could not be saved.');
        } finally {
            setBusy(button, false, 'Saving…', 'Save configuration');
        }
    }

    function bindEvents() {
        dom.navLinks.forEach((link) => {
            link.addEventListener('click', (event) => {
                event.preventDefault();
                setView(link.dataset.view);
            });
        });
        dom.authNavButton.addEventListener('click', () => setView('profile'));
        dom.soundToggle.addEventListener('click', toggleSound);
        dom.reconnectButton.addEventListener('click', () => { void bootstrap(); });
        dom.betForm.addEventListener('submit', (event) => { void handlePlaceBet(event); });
        dom.betInput.addEventListener('input', () => {
            state.betAmount = finiteOr(dom.betInput.value, state.betAmount);
            renderBetPanel();
        });
        dom.quickBets.forEach((button) => {
            button.addEventListener('click', () => {
                const max = Math.floor(Math.min(state.config.maxBet, state.balance / (1 + state.config.feeRate)));
                dom.betInput.value = button.dataset.amount === 'max' ? Math.max(state.config.minBet, max) : button.dataset.amount;
                state.betAmount = Number(dom.betInput.value);
                renderBetPanel();
                dom.betInput.focus();
            });
        });
        dom.cups.forEach((cup) => {
            cup.addEventListener('click', () => {
                const cupId = Number(cup.dataset.cupId);
                const slot = state.slotToCup.indexOf(cupId);
                void handleSelection(slot);
            });
        });
        window.addEventListener('keydown', (event) => {
            if (state.phase !== 'PICKING' || event.altKey || event.ctrlKey || event.metaKey) return;
            const target = event.target;
            if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
            if (/^[1-3]$/.test(event.key)) {
                event.preventDefault();
                void handleSelection(Number(event.key) - 1);
            }
        });
        dom.historyFilters.forEach((button) => {
            button.addEventListener('click', () => {
                state.historyFilter = button.dataset.historyFilter || 'all';
                dom.historyFilters.forEach((item) => item.classList.toggle('is-active', item === button));
                renderHistory();
            });
        });
        dom.refreshHistoryButton.addEventListener('click', () => { void refreshAccount(); });
        dom.refreshBetsButton.addEventListener('click', () => { void refreshAccount(); });
        dom.refreshWalletButton.addEventListener('click', () => { void refreshAccount(); });
        dom.sandboxFundsForm.addEventListener('submit', handleSandboxFunds);
        dom.resetSandboxButton.addEventListener('click', resetSandbox);
        dom.authTabs.forEach((tab) => tab.addEventListener('click', () => setAuthMode(tab.dataset.authMode)));
        dom.loginForm.addEventListener('submit', (event) => { void handleLogin(event); });
        dom.registerForm.addEventListener('submit', (event) => { void handleRegister(event); });
        dom.profileForm.addEventListener('submit', (event) => { void handleProfileSave(event); });
        dom.logoutButton.addEventListener('click', () => { void handleLogout(); });
        dom.refreshAdminButton.addEventListener('click', () => { void loadAdmin(); });
        dom.adminConfigForm.addEventListener('submit', (event) => { void handleAdminConfig(event); });
        if (window.matchMedia) {
            const media = window.matchMedia('(prefers-reduced-motion: reduce)');
            const handleMotionChange = (event) => { state.reducedMotion = event.matches; };
            if (media.addEventListener) media.addEventListener('change', handleMotionChange);
            else if (media.addListener) media.addListener(handleMotionChange);
        }
        window.addEventListener('beforeunload', () => {
            clearRoundTimers();
            for (const id of Array.from(toastTimeouts)) window.clearTimeout(id);
            if (audioContext && audioContext.state !== 'closed') void audioContext.close();
        });
    }

    async function bootstrap() {
        if (state.roundBusy && state.mode === 'live') {
            showToast('Reconnect after this round settles so the server remains authoritative.', 'info');
            return;
        }
        state.mode = 'checking';
        state.serverOnline = false;
        state.connectionMessage = 'Checking for the game server…';
        renderAll();
        const canProbe = window.location.protocol !== 'file:' || api.explicitBase;
        if (!canProbe) {
            setMode('sandbox', 'Sandbox mode: open this page through a server or configure an API URL for live play.');
            renderAll();
            return;
        }
        try {
            const session = await api.getSession();
            state.mode = 'live';
            state.serverOnline = true;
            state.connectionMessage = '';
            state.user = normalizeUser(session);
            await loadPublicConfig();
            await refreshAccount({ silent: true });
            renderAll();
        } catch (error) {
            if (error instanceof ApiError && (error.network || error.status === 404 || error.status === 405)) {
                state.user = normalizeUser(saved.user);
                setMode('sandbox', 'Sandbox mode: no game server was detected. Results are simulated locally and never affect real funds.');
                renderAll();
                return;
            }
            if (error instanceof ApiError && error.status === 401) {
                state.mode = 'live';
                state.serverOnline = true;
                state.connectionMessage = '';
                state.user = null;
                await loadPublicConfig();
                await refreshAccount({ silent: true });
                renderAll();
                return;
            }
            state.mode = 'live';
            state.serverOnline = true;
            state.user = null;
            state.connectionMessage = 'The game server responded, but the session could not be loaded. You can retry or sign in.';
            renderAll();
        }
    }

    bindEvents();
    renderAll();
    void bootstrap();
})();
