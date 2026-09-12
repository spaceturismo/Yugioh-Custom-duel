import { strict as assert } from "node:assert";
import { test } from "node:test";
import { createRoomState, drawCard, endTurn, startGame } from "../server/src/domain";
import { parseClientMessage } from "../server/src/protocol";
import {
    DEFAULT_DECK_RULES,
    isValidCardRecord,
    validateDeck,
    validateDeckCards
} from "../server/src/card-model";
import { loadDeckRules } from "../server/src/config";

test("creates a fresh room with standard starting values", () => {
    const state = createRoomState("ABC123");

    assert.equal(state.roomId, "ABC123");
    assert.equal(state.phase, "waiting");
    assert.deepEqual(state.players, []);
    assert.equal(state.currentTurn, null);
    assert.deepEqual(state.lifePoints, { "player-1": 8000, "player-2": 8000 });
    assert.deepEqual(state.deckCounts, { "player-1": 40, "player-2": 40 });
    assert.deepEqual(state.handCounts, { "player-1": 5, "player-2": 5 });
});

test("requires two players before starting and gives player one the first turn", () => {
    const state = createRoomState("ABC123");
    assert.equal(startGame(state), "Two players are required to start.");

    state.players.push("player-1", "player-2");
    assert.equal(startGame(state), null);
    assert.equal(state.phase, "active");
    assert.equal(state.currentTurn, "player-1");
});

test("draw changes only the active player's deck and hand", () => {
    const state = createRoomState("ABC123");
    state.players.push("player-1", "player-2");
    startGame(state);

    assert.equal(drawCard(state, "player-1"), null);
    assert.equal(state.deckCounts["player-1"], 39);
    assert.equal(state.handCounts["player-1"], 6);
    assert.equal(state.deckCounts["player-2"], 40);
    assert.equal(drawCard(state, "player-2"), "It is not your turn.");
});

test("end turn transfers authority to the other player", () => {
    const state = createRoomState("ABC123");
    state.players.push("player-1", "player-2");
    startGame(state);

    assert.equal(endTurn(state, "player-1"), null);
    assert.equal(state.currentTurn, "player-2");
    assert.equal(endTurn(state, "player-1"), "It is not your turn.");
});

test("accepts protocol messages with only supported fields", () => {
    assert.deepEqual(parseClientMessage('{"type":"join_room","roomId":"abc123"}'), {
        type: "join_room",
        roomId: "abc123"
    });
    assert.deepEqual(parseClientMessage('{"type":"draw","extra":"ignored"}'), {
        type: "draw"
    });
});

test("rejects malformed or unsupported protocol messages", () => {
    assert.equal(parseClientMessage("not json"), null);
    assert.equal(parseClientMessage("null"), null);
    assert.equal(parseClientMessage('{"type":42}'), null);
    assert.equal(parseClientMessage('{"type":"join_room"}'), null);
    assert.equal(parseClientMessage('{"type":"unknown"}'), null);
});

test("parses deck validation requests with both deck sections", () => {
    assert.deepEqual(parseClientMessage('{"type":"validate_deck","mainDeck":[],"extraDeck":[]}'), {
        type: "validate_deck",
        mainDeck: [],
        extraDeck: []
    });
    assert.equal(parseClientMessage('{"type":"validate_deck","mainDeck":[]}'), null);
});

test("accepts the common card contract for built-in and custom cards", () => {
    assert.equal(isValidCardRecord({ id: "mage", name: "Mage", type: "monster", atk: 1000, def: 800 }), true);
    assert.equal(isValidCardRecord({ id: "custom_1", name: "Boost", type: "spell" }), true);
});

test("rejects card records that could not be safely played", () => {
    assert.equal(isValidCardRecord(null), false);
    assert.equal(isValidCardRecord({ id: "", name: "Mage", type: "monster" }), false);
    assert.equal(isValidCardRecord({ id: "mage", name: "", type: "monster" }), false);
    assert.equal(isValidCardRecord({ id: "mage", name: "Mage", type: "ritual" }), false);
    assert.equal(isValidCardRecord({ id: "mage", name: "Mage", type: "monster", atk: "1000" }), false);
});

test("validates a deck as a collection of card records", () => {
    const cards = [
        { id: "mage", name: "Mage", type: "monster", atk: 1000, def: 800 },
        { id: "boost", name: "Boost", type: "spell" }
    ];

    assert.deepEqual(validateDeckCards(cards), { valid: true, invalidIndexes: [] });
    assert.deepEqual(validateDeckCards([...cards, { id: "bad", name: "", type: "monster" }]), {
        valid: false,
        invalidIndexes: [2]
    });
    assert.deepEqual(validateDeckCards("not a deck"), { valid: false, invalidIndexes: [] });
});

test("accepts configured main and Extra Deck boundary sizes", () => {
    const card = { id: "mage", name: "Mage", type: "monster", atk: 1000, def: 800 } as const;
    const deck = Array.from({ length: DEFAULT_DECK_RULES.maxMainDeckSize }, () => card);
    const extraDeck = Array.from({ length: DEFAULT_DECK_RULES.maxExtraDeckSize }, () => card);

    assert.deepEqual(validateDeck(deck, extraDeck), { valid: true, errors: [] });
});

test("rejects decks over configured limits and reports the affected section", () => {
    const card = { id: "mage", name: "Mage", type: "monster" };
    const result = validateDeck(
        Array.from({ length: 61 }, () => card),
        Array.from({ length: 16 }, () => card)
    );

    assert.deepEqual(result, {
        valid: false,
        errors: ["Main Deck cannot exceed 60 cards.", "Extra Deck cannot exceed 15 cards."]
    });
});

test("applies the same card validation to custom cards and tournament rule overrides", () => {
    const customCard = { id: "custom_1", name: "Custom Mage", type: "monster", atk: 500, def: 400 };
    const rules = { maxMainDeckSize: 2, maxExtraDeckSize: 1 };

    assert.deepEqual(validateDeck([customCard, customCard], [], rules), { valid: true, errors: [] });
    assert.deepEqual(validateDeck([customCard, { id: "custom_bad", name: "", type: "monster" }], [], rules), {
        valid: false,
        errors: ["Main Deck contains invalid card records at indexes: 1."]
    });
});

test("loads default deck rules when environment settings are absent", () => {
    assert.deepEqual(loadDeckRules({}), DEFAULT_DECK_RULES);
});

test("loads positive tournament deck limits and ignores invalid settings", () => {
    assert.deepEqual(loadDeckRules({ MAIN_DECK_MAX: "45", EXTRA_DECK_MAX: "8" }), {
        maxMainDeckSize: 45,
        maxExtraDeckSize: 8
    });
    assert.deepEqual(loadDeckRules({ MAIN_DECK_MAX: "-1", EXTRA_DECK_MAX: "nope" }), DEFAULT_DECK_RULES);
});