(function (root, factory) {
    const model = factory();
    if (typeof module === "object" && module.exports) module.exports = model;
    if (root) root.duelState = model;
})(typeof globalThis === "undefined" ? this : globalThis, function () {
    function createDuelState(createPlayer) {
        return {
            player: createPlayer(),
            opponent: createPlayer(),
            playerTurn: true,
            duelOver: false,
            turnNumber: 1,
            currentPhase: "draw"
        };
    }

    return { createDuelState };
});