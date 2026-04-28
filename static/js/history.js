// Session History Module
const History = {
    async load(sessionId) {
        App.showView('history');
        const container = document.getElementById('history-content');
        container.innerHTML = '<p class="empty-state">Loading...</p>';

        try {
            const [session, cards, rounds] = await Promise.all([
                App.api('GET', `/sessions/${sessionId}`),
                App.api('GET', `/sessions/${sessionId}/cards`),
                App.api('GET', `/sessions/${sessionId}/rounds`),
            ]);

            container.innerHTML = `
                <div class="history-session-header">
                    <h2>${App.escapeHtml(session.name)}</h2>
                    <p class="session-meta">
                        ${new Date(session.created_at).toLocaleDateString()} &middot;
                        ${session.participant_count} participants &middot;
                        ${session.poker_scale}
                    </p>
                </div>

                <h3>Retro Board</h3>
                <div class="history-columns">
                    ${this.renderHistoryColumn('went_well', 'What Went Well', cards)}
                    ${this.renderHistoryColumn('didnt_go_well', "What Didn't Go Well", cards)}
                    ${this.renderHistoryColumn('action_items', 'Action Items', cards)}
                </div>

                ${rounds.length > 0 ? `
                    <h3>Scrum Poker</h3>
                    ${rounds.map(r => this.renderHistoryRound(r)).join('')}
                ` : ''}
            `;
        } catch (err) {
            container.innerHTML = `<p class="empty-state">Failed to load session: ${err.message}</p>`;
        }
    },

    renderHistoryColumn(column, title, cards) {
        const colCards = cards.filter(c => c.column === column);
        return `
            <div class="history-column">
                <h4 style="margin-bottom:0.5rem">${title}</h4>
                ${colCards.length === 0 ? '<p class="empty-state" style="padding:0.5rem">No cards</p>' : ''}
                ${colCards.map(c => `
                    <div class="history-card">
                        <div>${App.escapeHtml(c.text)}</div>
                        <div class="history-card-votes">
                            ${c.participant_name} &middot; ${c.vote_count} vote${c.vote_count !== 1 ? 's' : ''}
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    },

    renderHistoryRound(round) {
        return `
            <div class="card" style="margin-bottom:0.75rem">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.5rem">
                    <strong>${App.escapeHtml(round.story_title)}</strong>
                    <span class="poker-round-estimate">${round.final_estimate || (round.status === 'revealed' ? 'No estimate set' : 'Voting')}</span>
                </div>
                ${round.votes.length > 0 ? `
                    <table class="poker-results-table">
                        <thead><tr><th>Participant</th><th>Vote</th></tr></thead>
                        <tbody>
                            ${round.votes.map(v => `
                                <tr>
                                    <td>${App.escapeHtml(v.participant_name)}</td>
                                    <td><strong>${App.escapeHtml(v.value)}</strong></td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                ` : ''}
            </div>
        `;
    },
};
