/*
 * Essence Realms - TCGA gameplay logic
 *
 * Native configuration:
 *   - 6-card opening hand
 *   - exactly one all-six-card mulligan
 *   - no automatic first-turn draw
 *
 * Scripted rules:
 *   - after BOTH players finish mulliganing:
 *       6 cards -> Mana Storage
 *       2 cards -> Mana Pool
 *       6 cards -> Life Zone
 *   - at every turn start:
 *       untap all cards owned by this player
 *   - except on the first turn:
 *       current turn player draws 1
 *       current turn player moves 1 Mana Storage card -> Mana Pool
 */

async function setupAfterMulligan() {
    const state = game.data.GameLogic;

    // onPlayersMulligan fires once all players have completed the mulligan.
    // GameLogic is per-player, so each player performs this setup on their
    // own deck exactly once.
    if (state.startupSetupDone) return;

    // functions.draw() already knows the player's main deck. There is no
    // need to inspect the deck through the read-only cards object here.

    // Top 6 -> Mana Storage.
    await functions.draw(6, false, "ManaStorage");

    // Next 2 -> Mana Pool.
    await functions.draw(2, false, "ManaPool");

    // Next 6 -> Life Zone.
    await functions.draw(6, false, "LifeZone");

    state.startupSetupDone = true;
}

async function untapMyCards() {
    // onNewTurn runs for each player, so both sides untap independently.
    const sectionNames = [
        "Hand",
        "LV0Leader",
        "Leader",
        "ManaStorage",
        "ActiveUnitZone",
        "ManaPool",
        "Banishment",
        "Discard",
        "LifeZone",
        "Stack"
    ];

    for (const sectionName of sectionNames) {
        const sectionCards = cards?.[sectionName] ?? [];
        const tappedCards = sectionCards.filter(card => card.isTapped);

        if (tappedCards.length > 0) {
            await functions.updateCards(tappedCards, { isTapped: false });
        }
    }
}

async function handleNewTurn() {
    // Both players execute this event, so both sides untap independently.
    await untapMyCards();

    // The first player's first turn has no draw and no mana transfer.
    if (game.turn.count <= 1) return;

    // Only the active/turn player draws and gains one mana.
    if (!game.turn.isMyTurn) return;

    await functions.draw(1);

    // Move the top card of Mana Storage to Mana Pool.
    if ((cards?.ManaStorage ?? []).length > 0) {
        await functions.drawFromExtraDeck(
            "ManaStorage",
            1,
            false,
            "ManaPool"
        );
    }
}

/*
 * Dynamic Essence deck legality
 *
 * Starting Leader establishes the Essence Identity.
 * A Unit is legal when it shares ANY Essence Attribute with that leader.
 *
 * Example:
 *   Leader: [Dark, Life, Light]
 *   Unit:   [Dark, Fire] -> legal
 *   Unit:   [Water, Earth] -> illegal
 *
 * IMPORTANT:
 * Runtime cards only expose id/tapped/owner/counters. Static card fields
 * (type, name, essence, etc.) must be read with functions.getCardData(card).
 */

function getStaticCardData(card) {
    if (!card) return null;
    return functions.getCardData(card) ?? null;
}

function getEssences(cardData) {
    return Array.isArray(cardData?.essence) ? cardData.essence : [];
}

function sharesAnyEssence(unitData, leaderData) {
    const leaderEssences = getEssences(leaderData);
    const unitEssences = getEssences(unitData);

    return unitEssences.some(essence => leaderEssences.includes(essence));
}

function getPickedStartingLeaderData() {
    const runtimeLeader = cards?.LV0Leader?.[0];
    return getStaticCardData(runtimeLeader);
}

function getPickedDeckUnits() {
    /*
     * onPlayersDeckPicked fires after deck selection, but TCGA's scripting
     * documentation does not assign a fixed name to the native main-deck
     * collection. cards is an object containing arrays for sections currently
     * holding cards. Therefore inspect all exposed card arrays and identify
     * Unit cards by their static card data.
     *
     * Exclude known non-main-deck sections so a board/leader card cannot be
     * accidentally treated as a deck Unit if the event context exposes it.
     */
    const excludedSections = new Set([
        "Hand",
        "LV0Leader",
        "Leader",
        "ManaStorage",
        "ActiveUnitZone",
        "ManaPool",
        "Banishment",
        "Discard",
        "LifeZone",
        "Stack",
        "GameLogic"
    ]);

    const units = [];
    const seen = new Set();

    for (const [sectionName, sectionCards] of Object.entries(cards ?? {})) {
        if (excludedSections.has(sectionName)) continue;
        if (!Array.isArray(sectionCards)) continue;

        for (const runtimeCard of sectionCards) {
            if (!runtimeCard?.id || seen.has(runtimeCard.id)) continue;

            const data = getStaticCardData(runtimeCard);
            if (data?.type === "Unit") {
                seen.add(runtimeCard.id);
                units.push({ runtimeCard, data });
            }
        }
    }

    return units;
}

async function validateEssenceDeck() {
    const leaderData = getPickedStartingLeaderData();

    if (!leaderData) {
        game.data.GameLogic.essenceDeckValid = false;
        game.data.GameLogic.essenceDeckError =
            "No Starting Leader was found.";
        return;
    }

    const leaderEssences = getEssences(leaderData);
    const units = getPickedDeckUnits();

    const illegalUnits = units.filter(
        unit => !sharesAnyEssence(unit.data, leaderData)
    );

    game.data.GameLogic.essenceDeckValid = illegalUnits.length === 0;
    game.data.GameLogic.startingLeaderName = leaderData.name ?? "";
    game.data.GameLogic.startingLeaderEssence = leaderEssences;
    game.data.GameLogic.illegalUnitNames =
        illegalUnits.map(unit => unit.data.name ?? unit.data.id ?? "Unknown Unit");

    if (illegalUnits.length === 0) {
        game.data.GameLogic.essenceDeckError = "";
        functions.chatLog(
            "Essence deck check passed: every Unit shares at least 1 Essence Attribute with the Starting Leader."
        );
    } else {
        game.data.GameLogic.essenceDeckError =
            "Illegal Unit cards: " +
            game.data.GameLogic.illegalUnitNames.join(", ");

        functions.chatLog(
            "Essence deck check failed: " +
            game.data.GameLogic.essenceDeckError
        );
    }
}
