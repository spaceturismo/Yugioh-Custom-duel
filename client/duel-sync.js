(function (root, factory) {
    const model = factory();
    if (typeof module === "object" && module.exports) module.exports = model;
    if (root) root.duelSync = model;
})(typeof globalThis === "undefined" ? this : globalThis, function () {
    function createDuelSync(client, renderState) {
        client.onMessage((message) => {
            if (message.type === "room_state") renderState(message.state);
        });
        return {
            playCard(handIndex) { client.playCard(handIndex); },
            attack(attackerIndex, defenderIndex) { client.attack(attackerIndex, defenderIndex); },
            endTurn() { client.endTurn(); }
        };
    }

    return { createDuelSync };
});