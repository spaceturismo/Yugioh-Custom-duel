import { strict as assert } from "node:assert";
import { test } from "node:test";
import { createRoomState, drawCard, endTurn, startGame } from "../server/src/domain";

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