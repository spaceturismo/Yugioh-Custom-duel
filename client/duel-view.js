(function (root, factory) {
    const model = factory();
    if (typeof module === "object" && module.exports) module.exports = model;
    if (root) root.duelView = model;
})(typeof globalThis === "undefined" ? this : globalThis, function () {
    function projectDuelView(state, playerId) {
        const opponentId = playerId === "player-1" ? "player-2" : "player-1";
        return {
            phase: state.phase,
            currentTurn: state.currentTurn,
            currentPhase: state.currentPhase || null,
            winner: state.winner || null,
            player: {
                lifePoints: state.lifePoints[playerId],
                deckCount: state.deckCounts[playerId],
                handCount: state.handCounts[playerId],
                extraDeckCount: state.extraDeckCounts[playerId],
                hand: state.hands[playerId] || [],
                field: state.fields[playerId] || [],
                graveyard: state.graveyards[playerId] || []
            },
            opponent: {
                lifePoints: state.lifePoints[opponentId],
                deckCount: state.deckCounts[opponentId],
                handCount: state.handCounts[opponentId],
                extraDeckCount: state.extraDeckCounts[opponentId],
                hand: [],
                field: state.fields[opponentId] || [],
                graveyard: state.graveyards[opponentId] || []
            }
        };
    }

    return { projectDuelView };
});
