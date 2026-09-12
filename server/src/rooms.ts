import { randomUUID } from "node:crypto";
import { WebSocket } from "ws";
import { createRoomState, PlayerId, RoomState } from "./domain";

export interface Room {
    state: RoomState;
    sockets: Map<PlayerId, WebSocket>;
}

export class RoomManager {
    private readonly rooms = new Map<string, Room>();

    create(): Room {
        const roomId = randomUUID().slice(0, 6).toUpperCase();
        const room = { state: createRoomState(roomId), sockets: new Map<PlayerId, WebSocket>() };
        this.rooms.set(roomId, room);
        return room;
    }

    find(roomId: string): Room | undefined {
        return this.rooms.get(roomId.toUpperCase());
    }

    count(): number {
        return this.rooms.size;
    }

    membership(socket: WebSocket): { room: Room; playerId: PlayerId } | null {
        for (const room of this.rooms.values()) {
            for (const [playerId, roomSocket] of room.sockets) {
                if (roomSocket === socket) return { room, playerId };
            }
        }
        return null;
    }

    join(room: Room, socket: WebSocket): PlayerId | null {
        if (room.state.players.length >= 2) return null;
        const playerId = room.state.players.length === 0 ? "player-1" : "player-2";
        room.state.players.push(playerId);
        room.sockets.set(playerId, socket);
        return playerId;
    }

    leave(socket: WebSocket): Room | null {
        const membership = this.membership(socket);
        if (!membership) return null;
        membership.room.sockets.delete(membership.playerId);
        membership.room.state.players = membership.room.state.players.filter(
            (playerId) => playerId !== membership.playerId
        );
        if (membership.room.state.phase === "active") membership.room.state.phase = "finished";
        if (membership.room.sockets.size === 0) this.rooms.delete(membership.room.state.roomId);
        return membership.room;
    }
}