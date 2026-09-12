(function (root, factory) {
    const model = factory();
    if (typeof module === "object" && module.exports) module.exports = model;
    if (root) root.duelModel = model;
})(typeof globalThis === "undefined" ? this : globalThis, function () {
    function createEmptyPlayer() {
        return {
            deck: [],
            hand: [],
            field: [],
            spellTrap: [],
            extraDeck: [],
            graveyard: [],
            lp: 8000,
            normalSummoned: false,
            attackedThisTurn: [],
            effectUsed: {}
        };
    }

    function cloneCard(cardDatabase, id, getSignatureCardLevel) {
        const source = cardDatabase[id];
        if (!source) return null;

        if (source.isSignatureCard) {
            const level = getSignatureCardLevel(id);
            const bonus = (level - 1) * 150;
            return {
                ...source,
                atk: source.atk + bonus,
                def: source.def + Math.floor(bonus * 0.7),
                signatureLevel: level
            };
        }

        return { ...source, atk: source.atk, def: source.def };
    }

    function shuffle(deck, random = Math.random) {
        for (let index = deck.length - 1; index > 0; index--) {
            const swapIndex = Math.floor(random() * (index + 1));
            [deck[index], deck[swapIndex]] = [deck[swapIndex], deck[index]];
        }
        return deck;
    }

    function buildDeck(premadeDecks, deckId, cloneCard) {
        const data = premadeDecks[deckId];
        if (!data) return [];
        return data.cards.map(cloneCard).filter(Boolean);
    }

    function buildExtraDeck(premadeDecks, deckId, cloneCard) {
        const data = premadeDecks[deckId];
        if (!data) return [];
        return data.extraDeck.map(cloneCard).filter(Boolean);
    }

    return { buildDeck, buildExtraDeck, createEmptyPlayer, cloneCard, shuffle };
});