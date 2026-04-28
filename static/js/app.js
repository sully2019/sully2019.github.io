// Agile Retro Apps - Main Application
const App = {
    currentView: 'home',
    sessionId: null,
    participantId: null,
    participantName: null,
    isOwner: false,
    ws: null,
    wsReconnectDelay: 500,
    wsHandlers: {},
    participants: [],
    sessionData: null,

    // --- View Management ---
    showView(viewName) {
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        const view = document.getElementById(`${viewName}-view`);
        if (view) {
            view.classList.add('active');
            this.currentView = viewName;
        }
    },

    switchTab(tab) {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        document.querySelector(`[data-tab="${tab}"]`)?.classList.add('active');
        document.getElementById(`${tab}-view`)?.classList.add('active');
    },

    // --- API Helper ---
    async api(method, path, body) {
        const opts = {
            method,
            headers: { 'Content-Type': 'application/json' },
        };
        if (body) opts.body = JSON.stringify(body);
        const res = await fetch(`/api${path}`, opts);
        if (!res.ok) {
            const err = await res.json().catch(() => ({ detail: 'Request failed' }));
            throw new Error(err.detail || 'Request failed');
        }
        return res.json();
    },

    // --- Local Storage ---
    getStoredParticipant(sessionId) {
        const data = localStorage.getItem(`participant_${sessionId}`);
        return data ? JSON.parse(data) : null;
    },

    storeParticipant(sessionId, participant, isOwner) {
        localStorage.setItem(`participant_${sessionId}`, JSON.stringify({
            ...participant,
            isOwner,
        }));
    },

    // --- Session List ---
    async loadSessions() {
        try {
            const sessions = await this.api('GET', '/sessions');
            const container = document.getElementById('sessions-container');
            if (sessions.length === 0) {
                container.innerHTML = '<p class="empty-state">No sessions yet. Create one above!</p>';
                return;
            }
            container.innerHTML = sessions.map(s => `
                <div class="card session-card" data-id="${s.id}">
                    <div class="session-card-info">
                        <h3>${this.escapeHtml(s.name)}</h3>
                        <span class="session-meta">${new Date(s.created_at).toLocaleDateString()} &middot; ${s.participant_count} participants &middot; ${s.poker_scale}</span>
                    </div>
                    <div class="session-card-actions">
                        <button class="btn btn-primary btn-small" onclick="App.joinSessionFlow('${s.id}', '${this.escapeHtml(s.name)}')">Join</button>
                        <button class="btn btn-secondary btn-small" onclick="App.viewHistory('${s.id}')">History</button>
                    </div>
                </div>
            `).join('');
        } catch (err) {
            console.error('Failed to load sessions:', err);
        }
    },

    // --- Create Session ---
    async createSession(name, pokerScale) {
        try {
            const session = await this.api('POST', '/sessions', { name, poker_scale: pokerScale });
            this.joinSessionFlow(session.id, session.name);
        } catch (err) {
            alert('Failed to create session: ' + err.message);
        }
    },

    // --- Join Flow ---
    joinSessionFlow(sessionId, sessionName) {
        this.sessionId = sessionId;

        // Check if already joined
        const stored = this.getStoredParticipant(sessionId);
        if (stored) {
            this.participantId = stored.id;
            this.participantName = stored.name;
            this.isOwner = stored.isOwner;
            this.enterHub(sessionName);
            return;
        }

        document.getElementById('join-session-name').textContent = sessionName;
        document.getElementById('participant-name').value = '';
        this.showView('join');
    },

    async joinSession(name) {
        try {
            const result = await this.api('POST', `/sessions/${this.sessionId}/join`, { name });
            this.participantId = result.participant.id;
            this.participantName = result.participant.name;
            this.isOwner = result.is_owner;
            this.sessionData = result.session;
            this.storeParticipant(this.sessionId, result.participant, result.is_owner);
            this.enterHub(result.session.name);
        } catch (err) {
            alert('Failed to join: ' + err.message);
        }
    },

    async enterHub(sessionName) {
        document.getElementById('hub-session-name').textContent = sessionName;
        document.getElementById('hub-owner-badge').style.display = this.isOwner ? '' : 'none';
        this.showView('hub');
        this.switchTab('retro');

        // Load session detail for participants
        try {
            const detail = await this.api('GET', `/sessions/${this.sessionId}`);
            this.sessionData = detail;
            this.participants = detail.participants;
            this.renderParticipants();
        } catch (err) {
            console.error('Failed to load session detail:', err);
        }

        this.connectWs();

        // Initialize retro and poker views
        if (typeof Retro !== 'undefined') Retro.init();
        if (typeof Poker !== 'undefined') Poker.init();
    },

    leaveSession() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.sessionId = null;
        this.participantId = null;
        this.participantName = null;
        this.isOwner = false;
        this.showView('home');
        this.loadSessions();
    },

    renderParticipants() {
        const container = document.getElementById('hub-participants');
        container.innerHTML = this.participants.map(p => {
            const initial = p.name.charAt(0).toUpperCase();
            const isMe = p.id === this.participantId;
            return `<span class="participant-avatar${isMe ? ' me' : ''}" title="${this.escapeHtml(p.name)}">${initial}</span>`;
        }).join('');
    },

    // --- WebSocket ---
    connectWs() {
        if (this.ws) {
            this.ws.close();
        }

        const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
        const url = `${protocol}//${location.host}/ws/${this.sessionId}?participant_id=${this.participantId}`;
        this.ws = new WebSocket(url);
        this.wsReconnectDelay = 500;

        this.ws.onopen = () => {
            console.log('WebSocket connected');
            // On reconnect, refresh state
            if (typeof Retro !== 'undefined' && this.currentView === 'hub') Retro.loadCards();
            if (typeof Poker !== 'undefined' && this.currentView === 'hub') Poker.loadRounds().then(() => Poker.render());
        };

        this.ws.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                this.handleWsMessage(msg);
            } catch (err) {
                console.error('Failed to parse WS message:', err);
            }
        };

        this.ws.onclose = () => {
            console.log('WebSocket closed, reconnecting...');
            if (this.sessionId) {
                setTimeout(() => this.connectWs(), this.wsReconnectDelay);
                this.wsReconnectDelay = Math.min(this.wsReconnectDelay * 2, 5000);
            }
        };

        this.ws.onerror = (err) => {
            console.error('WebSocket error:', err);
        };
    },

    wsSend(type, data = {}) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type, data }));
        }
    },

    handleWsMessage(msg) {
        const { type, data } = msg;

        // Participant events
        if (type === 'participant_joined') {
            const exists = this.participants.find(p => p.id === data.id);
            if (!exists) {
                this.participants.push(data);
                this.renderParticipants();
            }
        } else if (type === 'participant_left') {
            // Keep in list but could dim them
        } else if (type === 'error') {
            console.error('Server error:', data.message);
        }

        // Dispatch to registered handlers (retro, poker)
        const handler = this.wsHandlers[type];
        if (handler) handler(data);
    },

    onWs(type, handler) {
        this.wsHandlers[type] = handler;
    },

    // --- History ---
    viewHistory(sessionId) {
        if (typeof History !== 'undefined') {
            History.load(sessionId);
        }
    },

    // --- Utilities ---
    escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    },

    formatTime(seconds) {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}:${s.toString().padStart(2, '0')}`;
    },
};

// --- Event Listeners ---
document.addEventListener('DOMContentLoaded', () => {
    App.showView('home');
    App.loadSessions();

    document.getElementById('create-session-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const name = document.getElementById('session-name').value.trim();
        const scale = document.getElementById('poker-scale').value;
        if (name) App.createSession(name, scale);
    });

    document.getElementById('join-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const name = document.getElementById('participant-name').value.trim();
        if (name) App.joinSession(name);
    });
});
