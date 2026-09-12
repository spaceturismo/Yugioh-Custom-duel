export type CardType = "monster" | "spell" | "trap";

export interface CardRecord {
    id: string;
    name: string;
    type: CardType;
    atk?: number;
    def?: number;
    [key: string]: unknown;
}

export function isValidCardRecord(card: unknown): card is CardRecord {
    if (typeof card !== "object" || card === null) return false;
    const record = card as Record<string, unknown>;
    if (typeof record.id !== "string" || record.id.length === 0) return false;
    if (typeof record.name !== "string" || record.name.trim().length === 0) return false;
    if (record.type !== "monster" && record.type !== "spell" && record.type !== "trap") return false;
    if (record.atk !== undefined && typeof record.atk !== "number") return false;
    if (record.def !== undefined && typeof record.def !== "number") return false;
    return true;
}

export interface DeckValidationResult {
    valid: boolean;
    invalidIndexes: number[];
}

export function validateDeckCards(cards: unknown): DeckValidationResult {
    if (!Array.isArray(cards)) return { valid: false, invalidIndexes: [] };
    const invalidIndexes = cards.reduce<number[]>((invalid, card, index) => {
        if (!isValidCardRecord(card)) invalid.push(index);
        return invalid;
    }, []);
    return { valid: invalidIndexes.length === 0, invalidIndexes };
}