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

    function normalizeCustomCard(card) {
        if (!card || typeof card !== "object" || !card.id || !card.name || !VALID_TYPES.has(card.type)) {
            return null;
        }

        const normalized = {
            id: "custom_" + card.id,
            imported: true,
            version: "Custom",
            name: card.name,
            type: card.type,
            effect: (card.description || "A custom-created card.") +
                " (Imported from the Card Creator — flavor text only, no functional effect.)"
        };

        if (card.type === "monster") {
            normalized.attribute = card.attribute || "LIGHT";
            normalized.level = Number(card.level) || 4;
            normalized.monsterType = card.monsterType || "Warrior";
            normalized.isTuner = !!card.tuner;
            normalized.atk = Number(card.attack) || 0;
            normalized.def = Number(card.defense) || 0;
        } else if (card.type === "spell") {
            normalized.spellType = card.spellType || "Normal Spell";
        } else {
            normalized.trapType = card.trapType || "Normal Trap";
        }

        return isValidCard(normalized) ? normalized : null;
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

    return { createCardCatalog, isValidCard, normalizeCustomCard };
});