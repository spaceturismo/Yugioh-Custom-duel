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
            draw() { client.draw(); },
            advancePhase() { client.advancePhase(); },
            playCard(handIndex) { client.playCard(handIndex); },
            summon(handIndex, tributeIndexes, position) { client.summon(handIndex, tributeIndexes, position); },
            activate(handIndex) { client.activate(handIndex); },
            changePosition(fieldIndex) { client.changePosition(fieldIndex); },
            fusionSummon(extraIndex, materialIndexes) { client.fusionSummon(extraIndex, materialIndexes); },
            attack(attackerIndex, defenderIndex) { client.attack(attackerIndex, defenderIndex); },
            endTurn() { client.endTurn(); }
        };
    }

    return { createDuelSync };
});