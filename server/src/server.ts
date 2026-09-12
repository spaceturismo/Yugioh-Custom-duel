import { createServer } from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import { ClientMessage, drawCard, endTurn, startGame } from "./domain";
import { Room, RoomManager } from "./rooms";
import { serveStatic } from "./static-server";

const port = Number(process.env.PORT || 8787);
const rooms = new RoomManager();

function send(socket: WebSocket, message: unknown): void {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

function broadcast(room: Room, message: unknown): void {
    for (const socket of room.sockets.values()) send(socket, message);
}

function sendState(room: Room): void {
    broadcast(room, { type: "room_state", state: room.state });
}

function sendError(socket: WebSocket, message: string): void {
    send(socket, { type: "error", message });
}

function parseMessage(raw: string): ClientMessage | null {
    try {
        const message: unknown = JSON.parse(raw);
        return typeof message === "object" && message !== null
            ? message as ClientMessage
            : null;
    } catch {
        return null;
    }
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
    const membership = rooms.membership(socket);
    if (!membership) {
        sendError(socket, "Join a room before sending actions.");
        return;
    }

    const { room, playerId } = membership;
    let messageError: string | null = null;
    if (message.type === "start_game") messageError = startGame(room.state);
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
        const message = parseMessage(raw.toString());
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
