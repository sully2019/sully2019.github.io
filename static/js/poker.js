// Scrum Poker Module
const Poker = {
    rounds: [],
    currentRound: null,
    myVote: null,
    votedParticipants: new Set(),
    scale: [],

    SCALES: {
        fibonacci: ['1', '2', '3', '5', '8', '13', '21', '?'],
        tshirt: ['XS', 'S', 'M', 'L', 'XL', '?'],
    },

    async init() {
        this.scale = this.SCALES[App.sessionData?.poker_scale] || this.SCALES.fibonacci;
        await this.loadRounds();
        this.registerWsHandlers();
        this.render();
    },

    async loadRounds() {
        try {
            this.rounds = await App.api('GET', `/sessions/${App.sessionId}/rounds`);
            // Set current round to the latest voting round, or the last round
            const votingRound = this.rounds.filter(r => r.status === 'voting').pop();
            this.currentRound = votingRound || this.rounds[this.rounds.length - 1] || null;
            this.myVote = null;
            this.votedParticipants.clear();
        } catch (err) {
            console.error('Failed to load rounds:', err);
        }
    },

    render() {
        const container = document.getElementById('poker-view');
        container.innerHTML = `
            <div class="poker-container">
                ${this.renderStorySection()}
                ${this.currentRound ? this.renderVotingArea() : '<p class="empty-state">No stories to estimate yet.</p>'}
                ${this.renderRoundHistory()}
            </div>
        `;
    },

    renderStorySection() {
        if (!App.isOwner) {
            return this.currentRound
                ? `<div class="poker-story"><h3>${App.escapeHtml(this.currentRound.story_title)}</h3></div>`
                : '';
        }
        return `
            <div class="poker-story">
                ${this.currentRound ? `<h3>${App.escapeHtml(this.currentRound.story_title)}</h3>` : ''}
                <div class="poker-story-form">
                    <input type="text" id="poker-story-input" placeholder="Enter story/task to estimate...">
                    <button class="btn btn-primary btn-small" onclick="Poker.newRound()">New Round</button>
                </div>
            </div>
        `;
    },

    renderVotingArea() {
        if (!this.currentRound) return '';

        const isRevealed = this.currentRound.status === 'revealed';

        return `
            ${!isRevealed ? this.renderCardFan() : ''}
            ${this.renderVoterStatus()}
            ${!isRevealed && App.isOwner ? `
                <div class="poker-actions">
                    <button class="btn btn-primary" onclick="Poker.reveal()">Reveal Votes</button>
                </div>
            ` : ''}
            ${isRevealed ? this.renderResults() : ''}
        `;
    },

    renderCardFan() {
        return `
            <div class="poker-cards">
                ${this.scale.map(val => `
                    <div class="poker-card ${this.myVote === val ? 'selected' : ''}"
                         onclick="Poker.vote('${val}')">
                        ${val}
                    </div>
                `).join('')}
            </div>
        `;
    },

    renderVoterStatus() {
        const isRevealed = this.currentRound?.status === 'revealed';
        const revealedVotes = isRevealed && this.currentRound.votes ? this.currentRound.votes : [];

        return `
            <div class="poker-status">
                <div class="poker-voters">
                    ${App.participants.map(p => {
                        const hasVoted = this.votedParticipants.has(p.id);
                        const revealedVote = revealedVotes.find(v => v.participant_id === p.id);
                        let cardClass, cardContent;

                        if (isRevealed && revealedVote) {
                            cardClass = 'revealed';
                            cardContent = revealedVote.value;
                        } else if (hasVoted) {
                            cardClass = 'hidden';
                            cardContent = '&#10003;';
                        } else {
                            cardClass = 'waiting';
                            cardContent = '?';
                        }

                        return `
                            <div class="poker-voter">
                                <div class="poker-voter-card ${cardClass}">${cardContent}</div>
                                <span class="poker-voter-name">${App.escapeHtml(p.name)}</span>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    },

    renderResults() {
        if (!this.currentRound || this.currentRound.status !== 'revealed') return '';

        const votes = this.currentRound.votes || [];
        const summary = this.currentRound.summary || {};

        return `
            <div class="poker-results">
                <h3>Results</h3>
                ${summary.average !== undefined ? `
                    <div class="poker-results-summary">
                        <div class="poker-stat">
                            <div class="poker-stat-value">${summary.average}</div>
                            <div class="poker-stat-label">Average</div>
                        </div>
                        <div class="poker-stat">
                            <div class="poker-stat-value">${summary.min}</div>
                            <div class="poker-stat-label">Min</div>
                        </div>
                        <div class="poker-stat">
                            <div class="poker-stat-value">${summary.max}</div>
                            <div class="poker-stat-label">Max</div>
                        </div>
                    </div>
                ` : ''}
                <table class="poker-results-table">
                    <thead><tr><th>Participant</th><th>Vote</th></tr></thead>
                    <tbody>
                        ${votes.map(v => `
                            <tr>
                                <td>${App.escapeHtml(v.participant_name)}</td>
                                <td><strong>${App.escapeHtml(v.value)}</strong></td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
                ${App.isOwner && !this.currentRound.final_estimate ? `
                    <div class="poker-estimate-form">
                        <select id="poker-estimate-select">
                            ${this.scale.filter(v => v !== '?').map(v => `<option value="${v}">${v}</option>`).join('')}
                        </select>
                        <button class="btn btn-primary btn-small" onclick="Poker.setEstimate()">Set Estimate</button>
                    </div>
                ` : ''}
                ${this.currentRound.final_estimate ? `
                    <p style="text-align:center; margin-top:1rem; font-weight:600;">
                        Final Estimate: ${App.escapeHtml(this.currentRound.final_estimate)}
                    </p>
                ` : ''}
            </div>
        `;
    },

    renderRoundHistory() {
        const pastRounds = this.rounds.filter(r => r.status === 'revealed' && r.id !== this.currentRound?.id);
        if (pastRounds.length === 0) return '';

        return `
            <div class="poker-rounds-history">
                <h3>Previous Rounds</h3>
                ${pastRounds.map(r => `
                    <div class="poker-round-item">
                        <span>${App.escapeHtml(r.story_title)}</span>
                        <span class="poker-round-estimate">${r.final_estimate || 'No estimate'}</span>
                    </div>
                `).reverse().join('')}
            </div>
        `;
    },

    // --- Actions ---
    vote(value) {
        if (!this.currentRound || this.currentRound.status !== 'voting') return;
        this.myVote = value;
        App.wsSend('poker_vote', { round_id: this.currentRound.id, value });
        // Update card fan selection immediately
        document.querySelectorAll('.poker-card').forEach(el => {
            el.classList.toggle('selected', el.textContent.trim() === value);
        });
    },

    reveal() {
        if (!this.currentRound) return;
        App.wsSend('poker_reveal', { round_id: this.currentRound.id });
    },

    newRound() {
        const input = document.getElementById('poker-story-input');
        const title = input?.value.trim();
        if (!title) return;
        App.wsSend('poker_new_round', { story_title: title });
        input.value = '';
    },

    setEstimate() {
        if (!this.currentRound) return;
        const select = document.getElementById('poker-estimate-select');
        const value = select?.value;
        if (value) {
            App.wsSend('poker_estimate', { round_id: this.currentRound.id, value });
        }
    },

    // --- WS Handlers ---
    registerWsHandlers() {
        App.onWs('poker_round_started', (data) => {
            const round = { ...data, votes: [], vote_count: 0 };
            this.rounds.push(round);
            this.currentRound = round;
            this.myVote = null;
            this.votedParticipants.clear();
            this.render();
        });

        App.onWs('poker_vote_cast', (data) => {
            this.votedParticipants.add(data.participant_id);
            // Update voter display without full re-render
            this.updateVoterDisplay();
        });

        App.onWs('poker_revealed', (data) => {
            if (this.currentRound && this.currentRound.id === data.round_id) {
                this.currentRound.status = 'revealed';
                this.currentRound.votes = data.votes;
                this.currentRound.summary = data.summary;
            }
            // Update in rounds list too
            const round = this.rounds.find(r => r.id === data.round_id);
            if (round) {
                round.status = 'revealed';
                round.votes = data.votes;
                round.summary = data.summary;
            }
            this.render();
        });

        App.onWs('poker_estimated', (data) => {
            const round = this.rounds.find(r => r.id === data.round_id);
            if (round) round.final_estimate = data.value;
            if (this.currentRound && this.currentRound.id === data.round_id) {
                this.currentRound.final_estimate = data.value;
            }
            this.render();
        });
    },

    updateVoterDisplay() {
        const statusEl = document.querySelector('.poker-status');
        if (statusEl) {
            statusEl.outerHTML = this.renderVoterStatus();
        }
    },
};
