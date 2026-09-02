/*
 * Essence Realms - TCGA gameplay logic
 *
 * Native gamefile setup handles:
 *   - 8 Mana Runes -> Mana Storage
 *   - 2 Mana Runes -> Mana Pool
 *   - 6-card opening hand + mulligan
 *
 * This script handles:
 *   - after all players finish mulliganing: 6 main-deck cards -> Life Zone
 *   - every new turn: untap this player's cards
 *   - except on the first turn: active player draws 1 and moves 1 Mana Storage
 *     card into the Mana Pool
 */

async function setupAfterMulligan() {
    const state = game.data.GameLogic;
    if (state.startupSetupDone) return;

    // The Mana Rune setup is handled natively by beforeGameStart.initialBoardSetup.
    // Only the six Life Zone cards need to wait until after the mulligan.
    await functions.draw(6, false, "LifeZone");

    state.startupSetupDone = true;
}

async function untapMyCards() {
    const sectionNames = [
        "Hand",
        "LV0Leader",
        "Leader",
        "ManaStorage",
        "ActiveUnitZone",
        "Mana",
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
    // onNewTurn fires for every player at every turn change.
    // Untapping is intentionally performed for both players.
    await untapMyCards();

    // The first player's first turn has no draw and no mana transfer.
    if (game.turn.count <= 1) return;

    // Only the active player draws and gains one mana.
    if (!game.turn.isMyTurn) return;

    await functions.draw(1);

    if ((cards?.ManaStorage ?? []).length > 0) {
        await functions.drawFromExtraDeck(
            "ManaStorage",
            1,
            false,
            "Mana"
        );
    }
}
