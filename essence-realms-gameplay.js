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
