import { DEFAULT_DECK_RULES, DeckRules } from "./card-model";

function positiveInteger(value: string | undefined, fallback: number): number {
    if (!value) return fallback;
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function loadDeckRules(environment: NodeJS.ProcessEnv = process.env): DeckRules {
    return {
        maxMainDeckSize: positiveInteger(environment.MAIN_DECK_MAX, DEFAULT_DECK_RULES.maxMainDeckSize),
        maxExtraDeckSize: positiveInteger(environment.EXTRA_DECK_MAX, DEFAULT_DECK_RULES.maxExtraDeckSize)
    };
}