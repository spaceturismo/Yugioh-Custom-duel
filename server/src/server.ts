import { createServer } from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import { attack, drawCard, endTurn, playCard, selectDeck, setPlayerReady, startGame } from "./domain";
import { loadDeckRules } from "./config";
import { validateDeck } from "./card-model";
import { ClientMessage, parseClientMessage } from "./protocol";
import { Room, RoomManager } from "./rooms";
import { serveStatic } from "./static-server";

const port = Number(process.env.PORT || 8787);
const rooms = new RoomManager();
const deckRules = loadDeckRules();

function send(socket: WebSocket, message: unknown): void {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

function broadcast(room: Room, message: unknown): void {
    for (const socket of room.sockets.values()) send(socket, message);
}

function sendState(room: Room): void {
    for (const [playerId, socket] of room.sockets) {
        const state = JSON.parse(JSON.stringify(room.state));
        const opponentId = playerId === "player-1" ? "player-2" : "player-1";
        state.decks[opponentId] = [];
        state.hands[opponentId] = [];
        state.extraDecks[opponentId] = [];
        send(socket, { type: "room_state", state });
    }
}

function sendError(socket: WebSocket, message: string): void {
    send(socket, { type: "error", message });
}

function joinRoom(socket: WebSocket, room: Room): void {
    const playerId = rooms.join(room, socket);
    if (!playerId) {
        sendError(socket, "Room is full.");
        return;
    }
    send(socket, { type: "joined", playerId, roomId: room.state.roomId });
    sendState(room);
}

function handleAction(socket: WebSocket, message: ClientMessage): void {
    if (message.type === "validate_deck") {
        send(socket, { type: "deck_validation", ...validateDeck(message.mainDeck, message.extraDeck, deckRules) });
        return;
    }

    const membership = rooms.membership(socket);
    if (!membership) {
        sendError(socket, "Join a room before sending actions.");
        return;
    }

    const { room, playerId } = membership;
    let messageError: string | null = null;
    if (message.type === "select_deck") messageError = selectDeck(room.state, playerId, message.mainDeck, message.extraDeck, deckRules);
    else if (message.type === "set_ready") messageError = setPlayerReady(room.state, playerId, message.ready);
    else if (message.type === "play_card") messageError = playCard(room.state, playerId, message.handIndex);
    else if (message.type === "attack") messageError = attack(room.state, playerId, message.attackerIndex, playerId === "player-1" ? "player-2" : "player-1", message.defenderIndex);
    else if (message.type === "start_game") messageError = startGame(room.state);
    else if (message.type === "draw") messageError = drawCard(room.state, playerId);
    else if (message.type === "end_turn") messageError = endTurn(room.state, playerId);
    else messageError = "Unknown action.";

    if (messageError) sendError(socket, messageError);
    else sendState(room);
}

const httpServer = createServer((request, response) => {
    if (request.url === "/health") {
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ status: "ok", rooms: rooms.count() }));
        return;
    }
    serveStatic(request, response);
});

const webSocketServer = new WebSocketServer({ server: httpServer, path: "/ws" });
webSocketServer.on("connection", (socket) => {
    send(socket, { type: "connected", message: "Create or join a room." });
    socket.on("message", (raw) => {
        const message = parseClientMessage(raw.toString());
        if (!message || !message.type) {
            sendError(socket, "Messages must be valid JSON with a type.");
            return;
        }
        if (message.type === "create_room") {
            joinRoom(socket, rooms.create());
            return;
        }
        if (message.type === "join_room") {
            const room = message.roomId ? rooms.find(message.roomId) : undefined;
            if (!room) {
                sendError(socket, "Room was not found.");
                return;
            }
            joinRoom(socket, room);
            return;
        }
        handleAction(socket, message);
    });
    socket.on("close", () => {
        const room = rooms.leave(socket);
        if (room) sendState(room);
    });
});

httpServer.listen(port, () => {
    console.log(`Custom Duel local server listening at http://localhost:${port}`);
    console.log(`WebSocket endpoint: ws://localhost:${port}/ws`);
});
