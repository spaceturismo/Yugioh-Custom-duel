(function (root, factory) {
    const model = factory();
    if (typeof module === "object" && module.exports) module.exports = model;
    if (root) root.duelMultiplayer = model;
})(typeof globalThis === "undefined" ? this : globalThis, function () {
    function createMultiplayerClient(transport) {
        let pendingDeckValidation = null;
        const listeners = new Set();

        return {
            createRoom() {
                transport.send({ type: "create_room" });
            },
            joinRoom(roomId) {
                transport.send({ type: "join_room", roomId });
            },
            startGame() {
                transport.send({ type: "start_game" });
            },
            draw() {
                transport.send({ type: "draw" });
            },
            endTurn() {
                transport.send({ type: "end_turn" });
            },
            onMessage(listener) {
                listeners.add(listener);
                return () => listeners.delete(listener);
            },
            validateDeck(mainDeck, extraDeck) {
                if (pendingDeckValidation) {
                    return Promise.reject(new Error("A deck validation request is already pending."));
                }
                const promise = new Promise((resolve, reject) => {
                    pendingDeckValidation = { resolve, reject };
                });
                transport.send({ type: "validate_deck", mainDeck, extraDeck });
                return promise;
            },
            receive(message) {
                if (pendingDeckValidation && message.type === "deck_validation") {
                    pendingDeckValidation.resolve({ valid: message.valid, errors: message.errors });
                    pendingDeckValidation = null;
                } else if (pendingDeckValidation && message.type === "error") {
                    pendingDeckValidation.reject(new Error(message.message));
                    pendingDeckValidation = null;
                }
                listeners.forEach((listener) => listener(message));
            }
        };
    }

    return { createMultiplayerClient };
});