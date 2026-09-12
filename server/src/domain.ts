import { validateDeck, type CardRecord, type DeckRules } from "./card-model";

export type PlayerId = "player-1" | "player-2";

export interface RoomState {
    roomId: string;
    phase: "waiting" | "active" | "finished";
    players: PlayerId[];
    currentTurn: PlayerId | null;
    lifePoints: Record<PlayerId, number>;
    deckCounts: Record<PlayerId, number>;
    handCounts: Record<PlayerId, number>;
    extraDeckCounts: Record<PlayerId, number>;
    ready: Record<PlayerId, boolean>;
    decks: Record<PlayerId, CardRecord[]>;
    hands: Record<PlayerId, CardRecord[]>;
    extraDecks: Record<PlayerId, CardRecord[]>;
}

export interface ClientMessage {
    type?: string;
    roomId?: string;
}

export function createRoomState(roomId: string): RoomState {
    return {
        roomId,
        phase: "waiting",
        players: [],
        currentTurn: null,
        lifePoints: { "player-1": 8000, "player-2": 8000 },
        deckCounts: { "player-1": 40, "player-2": 40 },
        handCounts: { "player-1": 5, "player-2": 5 },
        extraDeckCounts: { "player-1": 0, "player-2": 0 },
        ready: { "player-1": false, "player-2": false },
        decks: { "player-1": [], "player-2": [] },
        hands: { "player-1": [], "player-2": [] },
        extraDecks: { "player-1": [], "player-2": [] }
    };
}

export function startGame(state: RoomState): string | null {
    if (state.players.length !== 2) return "Two players are required to start.";
    if (!state.ready["player-1"] || !state.ready["player-2"]) return "Both players must be ready to start.";
    state.phase = "active";
    state.currentTurn = "player-1";
    for (const playerId of state.players) {
        if (state.decks[playerId].length > 0) {
            state.hands[playerId] = state.decks[playerId].splice(0, 5);
            state.deckCounts[playerId] = state.decks[playerId].length;
            state.handCounts[playerId] = state.hands[playerId].length;
        }
    }
    return null;
}

export function drawCard(state: RoomState, playerId: PlayerId): string | null {
    if (state.phase !== "active") return "The game has not started.";
    if (state.currentTurn !== playerId) return "It is not your turn.";
    if (state.deckCounts[playerId] <= 0) return "Your deck is empty.";
    const deck = state.decks[playerId];
    const hand = state.hands[playerId];
    if (deck.length > 0) {
        hand.push(deck.shift() as CardRecord);
        state.deckCounts[playerId] = deck.length;
        state.handCounts[playerId] = hand.length;
    } else {
        state.deckCounts[playerId] -= 1;
        state.handCounts[playerId] += 1;
    }
    return null;
}

export function endTurn(state: RoomState, playerId: PlayerId): string | null {
    if (state.phase !== "active") return "The game has not started.";
    if (state.currentTurn !== playerId) return "It is not your turn.";
    state.currentTurn = playerId === "player-1" ? "player-2" : "player-1";
    return null;
}

export function selectDeck(
    state: RoomState,
    playerId: PlayerId,
    mainDeck: unknown[],
    extraDeck: unknown[],
    rules: DeckRules = { maxMainDeckSize: 60, maxExtraDeckSize: 15 }
): string | null {
    const result = validateDeck(mainDeck, extraDeck, rules);
    if (!result.valid) return result.errors[0];
    state.decks[playerId] = (mainDeck as CardRecord[]).map((card) => ({ ...card }));
    state.hands[playerId] = [];
    state.extraDecks[playerId] = (extraDeck as CardRecord[]).map((card) => ({ ...card }));
    state.deckCounts[playerId] = mainDeck.length;
    state.extraDeckCounts[playerId] = extraDeck.length;
    state.ready[playerId] = false;
    return null;
}

export function setPlayerReady(state: RoomState, playerId: PlayerId, ready: boolean): string | null {
    if (state.deckCounts[playerId] <= 0) return "Select a deck before readying up.";
    state.ready[playerId] = ready;
    return null;
}