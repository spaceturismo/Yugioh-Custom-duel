export type ClientMessage =
    | { type: "create_room" }
    | { type: "join_room"; roomId: string }
    | { type: "start_game" }
    | { type: "draw" }
    | { type: "end_turn" }
    | { type: "validate_deck"; mainDeck: unknown[]; extraDeck: unknown[] }
    | { type: "select_deck"; mainDeck: unknown[]; extraDeck: unknown[] }
    | { type: "set_ready"; ready: boolean };

const MESSAGE_TYPES = new Set([
    "create_room",
    "join_room",
    "start_game",
    "draw",
    "end_turn",
    "validate_deck",
    "select_deck",
    "set_ready"
]);

export function parseClientMessage(raw: string): ClientMessage | null {
    let value: unknown;
    try {
        value = JSON.parse(raw);
    } catch {
        return null;
    }

    if (typeof value !== "object" || value === null) return null;
    const message = value as Record<string, unknown>;
    if (typeof message.type !== "string" || !MESSAGE_TYPES.has(message.type)) return null;

    if (message.type === "join_room") {
        return typeof message.roomId === "string" && message.roomId.trim().length > 0
            ? { type: "join_room", roomId: message.roomId }
            : null;
    }

    if (message.type === "validate_deck") {
        return Array.isArray(message.mainDeck) && Array.isArray(message.extraDeck)
            ? { type: "validate_deck", mainDeck: message.mainDeck, extraDeck: message.extraDeck }
            : null;
    }

    if (message.type === "select_deck") {
        return Array.isArray(message.mainDeck) && Array.isArray(message.extraDeck)
            ? { type: "select_deck", mainDeck: message.mainDeck, extraDeck: message.extraDeck }
            : null;
    }

    if (message.type === "set_ready") {
        return typeof message.ready === "boolean"
            ? { type: "set_ready", ready: message.ready }
            : null;
    }

    return { type: message.type as Exclude<ClientMessage["type"], "join_room" | "validate_deck" | "select_deck" | "set_ready"> };
}