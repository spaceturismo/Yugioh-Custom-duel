(function (root, factory) {
    const model = factory();
    if (typeof module === "object" && module.exports) module.exports = model;
    if (root) root.duelDeckStorage = model;
})(typeof globalThis === "undefined" ? this : globalThis, function () {
    function copyDecks(decks) {
        if (!decks || typeof decks !== "object" || Array.isArray(decks)) return {};
        return JSON.parse(JSON.stringify(decks));
    }

    function createDeckStore(storage, key) {
        return {
            list() {
                return copyDecks(storage.read(key, {}));
            },
            save(deck) {
                const decks = this.list();
                decks[deck.name] = {
                    name: deck.name,
                    cards: [...(deck.cards || [])],
                    extraDeck: [...(deck.extraDeck || [])]
                };
                storage.write(key, decks);
            },
            remove(name) {
                const decks = this.list();
                if (!Object.prototype.hasOwnProperty.call(decks, name)) return false;
                delete decks[name];
                storage.write(key, decks);
                return true;
            }
        };
    }

    return { createDeckStore };
});