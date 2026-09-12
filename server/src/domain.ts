import { validateDeck, type CardRecord, type DeckRules } from "./card-model";

export type PlayerId = "player-1" | "player-2";
export type DuelPhase = "draw" | "main1" | "battle" | "main2" | "end";

export interface RoomState {
    roomId: string;
    phase: "waiting" | "active" | "finished";
    players: PlayerId[];
    currentTurn: PlayerId | null;
    currentPhase: DuelPhase | null;
    winner: PlayerId | null;
    lifePoints: Record<PlayerId, number>;
    deckCounts: Record<PlayerId, number>;
    handCounts: Record<PlayerId, number>;
    extraDeckCounts: Record<PlayerId, number>;
    ready: Record<PlayerId, boolean>;
    decks: Record<PlayerId, CardRecord[]>;
    hands: Record<PlayerId, CardRecord[]>;
    extraDecks: Record<PlayerId, CardRecord[]>;
    fields: Record<PlayerId, CardRecord[]>;
    graveyards: Record<PlayerId, CardRecord[]>;
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
        currentPhase: null,
        winner: null,
        lifePoints: { "player-1": 8000, "player-2": 8000 },
        deckCounts: { "player-1": 40, "player-2": 40 },
        handCounts: { "player-1": 5, "player-2": 5 },
        extraDeckCounts: { "player-1": 0, "player-2": 0 },
        ready: { "player-1": false, "player-2": false },
        decks: { "player-1": [], "player-2": [] },
        hands: { "player-1": [], "player-2": [] },
        extraDecks: { "player-1": [], "player-2": [] }
        ,fields: { "player-1": [], "player-2": [] },
        graveyards: { "player-1": [], "player-2": [] }
    };
}

export function startGame(
    state: RoomState,
    chooseFirstPlayer: () => PlayerId = () => "player-1"
): string | null {
    if (state.players.length !== 2) return "Two players are required to start.";
    if (!state.ready["player-1"] || !state.ready["player-2"]) return "Both players must be ready to start.";
    state.phase = "active";
    state.currentTurn = chooseFirstPlayer();
    state.currentPhase = "draw";
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
    if (state.currentPhase !== "draw") return "You can only draw during the Draw Phase.";
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
    state.currentPhase = "main1";
    return null;
}

export function advancePhase(state: RoomState, playerId: PlayerId): string | null {
    if (state.phase !== "active") return "The game has not started.";
    if (state.currentTurn !== playerId) return "It is not your turn.";
    if (state.currentPhase === null) return "The game phase is not initialized.";

    const nextPhase: Record<DuelPhase, DuelPhase> = {
        draw: "main1",
        main1: "battle",
        battle: "main2",
        main2: "end",
        end: "draw"
    };
    state.currentPhase = nextPhase[state.currentPhase];
    if (state.currentPhase === "draw") {
        state.currentTurn = playerId === "player-1" ? "player-2" : "player-1";
    }
    return null;
}

export function endTurn(state: RoomState, playerId: PlayerId): string | null {
    if (state.phase !== "active") return "The game has not started.";
    if (state.currentTurn !== playerId) return "It is not your turn.";
    if (state.currentPhase !== "end") return "You can only end your turn during the End Phase.";
    return advancePhase(state, playerId);
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
    state.fields[playerId] = [];
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

export function playCard(state: RoomState, playerId: PlayerId, handIndex: number): string | null {
    if (state.phase !== "active") return "The game has not started.";
    if (state.currentTurn !== playerId) return "It is not your turn.";
    if (state.currentPhase !== "main1" && state.currentPhase !== "main2") {
        return "You can only play cards during a Main Phase.";
    }
    const card = state.hands[playerId][handIndex];
    if (!card) return "Card was not found in your hand.";
    state.hands[playerId].splice(handIndex, 1);
    state.fields[playerId].push(card);
    state.handCounts[playerId] = state.hands[playerId].length;
    return null;
}

export function attack(
    state: RoomState,
    attackerId: PlayerId,
    attackerIndex: number,
    defenderId: PlayerId,
    defenderIndex: number
): string | null {
    if (state.phase !== "active") return "The game has not started.";
    if (state.currentTurn !== attackerId) return "It is not your turn.";
    if (state.currentPhase !== "battle") return "You can only attack during the Battle Phase.";
    const attacker = state.fields[attackerId][attackerIndex];
    const defender = state.fields[defenderId][defenderIndex];
    if (!attacker || !defender) return "Attack target was not found.";
    const difference = (attacker.atk || 0) - (defender.atk || 0);
    if (difference > 0) {
        state.lifePoints[defenderId] -= difference;
        state.fields[defenderId].splice(defenderIndex, 1);
        state.graveyards[defenderId].push(defender);
    } else if (difference < 0) {
        state.lifePoints[attackerId] += difference;
        state.fields[attackerId].splice(attackerIndex, 1);
        state.graveyards[attackerId].push(attacker);
    } else {
        state.fields[defenderId].splice(defenderIndex, 1);
        state.fields[attackerId].splice(attackerIndex, 1);
        state.graveyards[defenderId].push(defender);
        state.graveyards[attackerId].push(attacker);
    }
    if (state.lifePoints[defenderId] <= 0) {
        state.phase = "finished";
        state.winner = attackerId;
    } else if (state.lifePoints[attackerId] <= 0) {
        state.phase = "finished";
        state.winner = defenderId;
    }
    return null;
}