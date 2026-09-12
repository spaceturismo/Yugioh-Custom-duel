import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { WebSocket, WebSocketServer } from "ws";

const port = Number(process.env.PORT || 8787);
const appRoot = resolve(__dirname, "..", "..");

type PlayerId = "player-1" | "player-2";

interface RoomState {
    roomId: string;
    phase: "waiting" | "active" | "finished";
    players: PlayerId[];
    currentTurn: PlayerId | null;
    lifePoints: Record<PlayerId, number>;
    deckCounts: Record<PlayerId, number>;
    handCounts: Record<PlayerId, number>;
}

interface Room {
    state: RoomState;
    sockets: Map<PlayerId, WebSocket>;
}

interface ClientMessage {
    type?: string;
    roomId?: string;
}

const rooms = new Map<string, Room>();

function createRoom(): Room {
    const roomId = randomUUID().slice(0, 6).toUpperCase();
    const room: Room = {
        state: {
            roomId,
            phase: "waiting",
            players: [],
            currentTurn: null,
            lifePoints: { "player-1": 8000, "player-2": 8000 },
            deckCounts: { "player-1": 40, "player-2": 40 },
            handCounts: { "player-1": 5, "player-2": 5 }
        },
        sockets: new Map()
    };
    rooms.set(roomId, room);
    return room;
}

function send(socket: WebSocket, message: unknown): void {
    if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(message));
    }
}

function broadcast(room: Room, message: unknown): void {
    for (const socket of room.sockets.values()) {
        send(socket, message);
    }
}

function sendState(room: Room): void {
    broadcast(room, { type: "room_state", state: room.state });
}

function error(socket: WebSocket, message: string): void {
    send(socket, { type: "error", message });
}

function getRoomForSocket(socket: WebSocket): { room: Room; playerId: PlayerId } | null {
    for (const room of rooms.values()) {
        for (const [playerId, roomSocket] of room.sockets) {
            if (roomSocket === socket) return { room, playerId };
        }
    }
    return null;
}

function joinRoom(socket: WebSocket, room: Room): void {
    if (room.state.players.length >= 2) {
        error(socket, "Room is full.");
        return;
    }

    const playerId = room.state.players.length === 0 ? "player-1" : "player-2";
    room.state.players.push(playerId);
    room.sockets.set(playerId, socket);
    send(socket, { type: "joined", playerId, roomId: room.state.roomId });
    sendState(room);
}

function handleAction(socket: WebSocket, message: ClientMessage): void {
    const membership = getRoomForSocket(socket);
    if (!membership) {
        error(socket, "Join a room before sending actions.");
        return;
    }

    const { room, playerId } = membership;
    if (message.type === "start_game") {
        if (room.state.players.length !== 2) {
            error(socket, "Two players are required to start.");
            return;
        }
        room.state.phase = "active";
        room.state.currentTurn = "player-1";
        sendState(room);
        return;
    }

    if (room.state.phase !== "active") {
        error(socket, "The game has not started.");
        return;
    }
    if (room.state.currentTurn !== playerId) {
        error(socket, "It is not your turn.");
        return;
    }

    if (message.type === "draw") {
        if (room.state.deckCounts[playerId] <= 0) {
            error(socket, "Your deck is empty.");
            return;
        }
        room.state.deckCounts[playerId] -= 1;
        room.state.handCounts[playerId] += 1;
        sendState(room);
        return;
    }

    if (message.type === "end_turn") {
        room.state.currentTurn = playerId === "player-1" ? "player-2" : "player-1";
        sendState(room);
        return;
    }

    error(socket, "Unknown action.");
}

function parseMessage(raw: string): ClientMessage | null {
    try {
        const message: unknown = JSON.parse(raw);
        if (typeof message !== "object" || message === null) return null;
        return message as ClientMessage;
    } catch {
        return null;
    }
}

function contentType(path: string): string {
    const types: Record<string, string> = {
        ".html": "text/html; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".js": "text/javascript; charset=utf-8",
        ".json": "application/json; charset=utf-8",
        ".svg": "image/svg+xml",
        ".webmanifest": "application/manifest+json"
    };
    return types[extname(path)] || "application/octet-stream";
}

function serveStatic(request: IncomingMessage, response: ServerResponse): void {
    const requestPath = new URL(request.url || "/", "http://localhost").pathname;
    const relativePath = requestPath === "/" ? "index.html" : requestPath.slice(1);
    const filePath = normalize(join(appRoot, relativePath));
    if (!filePath.startsWith(appRoot) || !existsSync(filePath) || !statSync(filePath).isFile()) {
        response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        response.end("Not found");
        return;
    }
    response.writeHead(200, { "Content-Type": contentType(filePath) });
    createReadStream(filePath).pipe(response);
}

const httpServer = createServer((request, response) => {
    if (request.url === "/health") {
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ status: "ok", rooms: rooms.size }));
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
            error(socket, "Messages must be valid JSON with a type.");
            return;
        }
        if (message.type === "create_room") {
            joinRoom(socket, createRoom());
            return;
        }
        if (message.type === "join_room") {
            const room = message.roomId ? rooms.get(message.roomId.toUpperCase()) : undefined;
            if (!room) {
                error(socket, "Room was not found.");
                return;
            }
            joinRoom(socket, room);
            return;
        }
        handleAction(socket, message);
    });
    socket.on("close", () => {
        const membership = getRoomForSocket(socket);
        if (!membership) return;
        membership.room.sockets.delete(membership.playerId);
        membership.room.state.players = membership.room.state.players.filter(
            (playerId) => playerId !== membership.playerId
        );
        if (membership.room.state.phase === "active") membership.room.state.phase = "finished";
        sendState(membership.room);
        if (membership.room.sockets.size === 0) rooms.delete(membership.room.state.roomId);
    });
});

httpServer.listen(port, () => {
    console.log(`Custom Duel local server listening at http://localhost:${port}`);
    console.log(`WebSocket endpoint: ws://localhost:${port}/ws`);
});