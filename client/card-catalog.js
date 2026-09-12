(function (root, factory) {
    const model = factory();
    if (typeof module === "object" && module.exports) module.exports = model;
    if (root) root.cardCatalog = model;
})(typeof globalThis === "undefined" ? this : globalThis, function () {
    const VALID_TYPES = new Set(["monster", "spell", "trap"]);

    function clone(card) {
        return card ? { ...card } : null;
    }

    function isValidCard(card) {
        return Boolean(
            card &&
            typeof card.id === "string" &&
            card.id.length > 0 &&
            typeof card.name === "string" &&
            card.name.trim().length > 0 &&
            VALID_TYPES.has(card.type)
        );
    }

    function createCardCatalog(builtIns = {}) {
        const cards = {};
        Object.values(builtIns).forEach((card) => {
            if (isValidCard(card)) cards[card.id] = clone(card);
        });

        return {
            cards,
            get(id) {
                return clone(cards[id]);
            },
            ids() {
                return Object.keys(cards);
            },
            registerCustom(card) {
                if (!isValidCard(card) || !card.id.startsWith("custom_")) return false;
                cards[card.id] = clone(card);
                return true;
            },
            removeCustom(id) {
                if (!id.startsWith("custom_") || !cards[id]) return false;
                delete cards[id];
                return true;
            }
        };
    }

    return { createCardCatalog, isValidCard };
});