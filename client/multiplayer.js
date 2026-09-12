(function (root, factory) {
    const model = factory();
    if (typeof module === "object" && module.exports) module.exports = model;
    if (root) root.duelMultiplayer = model;
})(typeof globalThis === "undefined" ? this : globalThis, function () {
    function createMultiplayerClient(transport) {
        let pendingDeckValidation = null;

        return {
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
                if (!pendingDeckValidation) return;
                if (message.type === "deck_validation") {
                    pendingDeckValidation.resolve({ valid: message.valid, errors: message.errors });
                    pendingDeckValidation = null;
                } else if (message.type === "error") {
                    pendingDeckValidation.reject(new Error(message.message));
                    pendingDeckValidation = null;
                }
            }
        };
    }

    return { createMultiplayerClient };
});