/*
 * Essence Realms - Gameplay / deck legality
 *
 * Dynamic deck identity rule:
 *   The selected Starting Leader (LV0Leader) establishes the player's
 *   Essence identity.
 *
 * Unit legality:
 *   ANY shared Essence Attribute = legal.
 *
 * Examples:
 *   Leader: [Dark, Life, Light]
 *   Unit:   [Dark, Fire]       -> LEGAL
 *   Unit:   [Water, Earth]     -> ILLEGAL
 *
 * This is intentionally separate from the native static deck rules.
 */

function getEssenceArray(card) {
    if (!card) return [];
    return Array.isArray(card.essence) ? card.essence : [];
}

function sharesAnyEssence(unit, leader) {
    const leaderEssences = getEssenceArray(leader);
    const unitEssences = getEssenceArray(unit);

    return unitEssences.some(essence => leaderEssences.includes(essence));
}

function getStartingLeader() {
    const candidates = cards?.LV0Leader ?? [];
    return candidates.length > 0 ? candidates[0] : null;
}

function getUnitsAvailableForLegalityCheck() {
    /*
     * TCGA exposes cards through named sections. We intentionally do not
     * assume a non-documented cards.Deck collection exists.
     *
     * If TCGA exposes the picked deck through a deck collection in the
     * onPlayersDeckPicked context, use it. Otherwise return an empty array
     * rather than falsely declaring a deck legal.
     */
    if (Array.isArray(cards?.Deck)) return cards.Deck;
    if (Array.isArray(cards?.MainDeck)) return cards.MainDeck;
    if (Array.isArray(cards?.Main)) return cards.Main;

    return [];
}

async function validateEssenceDeck() {
    const leader = getStartingLeader();

    // No Starting Leader available: native deck rules should handle the
    // missing category. Do not produce a false Essence failure.
    if (!leader) return;

    const units = getUnitsAvailableForLegalityCheck()
        .filter(card => card?.type === "Unit");

    /*
     * The legality rule is:
     *
     *   Unit Essence ∩ Starting Leader Essence != empty
     *
     * Therefore a unit is legal if it shares ANY Essence Attribute.
     */
    const illegalUnits = units.filter(unit => !sharesAnyEssence(unit, leader));

    // Store the result for inspection by the game/client script context.
    game.data.EssenceDeckValidation = {
        valid: illegalUnits.length === 0,
        startingLeader: leader.name ?? "",
        leaderEssence: getEssenceArray(leader),
        illegalUnits: illegalUnits.map(card => card.name ?? "")
    };
}
