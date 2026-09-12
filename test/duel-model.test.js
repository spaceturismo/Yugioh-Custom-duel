const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
    buildDeck,
    buildExtraDeck,
    cloneCard,
    createEmptyPlayer,
    shuffle
} = require("../client/duel-model.js");

test("creates an empty player with independent game collections", () => {
    const player = createEmptyPlayer();
    assert.equal(player.lp, 8000);
    assert.deepEqual(player.deck, []);
    assert.deepEqual(player.hand, []);
    assert.deepEqual(player.field, []);
    assert.deepEqual(player.graveyard, []);
    assert.notEqual(player.attackedThisTurn, player.effectUsed);
});

test("clones regular cards without mutating the database", () => {
    const database = { mage: { id: "mage", atk: 1000, def: 800 } };
    const card = cloneCard(database, "mage", () => 1);
    card.atk = 1;
    assert.equal(database.mage.atk, 1000);
});

test("applies signature growth only to signature cards", () => {
    const database = {
        hero: { id: "hero", atk: 1000, def: 800, isSignatureCard: true },
        mage: { id: "mage", atk: 1000, def: 800 }
    };
    const hero = cloneCard(database, "hero", () => 3);
    const mage = cloneCard(database, "mage", () => 3);
    assert.deepEqual(hero, {
        id: "hero",
        atk: 1300,
        def: 1010,
        isSignatureCard: true,
        signatureLevel: 3
    });
    assert.equal(mage.atk, 1000);
});

test("shuffles in place and supports deterministic randomness", () => {
    const deck = ["a", "b", "c"];
    assert.equal(shuffle(deck, () => 0.5), deck);
    assert.deepEqual(deck, ["a", "c", "b"]);
});

test("builds a premade main deck from cloned cards", () => {
    const decks = { starter: { cards: ["mage", "missing", "mage"] } };
    const database = { mage: { id: "mage", atk: 1000, def: 800 } };
    const result = buildDeck(decks, "starter", (id) => cloneCard(database, id, () => 1));

    assert.deepEqual(result.map((card) => card.id), ["mage", "mage"]);
    assert.notEqual(result[0], result[1]);
});

test("builds a premade Extra Deck independently from the main deck", () => {
    const decks = { starter: { cards: ["mage"], extraDeck: ["fusion"] } };
    const database = {
        mage: { id: "mage", atk: 1000, def: 800 },
        fusion: { id: "fusion", atk: 2000, def: 1500 }
    };
    const clone = (id) => cloneCard(database, id, () => 1);

    assert.deepEqual(buildDeck(decks, "starter", clone).map((card) => card.id), ["mage"]);
    assert.deepEqual(buildExtraDeck(decks, "starter", clone).map((card) => card.id), ["fusion"]);
    assert.deepEqual(buildDeck(decks, "unknown", clone), []);
    assert.deepEqual(buildExtraDeck(decks, "unknown", clone), []);
});