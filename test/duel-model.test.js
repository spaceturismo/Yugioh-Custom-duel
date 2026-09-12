const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
    buildDeck,
    buildExtraDeck,
    cloneCard,
    createEmptyPlayer,
    shuffle
} = require("../client/duel-model.js");
const { createCardCatalog, normalizeCustomCard } = require("../client/card-catalog.js");
const { createJsonStorage } = require("../client/storage.js");
const { createDuelState } = require("../client/duel-state.js");
const { createMultiplayerClient } = require("../client/multiplayer.js");
const { createDeckStore } = require("../client/deck-storage.js");
const { createLobbyController } = require("../client/lobby.js");
const { createDuelSync } = require("../client/duel-sync.js");
const { projectDuelView } = require("../client/duel-view.js");
const { VERSION_HISTORY, createCardDatabase } = require("../client/card-data.js");

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

test("catalog exposes built-in cards without allowing callers to mutate them", () => {
    const source = { mage: { id: "mage", name: "Mage", type: "monster", atk: 1000, def: 800 } };
    const catalog = createCardCatalog(source);
    const card = catalog.get("mage");

    card.name = "Changed";
    assert.equal(catalog.get("mage").name, "Mage");
    assert.deepEqual(catalog.ids(), ["mage"]);
});

test("catalog supports validated custom cards and replacement", () => {
    const catalog = createCardCatalog({});
    const customCard = { id: "custom_1", name: "My Card", type: "monster", atk: 500, def: 400 };

    assert.equal(catalog.registerCustom(customCard), true);
    assert.deepEqual(catalog.get("custom_1"), customCard);
    assert.equal(catalog.registerCustom({ ...customCard, name: "Updated" }), true);
    assert.equal(catalog.get("custom_1").name, "Updated");
    assert.equal(catalog.registerCustom({ id: "bad", name: "", type: "unknown" }), false);
    assert.equal(catalog.removeCustom("custom_1"), true);
    assert.equal(catalog.get("custom_1"), null);
});

test("normalizes creator monster cards into playable catalog cards", () => {
    const card = normalizeCustomCard({
        id: "42",
        name: "Solar Knight",
        type: "monster",
        description: "A bright champion.",
        attribute: "LIGHT",
        level: "6",
        monsterType: "Warrior",
        tuner: true,
        attack: "1800",
        defense: "1200"
    });

    assert.deepEqual(card, {
        id: "custom_42",
        imported: true,
        version: "Custom",
        name: "Solar Knight",
        type: "monster",
        attribute: "LIGHT",
        level: 6,
        monsterType: "Warrior",
        isTuner: true,
        atk: 1800,
        def: 1200,
        effect: "A bright champion. (Imported from the Card Creator — flavor text only, no functional effect.)"
    });
});

test("normalizes spell and trap cards and rejects unsupported creator cards", () => {
    assert.equal(normalizeCustomCard({ id: "spell", name: "Boost", type: "spell", spellType: "Quick-Play" }).spellType, "Quick-Play");
    assert.equal(normalizeCustomCard({ id: "trap", name: "Wall", type: "trap", trapType: "Counter Trap" }).trapType, "Counter Trap");
    assert.equal(normalizeCustomCard({ id: "bad", name: "", type: "monster" }), null);
    assert.equal(normalizeCustomCard({ id: "bad", name: "Bad", type: "ritual" }), null);
});

test("reads JSON storage with a fallback for missing or malformed values", () => {
    const values = { good: JSON.stringify({ cards: ["mage"] }), bad: "not json" };
    const storage = createJsonStorage({
        getItem: (key) => values[key] || null,
        setItem: () => {}
    });

    assert.deepEqual(storage.read("good", {}), { cards: ["mage"] });
    assert.deepEqual(storage.read("missing", { cards: [] }), { cards: [] });
    assert.deepEqual(storage.read("bad", { cards: [] }), { cards: [] });
});

test("writes JSON storage through the adapter", () => {
    let saved;
    const storage = createJsonStorage({
        getItem: () => null,
        setItem: (key, value) => { saved = { key, value }; }
    });

    storage.write("custom", ["mage"]);
    assert.deepEqual(saved, { key: "custom", value: '["mage"]' });
});

test("creates a fresh duel session with isolated player state", () => {
    const state = createDuelState(createEmptyPlayer);

    assert.equal(state.player.lp, 8000);
    assert.equal(state.opponent.lp, 8000);
    assert.equal(state.playerTurn, true);
    assert.equal(state.duelOver, false);
    assert.equal(state.turnNumber, 1);
    assert.equal(state.currentPhase, "draw");
    assert.notEqual(state.player, state.opponent);
    assert.notEqual(state.player.deck, state.opponent.deck);
});

test("sends deck validation requests through the multiplayer client", async () => {
    const sent = [];
    const client = createMultiplayerClient({ send: (message) => sent.push(message) });
    const validation = client.validateDeck([{ id: "mage" }], [{ id: "fusion" }]);

    assert.deepEqual(sent, [{ type: "validate_deck", mainDeck: [{ id: "mage" }], extraDeck: [{ id: "fusion" }] }]);
    client.receive({ type: "deck_validation", valid: true, errors: [] });
    assert.deepEqual(await validation, { valid: true, errors: [] });
});

test("rejects a multiplayer request when the server reports an error", async () => {
    const client = createMultiplayerClient({ send: () => {} });
    const validation = client.validateDeck([], []);
    client.receive({ type: "error", message: "Server unavailable." });

    await assert.rejects(validation, /Server unavailable/);
});

test("loads, saves, and deletes profile-scoped custom decks", () => {
    let value = JSON.stringify({ old: { name: "old", cards: ["mage"], extraDeck: [] } });
    const storage = {
        read: () => JSON.parse(value),
        write: (_key, next) => { value = JSON.stringify(next); }
    };
    const store = createDeckStore(storage, "profile_customDecks");

    assert.deepEqual(store.list(), { old: { name: "old", cards: ["mage"], extraDeck: [] } });
    store.save({ name: "new", cards: ["mage"], extraDeck: ["fusion"] });
    assert.equal(store.list().new.extraDeck[0], "fusion");
    assert.equal(store.remove("old"), true);
    assert.equal(store.remove("missing"), false);
    assert.deepEqual(store.list(), { new: { name: "new", cards: ["mage"], extraDeck: ["fusion"] } });
});

test("falls back to an empty custom-deck collection", () => {
    const store = createDeckStore({ read: () => "not an object", write: () => {} }, "decks");
    assert.deepEqual(store.list(), {});
});

test("provides stable version metadata for built-in and custom cards", () => {
    assert.equal(VERSION_HISTORY["1.0"], "Original Release");
    assert.equal(VERSION_HISTORY["2.2"], "Boss Fights");
    assert.equal(VERSION_HISTORY.Custom, "Your Custom Cards");
});

test("creates an isolated runtime database from built-ins and custom overlays", () => {
    const builtIns = { mage: { id: "mage", name: "Mage", type: "monster" } };
    const custom = { custom_1: { id: "custom_1", name: "Custom", type: "spell" } };
    const database = createCardDatabase(builtIns, custom);

    assert.deepEqual(Object.keys(database).sort(), ["custom_1", "mage"]);
    database.mage.name = "Changed";
    assert.equal(builtIns.mage.name, "Mage");
    assert.equal(custom.custom_1.name, "Custom");
});

test("custom records replace built-in IDs only when explicitly supplied", () => {
    const database = createCardDatabase(
        { mage: { id: "mage", name: "Mage", type: "monster" } },
        { mage: { id: "mage", name: "Custom Mage", type: "monster" } }
    );

    assert.equal(database.mage.name, "Custom Mage");
});

test("sends room and turn actions through the multiplayer client", () => {
    const sent = [];
    const client = createMultiplayerClient({ send: (message) => sent.push(message) });

    client.createRoom();
    client.joinRoom("ABC123");
    client.startGame();
    client.draw();
    client.advancePhase();
    client.endTurn();

    assert.deepEqual(sent, [
        { type: "create_room" },
        { type: "join_room", roomId: "ABC123" },
        { type: "start_game" },
        { type: "draw" },
        { type: "advance_phase" },
        { type: "end_turn" }
    ]);
});

test("sends deck selection and ready-state actions through the multiplayer client", () => {
    const sent = [];
    const client = createMultiplayerClient({ send: (message) => sent.push(message) });

    client.selectDeck([{ id: "mage" }], []);
    client.setReady(true);

    assert.deepEqual(sent, [
        { type: "select_deck", mainDeck: [{ id: "mage" }], extraDeck: [] },
        { type: "set_ready", ready: true }
    ]);
});

test("notifies multiplayer listeners of room state and connection errors", () => {
    const received = [];
    const client = createMultiplayerClient({ send: () => {} });
    client.onMessage((message) => received.push(message));

    const state = { type: "room_state", state: { phase: "waiting" } };
    client.receive(state);
    client.receive({ type: "error", message: "Room was not found." });

    assert.deepEqual(received, [state, { type: "error", message: "Room was not found." }]);
});

test("lobby controller creates and joins rooms while reflecting server state", () => {
    const actions = [];
    const views = [];
    const client = {
        createRoom: () => actions.push("create"),
        joinRoom: (roomId) => actions.push(`join:${roomId}`),
        onMessage: (listener) => { client.listener = listener; return () => {}; }
    };
    const lobby = createLobbyController(client, (view) => views.push(view));

    lobby.createRoom();
    lobby.joinRoom(" abc123 ");
    client.listener({ type: "joined", playerId: "player-1", roomId: "ABC123" });
    client.listener({ type: "error", message: "Room was not found." });

    assert.deepEqual(actions, ["create", "join:ABC123"]);
    assert.deepEqual(views, [
        { status: "joining", roomId: null, playerId: null, error: null },
        { status: "joining", roomId: null, playerId: null, error: null },
        { status: "joined", roomId: "ABC123", playerId: "player-1", error: null },
        { status: "error", roomId: "ABC123", playerId: "player-1", error: "Room was not found." }
    ]);
});

test("sends a play-card action through the multiplayer client", () => {
    const sent = [];
    const client = createMultiplayerClient({ send: (message) => sent.push(message) });
    client.playCard(2);
    assert.deepEqual(sent, [{ type: "play_card", handIndex: 2 }]);
});

test("sends an attack action through the multiplayer client", () => {
    const sent = [];
    const client = createMultiplayerClient({ send: (message) => sent.push(message) });
    client.attack(0, 1);
    assert.deepEqual(sent, [{ type: "attack", attackerIndex: 0, defenderIndex: 1 }]);
});

test("duel sync forwards server actions and publishes room state", () => {
    const sent = [];
    const states = [];
    const client = { draw: () => sent.push(["draw"]), advancePhase: () => sent.push(["phase"]), playCard: (index) => sent.push(["play", index]), attack: (a, d) => sent.push(["attack", a, d]), endTurn: () => sent.push(["end"]), onMessage: (listener) => { client.listener = listener; return () => {}; } };
    const sync = createDuelSync(client, (state) => states.push(state));
    const roomState = { phase: "active", currentTurn: "player-1" };

    sync.draw();
    sync.advancePhase();
    sync.playCard(0);
    sync.attack(0, 1);
    sync.endTurn();
    client.listener({ type: "room_state", state: roomState });

    assert.deepEqual(sent, [["draw"], ["phase"], ["play", 0], ["attack", 0, 1], ["end"]]);
    assert.deepEqual(states, [roomState]);
});

test("projects authoritative room state into a private player view", () => {
    const state = {
        phase: "active",
        currentTurn: "player-1",
        currentPhase: "main1",
        lifePoints: { "player-1": 8000, "player-2": 7200 },
        deckCounts: { "player-1": 30, "player-2": 28 },
        handCounts: { "player-1": 6, "player-2": 4 },
        extraDeckCounts: { "player-1": 3, "player-2": 2 },
        decks: { "player-1": [{ id: "own" }], "player-2": [] },
        hands: { "player-1": [{ id: "hand" }], "player-2": [] },
        extraDecks: { "player-1": [{ id: "extra" }], "player-2": [] },
        fields: { "player-1": [{ id: "field" }], "player-2": [{ id: "enemy" }] },
        graveyards: { "player-1": [], "player-2": [{ id: "grave" }] }
    };

    assert.deepEqual(projectDuelView(state, "player-1"), {
        phase: "active",
        currentTurn: "player-1",
        currentPhase: "main1",
        winner: null,
        player: { lifePoints: 8000, deckCount: 30, handCount: 6, extraDeckCount: 3, hand: [{ id: "hand" }], field: [{ id: "field" }], graveyard: [] },
        opponent: { lifePoints: 7200, deckCount: 28, handCount: 4, extraDeckCount: 2, hand: [], field: [{ id: "enemy" }], graveyard: [{ id: "grave" }] }
    });
});