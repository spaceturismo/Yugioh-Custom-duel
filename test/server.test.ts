import { spawn, ChildProcessWithoutNullStreams } from "node:child_process";
import { once } from "node:events";
import { strict as assert } from "node:assert";
import { after, before, test } from "node:test";
import { WebSocket } from "ws";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const port = 8788;
const baseUrl = `http://localhost:${port}`;
let server: ChildProcessWithoutNullStreams;
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const messageQueues = new WeakMap<WebSocket, Record<string, any>[]>();
const messageWaiters = new WeakMap<WebSocket, ((message: Record<string, any>) => void)[]>();

before(async () => {
    server = spawn(process.execPath, ["node_modules/tsx/dist/cli.mjs", "server/src/server.ts"], {
        cwd: repositoryRoot,
        env: { ...process.env, PORT: String(port) }
    });
    await new Promise<void>((resolve, reject) => {
        const onData = (data: Buffer) => {
            if (data.toString().includes("local server listening")) {
                server.stdout.off("data", onData);
                resolve();
            }
        };
        server.stdout.on("data", onData);
        server.once("error", reject);
        server.once("exit", (code) => reject(new Error(`Server exited with code ${code}`)));
    });
});

after(async () => {
    if (!server.killed) server.kill();
    await once(server, "exit").catch(() => undefined);
});

function connect(): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
        const socket = new WebSocket(`ws://localhost:${port}/ws`);
        socket.on("message", (data) => {
            const message = JSON.parse(data.toString());
            const waiters = messageWaiters.get(socket) || [];
            const waiter = waiters.shift();
            if (waiter) waiter(message);
            else messageQueues.get(socket)?.push(message);
        });
        socket.once("open", () => resolve(socket));
        socket.once("error", reject);
        messageQueues.set(socket, []);
        messageWaiters.set(socket, []);
    });
}

function nextMessage(socket: WebSocket): Promise<Record<string, any>> {
    const queue = messageQueues.get(socket) || [];
    const message = queue.shift();
    if (message) return Promise.resolve(message);
    return new Promise((resolve) => messageWaiters.get(socket)?.push(resolve));
}

async function receiveUntil(
    socket: WebSocket,
    type: string,
    predicate: (message: Record<string, any>) => boolean = () => true
): Promise<Record<string, any>> {
    while (true) {
        const message = await nextMessage(socket);
        if (message.type === type && predicate(message)) return message;
    }
}

test("serves the app and reports health", async () => {
    const health = await fetch(`${baseUrl}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: "ok", rooms: 0 });

    const homepage = await fetch(`${baseUrl}/`);
    assert.equal(homepage.status, 200);
    assert.match(await homepage.text(), /Custom Yu-Gi-Oh! Duel Engine/);

    const duelPage = await fetch(`${baseUrl}/duel.html`);
    assert.equal(duelPage.status, 200);
    const duelHtml = await duelPage.text();
    assert.match(duelHtml, /client\/duel-model\.js/);
    assert.match(duelHtml, /id="multiplayerPanel"/);
    assert.match(duelHtml, /id="createRoomButton"/);
    assert.match(duelHtml, /id="joinRoomButton"/);
    assert.match(duelHtml, /id="readyDeckButton"/);
    assert.match(duelHtml, /id="startMatchButton"/);
    assert.match(duelHtml, /client\/multiplayer\.js/);
    assert.match(duelHtml, /client\/lobby\.js/);
    assert.match(duelHtml, /client\/duel-view\.js/);
    assert.match(duelHtml, /renderServerDuelState/);
    assert.match(duelHtml, /multiplayerDuelSync\.draw/);
    assert.match(duelHtml, /multiplayerDuelSync\.endTurn/);
    assert.match(duelHtml, /multiplayerDuelSync\.playCard/);
    assert.match(duelHtml, /multiplayerDuelSync\.attack/);
});

test("authoritatively controls a two-player room", async () => {
    const first = await connect();
    const connected = await receiveUntil(first, "connected");
    assert.equal(connected.message, "Create or join a room.");
    first.send(JSON.stringify({ type: "create_room" }));
    const firstJoined = await receiveUntil(first, "joined");
    assert.equal(firstJoined.playerId, "player-1");

    const second = await connect();
    await receiveUntil(second, "connected");
    second.send(JSON.stringify({ type: "join_room", roomId: firstJoined.roomId }));
    const secondJoined = await receiveUntil(second, "joined");
    assert.equal(secondJoined.playerId, "player-2");

    first.send(JSON.stringify({ type: "start_game" }));
    const startError = await receiveUntil(first, "error");
    assert.equal(startError.message, "Both players must be ready to start.");

    const selectedDeck = { id: "mage", name: "Mage", type: "monster" };
    first.send(JSON.stringify({ type: "select_deck", mainDeck: Array.from({ length: 6 }, () => selectedDeck), extraDeck: [] }));
    second.send(JSON.stringify({ type: "select_deck", mainDeck: Array.from({ length: 6 }, () => selectedDeck), extraDeck: [] }));
    await receiveUntil(first, "room_state", (message) => message.state.deckCounts["player-2"] === 6);
    first.send(JSON.stringify({ type: "set_ready", ready: true }));
    second.send(JSON.stringify({ type: "set_ready", ready: true }));
    await receiveUntil(first, "room_state", (message) => message.state.ready["player-2"] === true);
    first.send(JSON.stringify({ type: "start_game" }));
    const active = await receiveUntil(
        first,
        "room_state",
        (message) => message.state.phase === "active"
    );
    assert.equal(active.state.phase, "active");
    assert.equal(active.state.currentTurn, "player-1");
    assert.equal(active.state.currentPhase, "draw");

    first.send(JSON.stringify({ type: "draw" }));
    const drawn = await receiveUntil(
        second,
        "room_state",
        (message) => message.state.handCounts["player-1"] === 6
    );
    assert.equal(drawn.state.deckCounts["player-1"], 0);
    assert.equal(drawn.state.handCounts["player-1"], 6);
    assert.equal(drawn.state.currentPhase, "main1");

    second.send(JSON.stringify({ type: "draw" }));
    const rejected = await receiveUntil(second, "error");
    assert.equal(rejected.message, "It is not your turn.");

    first.close();
    second.close();
});

test("validates submitted decks using the server rules", async () => {
    const socket = await connect();
    await receiveUntil(socket, "connected");
    socket.send(JSON.stringify({
        type: "validate_deck",
        mainDeck: Array.from({ length: 61 }, () => ({ id: "mage", name: "Mage", type: "monster" })),
        extraDeck: []
    }));

    const result = await receiveUntil(socket, "deck_validation");
    assert.equal(result.valid, false);
    assert.deepEqual(result.errors, ["Main Deck cannot exceed 60 cards."]);
    socket.close();
});

test("broadcasts an authoritative play-card action to both clients", async () => {
    const first = await connect();
    await receiveUntil(first, "connected");
    first.send(JSON.stringify({ type: "create_room" }));
    const firstJoined = await receiveUntil(first, "joined");

    const second = await connect();
    await receiveUntil(second, "connected");
    second.send(JSON.stringify({ type: "join_room", roomId: firstJoined.roomId }));
    await receiveUntil(second, "joined");

    const card = { id: "mage", name: "Mage", type: "monster" };
    const deck = Array.from({ length: 6 }, () => card);
    first.send(JSON.stringify({ type: "select_deck", mainDeck: deck, extraDeck: [] }));
    second.send(JSON.stringify({ type: "select_deck", mainDeck: deck, extraDeck: [] }));
    await receiveUntil(first, "room_state", (message) => message.state.deckCounts["player-2"] === 6);
    first.send(JSON.stringify({ type: "set_ready", ready: true }));
    second.send(JSON.stringify({ type: "set_ready", ready: true }));
    await receiveUntil(first, "room_state", (message) => message.state.ready["player-2"] === true);
    first.send(JSON.stringify({ type: "start_game" }));
    await receiveUntil(first, "room_state", (message) => message.state.phase === "active");

    first.send(JSON.stringify({ type: "draw" }));
    await receiveUntil(first, "room_state", (message) => message.state.currentPhase === "main1");
    first.send(JSON.stringify({ type: "play_card", handIndex: 0 }));
    const played = await receiveUntil(second, "room_state", (message) => message.state.fields["player-1"].length === 1);
    assert.equal(played.state.hands["player-1"].length, 0);
    assert.equal(played.state.handCounts["player-1"], 5);
    assert.equal(played.state.fields["player-1"][0].name, "Mage");
    first.close();
    second.close();
});

test("does not broadcast an opponent's private deck or hand", async () => {
    const first = await connect();
    await receiveUntil(first, "connected");
    first.send(JSON.stringify({ type: "create_room" }));
    const firstJoined = await receiveUntil(first, "joined");
    const second = await connect();
    await receiveUntil(second, "connected");
    second.send(JSON.stringify({ type: "join_room", roomId: firstJoined.roomId }));
    await receiveUntil(second, "joined");

    const card = { id: "secret", name: "Secret Card", type: "monster" };
    first.send(JSON.stringify({ type: "select_deck", mainDeck: [card], extraDeck: [] }));
    second.send(JSON.stringify({ type: "select_deck", mainDeck: [{ ...card, id: "opponent-secret" }], extraDeck: [] }));
    const visibleToFirst = await receiveUntil(first, "room_state", (message) => message.state.deckCounts["player-2"] === 1);

    assert.equal(visibleToFirst.state.decks["player-1"][0].id, "secret");
    assert.deepEqual(visibleToFirst.state.decks["player-2"], []);
    assert.deepEqual(visibleToFirst.state.hands["player-2"], []);
    assert.deepEqual(visibleToFirst.state.extraDecks["player-2"], []);
    assert.equal(visibleToFirst.state.handCounts["player-2"], 5);
    first.close();
    second.close();
});

test("broadcasts a finished state and winner when an attack reaches zero life points", async () => {
    const first = await connect();
    await receiveUntil(first, "connected");
    first.send(JSON.stringify({ type: "create_room" }));
    const firstJoined = await receiveUntil(first, "joined");
    const second = await connect();
    await receiveUntil(second, "connected");
    second.send(JSON.stringify({ type: "join_room", roomId: firstJoined.roomId }));
    await receiveUntil(second, "joined");

    const attacker = { id: "attacker", name: "Attacker", type: "monster", atk: 9000 };
    const defender = { id: "defender", name: "Defender", type: "monster", atk: 1000 };
    first.send(JSON.stringify({ type: "select_deck", mainDeck: Array.from({ length: 7 }, () => attacker), extraDeck: [] }));
    second.send(JSON.stringify({ type: "select_deck", mainDeck: Array.from({ length: 7 }, () => defender), extraDeck: [] }));
    await receiveUntil(first, "room_state", (message) => message.state.ready["player-2"] === false && message.state.deckCounts["player-2"] === 7);
    first.send(JSON.stringify({ type: "set_ready", ready: true }));
    second.send(JSON.stringify({ type: "set_ready", ready: true }));
    await receiveUntil(first, "room_state", (message) => message.state.ready["player-2"] === true);
    first.send(JSON.stringify({ type: "start_game" }));
    await receiveUntil(first, "room_state", (message) => message.state.phase === "active");
    first.send(JSON.stringify({ type: "draw" }));
    await receiveUntil(first, "room_state", (message) => message.state.currentPhase === "main1");
    first.send(JSON.stringify({ type: "play_card", handIndex: 0 }));
    await receiveUntil(first, "room_state", (message) => message.state.fields["player-1"].length === 1);
    first.send(JSON.stringify({ type: "advance_phase" }));
    await receiveUntil(first, "room_state", (message) => message.state.currentPhase === "battle");
    first.send(JSON.stringify({ type: "advance_phase" }));
    await receiveUntil(first, "room_state", (message) => message.state.currentPhase === "main2");
    first.send(JSON.stringify({ type: "advance_phase" }));
    await receiveUntil(first, "room_state", (message) => message.state.currentPhase === "end");
    first.send(JSON.stringify({ type: "end_turn" }));
    await receiveUntil(first, "room_state", (message) => message.state.currentTurn === "player-2" && message.state.currentPhase === "draw");
    second.send(JSON.stringify({ type: "draw" }));
    await receiveUntil(first, "room_state", (message) => message.state.currentPhase === "main1");
    second.send(JSON.stringify({ type: "play_card", handIndex: 0 }));
    await receiveUntil(first, "room_state", (message) => message.state.fields["player-2"].length === 1);
    second.send(JSON.stringify({ type: "advance_phase" }));
    await receiveUntil(first, "room_state", (message) => message.state.currentPhase === "battle");
    second.send(JSON.stringify({ type: "advance_phase" }));
    await receiveUntil(first, "room_state", (message) => message.state.currentPhase === "main2");
    second.send(JSON.stringify({ type: "advance_phase" }));
    await receiveUntil(first, "room_state", (message) => message.state.currentPhase === "end");
    second.send(JSON.stringify({ type: "end_turn" }));
    await receiveUntil(first, "room_state", (message) => message.state.currentTurn === "player-1" && message.state.currentPhase === "draw");
    first.send(JSON.stringify({ type: "draw" }));
    await receiveUntil(first, "room_state", (message) => message.state.currentPhase === "main1");
    first.send(JSON.stringify({ type: "advance_phase" }));
    await receiveUntil(first, "room_state", (message) => message.state.currentPhase === "battle");
    first.send(JSON.stringify({ type: "attack", attackerIndex: 0, defenderIndex: 0 }));

    const finished = await receiveUntil(second, "room_state", (message) => message.state.phase === "finished");
    assert.equal(finished.state.winner, "player-1");
    assert.equal(finished.state.lifePoints["player-2"], 0);

    first.close();
    second.close();
});

test("broadcasts an authoritative attack resolution to both clients", async () => {
    const first = await connect();
    await receiveUntil(first, "connected");
    first.send(JSON.stringify({ type: "create_room" }));
    const firstJoined = await receiveUntil(first, "joined");

    const second = await connect();
    await receiveUntil(second, "connected");
    second.send(JSON.stringify({ type: "join_room", roomId: firstJoined.roomId }));
    await receiveUntil(second, "joined");

    const attacker = { id: "attacker", name: "Attacker", type: "monster", atk: 1800, def: 1200 };
    const defender = { id: "defender", name: "Defender", type: "monster", atk: 1400, def: 1000 };
    first.send(JSON.stringify({ type: "select_deck", mainDeck: Array.from({ length: 7 }, () => attacker), extraDeck: [] }));
    second.send(JSON.stringify({ type: "select_deck", mainDeck: Array.from({ length: 7 }, () => defender), extraDeck: [] }));
    await receiveUntil(first, "room_state", (message) => message.state.deckCounts["player-2"] === 7);
    first.send(JSON.stringify({ type: "set_ready", ready: true }));
    second.send(JSON.stringify({ type: "set_ready", ready: true }));
    await receiveUntil(first, "room_state", (message) => message.state.ready["player-2"] === true);
    first.send(JSON.stringify({ type: "start_game" }));
    await receiveUntil(first, "room_state", (message) => message.state.phase === "active");
    first.send(JSON.stringify({ type: "draw" }));
    await receiveUntil(first, "room_state", (message) => message.state.currentPhase === "main1");
    first.send(JSON.stringify({ type: "play_card", handIndex: 0 }));
    await receiveUntil(first, "room_state", (message) => message.state.fields["player-1"].length === 1);
    first.send(JSON.stringify({ type: "advance_phase" }));
    await receiveUntil(first, "room_state", (message) => message.state.currentPhase === "battle");
    first.send(JSON.stringify({ type: "advance_phase" }));
    await receiveUntil(first, "room_state", (message) => message.state.currentPhase === "main2");
    first.send(JSON.stringify({ type: "advance_phase" }));
    await receiveUntil(first, "room_state", (message) => message.state.currentPhase === "end");
    first.send(JSON.stringify({ type: "end_turn" }));
    await receiveUntil(first, "room_state", (message) => message.state.currentTurn === "player-2" && message.state.currentPhase === "draw");
    second.send(JSON.stringify({ type: "draw" }));
    await receiveUntil(first, "room_state", (message) => message.state.currentPhase === "main1");
    second.send(JSON.stringify({ type: "play_card", handIndex: 0 }));
    await receiveUntil(first, "room_state", (message) => message.state.fields["player-2"].length === 1);
    second.send(JSON.stringify({ type: "advance_phase" }));
    await receiveUntil(first, "room_state", (message) => message.state.currentPhase === "battle");
    second.send(JSON.stringify({ type: "advance_phase" }));
    await receiveUntil(first, "room_state", (message) => message.state.currentPhase === "main2");
    second.send(JSON.stringify({ type: "advance_phase" }));
    await receiveUntil(first, "room_state", (message) => message.state.currentPhase === "end");
    second.send(JSON.stringify({ type: "end_turn" }));
    await receiveUntil(first, "room_state", (message) => message.state.currentTurn === "player-1" && message.state.currentPhase === "draw");
    first.send(JSON.stringify({ type: "draw" }));
    await receiveUntil(first, "room_state", (message) => message.state.currentPhase === "main1");
    first.send(JSON.stringify({ type: "advance_phase" }));
    await receiveUntil(first, "room_state", (message) => message.state.currentPhase === "battle");
    first.send(JSON.stringify({ type: "attack", attackerIndex: 0, defenderIndex: 0 }));
    const resolved = await receiveUntil(second, "room_state", (message) => message.state.graveyards["player-2"].length === 1);
    assert.equal(resolved.state.lifePoints["player-2"], 7600);
    assert.deepEqual(resolved.state.fields["player-2"], []);
    assert.equal(resolved.state.graveyards["player-2"][0].id, "defender");

    first.close();
    second.close();
});