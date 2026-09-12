import { strict as assert } from "node:assert";
import { test } from "node:test";
import { createRoomState, drawCard, endTurn, startGame } from "../server/src/domain";
import { parseClientMessage } from "../server/src/protocol";
import { isValidCardRecord } from "../server/src/card-model";

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