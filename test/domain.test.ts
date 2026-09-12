import { strict as assert } from "node:assert";
import { test } from "node:test";
import { advancePhase, createRoomState, drawCard, endTurn, startGame } from "../server/src/domain";
import { parseClientMessage } from "../server/src/protocol";
import {
    DEFAULT_DECK_RULES,
    isValidCardRecord,
    validateDeck,
    validateDeckCards
} from "../server/src/card-model";
import { loadDeckRules } from "../server/src/config";
import { attack, playCard, selectDeck, setPlayerReady } from "../server/src/domain";
import { RoomManager } from "../server/src/rooms";

test("creates a fresh room with standard starting values", () => {
    const state = createRoomState("ABC123");

    assert.equal(state.roomId, "ABC123");
    assert.equal(state.phase, "waiting");
    assert.deepEqual(state.players, []);
    assert.equal(state.currentTurn, null);
    assert.equal(state.winner, null);
    assert.deepEqual(state.lifePoints, { "player-1": 8000, "player-2": 8000 });
    assert.deepEqual(state.deckCounts, { "player-1": 40, "player-2": 40 });
    assert.deepEqual(state.handCounts, { "player-1": 5, "player-2": 5 });
    assert.deepEqual(state.extraDeckCounts, { "player-1": 0, "player-2": 0 });
    assert.deepEqual(state.ready, { "player-1": false, "player-2": false });
});

test("requires two players before starting and gives player one the first turn", () => {
    const state = createRoomState("ABC123");
    assert.equal(startGame(state), "Two players are required to start.");

    state.players.push("player-1", "player-2");
    setPlayerReady(state, "player-1", true);
    setPlayerReady(state, "player-2", true);
    assert.equal(startGame(state), null);
    assert.equal(state.phase, "active");
    assert.equal(state.currentTurn, "player-1");
    assert.equal(state.currentPhase, "draw");
});

test("draw changes only the active player's deck and hand", () => {
    const state = createRoomState("ABC123");
    state.players.push("player-1", "player-2");
    setPlayerReady(state, "player-1", true);
    setPlayerReady(state, "player-2", true);
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
    setPlayerReady(state, "player-1", true);
    setPlayerReady(state, "player-2", true);
    startGame(state);

    assert.equal(drawCard(state, "player-1"), null);
    assert.equal(advancePhase(state, "player-1"), null);
    assert.equal(advancePhase(state, "player-1"), null);
    assert.equal(advancePhase(state, "player-1"), null);
    assert.equal(endTurn(state, "player-1"), null);
    assert.equal(state.currentTurn, "player-2");
    assert.equal(state.currentPhase, "draw");
    assert.equal(endTurn(state, "player-1"), "It is not your turn.");
});

test("enforces the phase transition order and turn ownership", () => {
    const state = createRoomState("ABC123");
    state.players.push("player-1", "player-2");
    setPlayerReady(state, "player-1", true);
    setPlayerReady(state, "player-2", true);
    startGame(state);

    assert.equal(advancePhase(state, "player-1"), null);
    assert.equal(state.currentPhase, "main1");
    assert.equal(advancePhase(state, "player-1"), null);
    assert.equal(state.currentPhase, "battle");
    assert.equal(advancePhase(state, "player-1"), null);
    assert.equal(state.currentPhase, "main2");
    assert.equal(advancePhase(state, "player-1"), null);
    assert.equal(state.currentPhase, "end");
    assert.equal(advancePhase(state, "player-1"), null);
    assert.equal(state.currentPhase, "draw");
    assert.equal(state.currentTurn, "player-2");
    assert.equal(advancePhase(state, "player-1"), "It is not your turn.");
});

test("accepts protocol messages with only supported fields", () => {
    assert.deepEqual(parseClientMessage('{"type":"join_room","roomId":"abc123"}'), {
        type: "join_room",
        roomId: "abc123"
    });
    assert.deepEqual(parseClientMessage('{"type":"draw","extra":"ignored"}'), {
        type: "draw"
    });
    assert.deepEqual(parseClientMessage('{"type":"advance_phase"}'), {
        type: "advance_phase"
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

test("requires both players to be ready before starting", () => {
    const state = createRoomState("ABC123");
    state.players.push("player-1", "player-2");

    assert.equal(startGame(state), "Both players must be ready to start.");
});

test("starts with the player chosen by the first-player chooser", () => {
    const state = createRoomState("ABC123");
    state.players.push("player-1", "player-2");
    const card = { id: "mage", name: "Mage", type: "monster" };
    selectDeck(state, "player-1", Array.from({ length: 6 }, () => card), []);
    selectDeck(state, "player-2", Array.from({ length: 6 }, () => card), []);
    setPlayerReady(state, "player-1", true);
    setPlayerReady(state, "player-2", true);

    assert.equal(startGame(state, () => "player-2"), null);
    assert.equal(state.currentTurn, "player-2");
    assert.equal(state.currentPhase, "draw");
});

test("selects validated decks and synchronizes readiness", () => {
    const state = createRoomState("ABC123");
    state.players.push("player-1", "player-2");
    const card = { id: "mage", name: "Mage", type: "monster" };
    const mainDeck = Array.from({ length: 60 }, () => card);
    const extraDeck = Array.from({ length: 15 }, () => card);

    assert.equal(selectDeck(state, "player-1", mainDeck, extraDeck), null);
    assert.equal(state.deckCounts["player-1"], 60);
    assert.equal(state.extraDeckCounts["player-1"], 15);
    assert.equal(state.ready["player-1"], false);
    assert.equal(setPlayerReady(state, "player-1", true), null);
    assert.equal(state.ready["player-1"], true);
    assert.equal(selectDeck(state, "player-1", Array.from({ length: 61 }, () => card), []), "Main Deck cannot exceed 60 cards.");
});

test("parses deck selection and readiness requests", () => {
    assert.deepEqual(parseClientMessage('{"type":"select_deck","mainDeck":[],"extraDeck":[]}'), {
        type: "select_deck",
        mainDeck: [],
        extraDeck: []
    });
    assert.deepEqual(parseClientMessage('{"type":"set_ready","ready":true}'), {
        type: "set_ready",
        ready: true
    });
    assert.equal(parseClientMessage('{"type":"set_ready","ready":"yes"}'), null);
    assert.deepEqual(parseClientMessage('{"type":"play_card","handIndex":0}'), {
        type: "play_card",
        handIndex: 0
    });
    assert.equal(parseClientMessage('{"type":"play_card","handIndex":-1}'), null);
    assert.deepEqual(parseClientMessage('{"type":"attack","attackerIndex":0,"defenderIndex":1}'), {
        type: "attack",
        attackerIndex: 0,
        defenderIndex: 1
    });
    assert.equal(parseClientMessage('{"type":"attack","attackerIndex":0}'), null);
});

test("owns submitted decks and deals an initial hand when the game starts", () => {
    const state = createRoomState("ABC123");
    state.players.push("player-1", "player-2");
    const card = { id: "mage", name: "Mage", type: "monster" };
    const mainDeck = Array.from({ length: 10 }, (_, index) => ({ ...card, id: `mage-${index}` }));

    assert.equal(selectDeck(state, "player-1", mainDeck, []), null);
    assert.equal(selectDeck(state, "player-2", mainDeck, []), null);
    setPlayerReady(state, "player-1", true);
    setPlayerReady(state, "player-2", true);
    assert.equal(startGame(state), null);
    assert.equal(state.hands["player-1"].length, 5);
    assert.equal(state.decks["player-1"].length, 5);
    assert.notEqual(state.hands["player-1"][0], state.hands["player-2"][0]);
});

test("draw moves one server-owned card from deck to hand", () => {
    const state = createRoomState("ABC123");
    state.players.push("player-1", "player-2");
    const deck = Array.from({ length: 6 }, (_, index) => ({ id: `mage-${index}`, name: "Mage", type: "monster" }));
    selectDeck(state, "player-1", deck, []);
    selectDeck(state, "player-2", deck, []);
    setPlayerReady(state, "player-1", true);
    setPlayerReady(state, "player-2", true);
    startGame(state);

    assert.equal(drawCard(state, "player-1"), null);
    assert.equal(state.hands["player-1"].length, 6);
    assert.equal(state.decks["player-1"].length, 0);
    assert.equal(state.hands["player-1"].at(-1).id, "mage-5");
});

test("plays a card from the active player's hand onto their field", () => {
    const state = createRoomState("ABC123");
    state.players.push("player-1", "player-2");
    const deck = Array.from({ length: 6 }, (_, index) => ({ id: `mage-${index}`, name: "Mage", type: "monster" as const }));
    selectDeck(state, "player-1", deck, []);
    selectDeck(state, "player-2", deck, []);
    setPlayerReady(state, "player-1", true);
    setPlayerReady(state, "player-2", true);
    startGame(state);

    assert.equal(drawCard(state, "player-1"), null);
    assert.equal(playCard(state, "player-1", 0), null);
    assert.equal(state.hands["player-1"].length, 5);
    assert.equal(state.fields["player-1"].length, 1);
    assert.equal(state.fields["player-1"][0].id, "mage-0");
    assert.equal(playCard(state, "player-2", 0), "It is not your turn.");
    assert.equal(playCard(state, "player-1", 9), "Card was not found in your hand.");
});

test("resolves a field attack with server-owned life points", () => {
    const state = createRoomState("ABC123");
    state.players.push("player-1", "player-2");
    const attacker = { id: "attacker", name: "Attacker", type: "monster" as const, atk: 1800, def: 1200 };
    const defender = { id: "defender", name: "Defender", type: "monster" as const, atk: 1400, def: 1000 };
    state.decks["player-1"] = [attacker];
    state.decks["player-2"] = [defender];
    state.players.forEach((playerId) => setPlayerReady(state, playerId, true));
    startGame(state);
    drawCard(state, "player-1");
    advancePhase(state, "player-1");
    state.fields["player-1"].push(state.hands["player-1"].pop());
    state.fields["player-2"].push(state.hands["player-2"].pop());

    advancePhase(state, "player-1");
    assert.equal(attack(state, "player-1", 0, "player-2", 0), null);
    assert.equal(state.lifePoints["player-2"], 7600);
    assert.equal(state.fields["player-2"].length, 0);
    assert.equal(state.graveyards["player-2"].length, 1);
    assert.equal(attack(state, "player-2", 0, "player-1", 0), "It is not your turn.");
});

test("finishes the duel and records the winner when an attack reaches zero life points", () => {
    const state = createRoomState("ABC123");
    state.players.push("player-1", "player-2");
    const attacker = { id: "attacker", name: "Attacker", type: "monster" as const, atk: 1800 };
    const defender = { id: "defender", name: "Defender", type: "monster" as const, atk: 1000 };
    state.decks["player-1"] = [attacker];
    state.decks["player-2"] = [defender];
    state.players.forEach((playerId) => setPlayerReady(state, playerId, true));
    startGame(state);
    drawCard(state, "player-1");
    advancePhase(state, "player-1");
    state.fields["player-1"].push(state.hands["player-1"].pop());
    state.fields["player-2"].push(state.hands["player-2"].pop());
    state.lifePoints["player-2"] = 800;

    advancePhase(state, "player-1");
    assert.equal(attack(state, "player-1", 0, "player-2", 0), null);
    assert.equal(state.lifePoints["player-2"], 0);
    assert.equal(state.phase, "finished");
    assert.equal(state.winner, "player-1");
    assert.equal(attack(state, "player-1", 0, "player-2", 0), "The game has not started.");
});

test("reuses the available player slot when a waiting player leaves", () => {
    const manager = new RoomManager();
    const room = manager.create();
    const firstSocket = {} as import("ws").WebSocket;
    const secondSocket = {} as import("ws").WebSocket;
    const replacementSocket = {} as import("ws").WebSocket;

    assert.equal(manager.join(room, firstSocket), "player-1");
    assert.equal(manager.join(room, secondSocket), "player-2");
    assert.equal(manager.leave(firstSocket), room);
    assert.deepEqual(room.state.players, ["player-2"]);
    assert.equal(manager.join(room, replacementSocket), "player-1");
    assert.equal(room.sockets.get("player-1"), replacementSocket);
    assert.equal(manager.count(), 1);
});