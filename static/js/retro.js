// Retro Board Module
const Retro = {
    cards: [],
    timerInterval: null,
    timerRemaining: 0,
    timerRunning: false,

    async init() {
        this.renderBoard();
        await this.loadCards();
        this.registerWsHandlers();
    },

    renderBoard() {
        const container = document.getElementById('retro-view');
        container.innerHTML = `
            <div class="retro-board">
                ${this.renderColumn('went_well', 'What Went Well')}
                ${this.renderColumn('didnt_go_well', "What Didn't Go Well")}
                ${this.renderColumn('action_items', 'Action Items')}
            </div>
            <div class="timer-bar">
                <span class="timer-display" id="timer-display">5:00</span>
                ${App.isOwner ? `
                    <div class="timer-presets">
                        <button class="btn btn-small btn-secondary" onclick="Retro.startTimer(120)">2m</button>
                        <button class="btn btn-small btn-secondary" onclick="Retro.startTimer(300)">5m</button>
                        <button class="btn btn-small btn-secondary" onclick="Retro.startTimer(600)">10m</button>
                    </div>
                    <button class="btn btn-small btn-primary" id="timer-toggle-btn" onclick="Retro.toggleTimer()">Start</button>
                    <button class="btn btn-small btn-secondary" onclick="Retro.resetTimer()">Reset</button>
                ` : ''}
            </div>
        `;
    },

    renderColumn(column, title) {
        return `
            <div class="retro-column col-${column}">
                <div class="retro-column-header">${title}</div>
                <div class="retro-add-form">
                    <textarea id="add-${column}" placeholder="Add a card..." onkeydown="Retro.handleKeydown(event, '${column}')"></textarea>
                    <button class="btn btn-small btn-primary" onclick="Retro.addCard('${column}')">Add</button>
                </div>
                <div class="retro-cards" id="cards-${column}"></div>
            </div>
        `;
    },

    async loadCards() {
        try {
            const cards = await App.api('GET', `/sessions/${App.sessionId}/cards?participant_id=${App.participantId}`);
            this.cards = cards;
            this.renderAllCards();
        } catch (err) {
            console.error('Failed to load cards:', err);
        }
    },

    renderAllCards() {
        ['went_well', 'didnt_go_well', 'action_items'].forEach(col => {
            const container = document.getElementById(`cards-${col}`);
            if (!container) return;
            const colCards = this.cards.filter(c => c.column === col);
            container.innerHTML = colCards.map(c => this.renderCard(c)).join('');
        });
    },

    renderCard(card) {
        const isAuthor = card.participant_id === App.participantId;
        const canDelete = isAuthor || App.isOwner;
        const voted = card.voter_ids ? card.voter_ids.includes(App.participantId) : card.voted_by_me;

        return `
            <div class="retro-card" id="card-${card.id}">
                <div class="retro-card-text">${App.escapeHtml(card.text)}</div>
                <div class="retro-card-footer">
                    <span class="retro-card-author">${App.escapeHtml(card.participant_name)}</span>
                    <div class="retro-card-actions">
                        <button class="vote-btn ${voted ? 'voted' : ''}" onclick="Retro.voteCard('${card.id}')">
                            &#9650; ${card.vote_count}
                        </button>
                        ${canDelete ? `<button class="btn-icon delete-btn" onclick="Retro.deleteCard('${card.id}')" title="Delete">&#10005;</button>` : ''}
                    </div>
                </div>
            </div>
        `;
    },

    handleKeydown(event, column) {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            this.addCard(column);
        }
    },

    addCard(column) {
        const textarea = document.getElementById(`add-${column}`);
        const text = textarea.value.trim();
        if (!text) return;
        App.wsSend('card_add', { column, text });
        textarea.value = '';
    },

    voteCard(cardId) {
        App.wsSend('card_vote', { card_id: cardId });
    },

    deleteCard(cardId) {
        App.wsSend('card_delete', { card_id: cardId });
    },

    registerWsHandlers() {
        App.onWs('card_added', (data) => {
            // Add to local state
            const card = { ...data, voter_ids: [] };
            this.cards.push(card);
            const container = document.getElementById(`cards-${card.column}`);
            if (container) {
                container.insertAdjacentHTML('beforeend', this.renderCard(card));
            }
        });

        App.onWs('card_edited', (data) => {
            const card = this.cards.find(c => c.id === data.card_id);
            if (card) {
                card.text = data.text;
                const el = document.querySelector(`#card-${data.card_id} .retro-card-text`);
                if (el) el.textContent = data.text;
            }
        });

        App.onWs('card_deleted', (data) => {
            this.cards = this.cards.filter(c => c.id !== data.card_id);
            const el = document.getElementById(`card-${data.card_id}`);
            if (el) el.remove();
        });

        App.onWs('card_voted', (data) => {
            const card = this.cards.find(c => c.id === data.card_id);
            if (card) {
                card.vote_count = data.vote_count;
                card.voter_ids = data.voter_ids;
                // Re-render this card in place
                const el = document.getElementById(`card-${data.card_id}`);
                if (el) {
                    el.outerHTML = this.renderCard(card);
                }
            }
        });

        // Timer events
        App.onWs('timer_started', (data) => {
            this.timerRemaining = data.seconds;
            this.timerRunning = true;
            this.startCountdown();
            this.updateTimerToggleBtn();
        });

        App.onWs('timer_stopped', (data) => {
            this.timerRemaining = data.remaining;
            this.timerRunning = false;
            this.stopCountdown();
            this.updateTimerDisplay();
            this.updateTimerToggleBtn();
        });

        App.onWs('timer_reset', () => {
            this.timerRemaining = 0;
            this.timerRunning = false;
            this.stopCountdown();
            this.updateTimerDisplay();
            this.updateTimerToggleBtn();
        });
    },

    // --- Timer ---
    startTimer(seconds) {
        App.wsSend('timer_start', { seconds });
    },

    toggleTimer() {
        if (this.timerRunning) {
            App.wsSend('timer_stop', { remaining: this.timerRemaining });
        } else if (this.timerRemaining > 0) {
            App.wsSend('timer_start', { seconds: this.timerRemaining });
        } else {
            App.wsSend('timer_start', { seconds: 300 });
        }
    },

    resetTimer() {
        App.wsSend('timer_reset', {});
    },

    startCountdown() {
        this.stopCountdown();
        this.updateTimerDisplay();
        this.timerInterval = setInterval(() => {
            if (this.timerRemaining > 0) {
                this.timerRemaining--;
                this.updateTimerDisplay();
            } else {
                this.stopCountdown();
                this.timerRunning = false;
                this.updateTimerToggleBtn();
            }
        }, 1000);
    },

    stopCountdown() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
    },

    updateTimerDisplay() {
        const el = document.getElementById('timer-display');
        if (!el) return;
        el.textContent = App.formatTime(this.timerRemaining);
        el.classList.remove('warning', 'danger');
        if (this.timerRemaining > 0 && this.timerRemaining <= 30) {
            el.classList.add('danger');
        } else if (this.timerRemaining > 0 && this.timerRemaining <= 60) {
            el.classList.add('warning');
        }
    },

    updateTimerToggleBtn() {
        const btn = document.getElementById('timer-toggle-btn');
        if (btn) {
            btn.textContent = this.timerRunning ? 'Stop' : 'Start';
        }
    },
};
