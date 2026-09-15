export type CardType = "monster" | "spell" | "trap" | "fusion" | "synchro" | "xyz";

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
    if (!(["monster", "spell", "trap", "fusion", "synchro", "xyz"] as CardType[]).includes(record.type as CardType)) return false;
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

export interface DeckRules {
    maxMainDeckSize: number;
    maxExtraDeckSize: number;
}

export const DEFAULT_DECK_RULES: DeckRules = {
    maxMainDeckSize: 60,
    maxExtraDeckSize: 15
};

export interface FullDeckValidationResult {
    valid: boolean;
    errors: string[];
}

export function validateDeck(
    mainDeck: unknown,
    extraDeck: unknown,
    rules: Partial<DeckRules> = {}
): FullDeckValidationResult {
    const configuredRules = { ...DEFAULT_DECK_RULES, ...rules };
    const errors: string[] = [];
    const mainResult = validateDeckCards(mainDeck);
    const extraResult = validateDeckCards(extraDeck);

    if (!Array.isArray(mainDeck)) {
        errors.push("Main Deck must be an array of cards.");
    } else {
        if (mainDeck.length > configuredRules.maxMainDeckSize) {
            errors.push(`Main Deck cannot exceed ${configuredRules.maxMainDeckSize} cards.`);
        }
        if (!mainResult.valid) {
            errors.push(`Main Deck contains invalid card records at indexes: ${mainResult.invalidIndexes.join(", ")}.`);
        }
    }

    if (!Array.isArray(extraDeck)) {
        errors.push("Extra Deck must be an array of cards.");
    } else {
        if (extraDeck.length > configuredRules.maxExtraDeckSize) {
            errors.push(`Extra Deck cannot exceed ${configuredRules.maxExtraDeckSize} cards.`);
        }
        if (!extraResult.valid) {
            errors.push(`Extra Deck contains invalid card records at indexes: ${extraResult.invalidIndexes.join(", ")}.`);
        }
    }

    return { valid: errors.length === 0, errors };
}