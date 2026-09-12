(function (root, factory) {
    const data = factory();
    if (typeof module === "object" && module.exports) module.exports = data;
    if (root) root.duelCardData = data;
})(typeof globalThis === "undefined" ? this : globalThis, function () {
    const VERSION_HISTORY = Object.freeze({
        "1.0": "Original Release",
        "1.1": "Graveyard System",
        "1.2": "Grave Uprising & AI Difficulty",
        "1.5": "Radiant Wardens, Demon's Reckoning & Deck Maker Exclusives",
        "1.6": "Secret Cards",
        "1.7": "Playstyle Expansion",
        "1.8": "Trap Expansion",
        "1.9": "Redeemable Codes",
        "2.0": "Tier Expansion",
        "2.1": "Multiverse",
        "2.2": "Boss Fights",
        Custom: "Your Custom Cards"
    });

    return { VERSION_HISTORY };
});