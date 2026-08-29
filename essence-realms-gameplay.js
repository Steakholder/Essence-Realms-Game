/*
 * Essence Realms - TCGA gameplay logic
 *
 * Native configuration:
 *   - 6-card opening hand
 *   - exactly one all-six-card mulligan
 *   - no automatic first-turn draw
 *
 * Scripted rules:
 *   - after both players finish mulliganing:
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

    // onPlayersMulligan fires only after every player has completed the
    // mulligan step.
    if (state.startupSetupDone) return;

    const deck = cards?.Deck ?? [];

    // After a six-card opening hand, the main deck still contains plenty
    // of cards. Require the fourteen cards needed for initialization.
    if (deck.length < 14) return;

    await functions.draw(6, false, "ManaStorage");
    await functions.draw(2, false, "ManaPool");
    await functions.draw(6, false, "LifeZone");

    state.startupSetupDone = true;
}

async function untapMyCards() {
    // Scripts can only modify the current player's cards. onNewTurn runs
    // for each player, so this untaps both sides independently.
    const sectionNames = [
        "Hand",
        "Deck",
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
    // This event runs for each player at the start of every new turn.
    // Therefore every player can untap their own cards.
    await untapMyCards();

    // The first global turn is the only turn with no draw and no mana
    // transfer. TCGA exposes the global sum of player turn counts here.
    // Treat 0/1 as the initial turn so this remains safe across the
    // engine's initial turn-count convention.
    if (game.turn.count <= 1) return;

    // Only the actual turn player performs the draw and mana gain.
    if (!game.turn.isMyTurn) return;

    await functions.draw(1);

    const manaStorage = cards?.ManaStorage ?? [];
    if (manaStorage.length > 0) {
        await functions.drawFromExtraDeck(
            "ManaStorage",
            1,
            false,
            "ManaPool"
        );
    }
}
