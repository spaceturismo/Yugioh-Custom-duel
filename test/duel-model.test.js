const assert = require("node:assert/strict");
const { test } = require("node:test");
const { cloneCard, createEmptyPlayer, shuffle } = require("../client/duel-model.js");

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
    assert.deepEqual(deck, ["b", "c", "a"]);
});