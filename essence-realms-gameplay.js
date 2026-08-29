/*
 * Essence Realms - TCGA gameplay logic
 *
 * Native gamefile configuration handles:
 * - 6-card starting hand
 * - one mulligan
 * - one draw at the start of every turn
 * - automatic untapping
 *
 * This script handles:
 * - post-mulligan resource setup
 * - automatic Mana Storage -> Mana Pool at turn start
 */

async function setupAfterMulligan() {
    const logic = game.data.GameLogic;

    // This event fires only after every player has finished their mulligan.
    // Each player's script context operates on that player's own cards.
    if (logic?.startupSetupDone) return;

    const deck = cards?.Deck ?? [];
    if (deck.length < 14) return;

    // Top 6 cards of the main deck -> Mana Storage.
    await functions.draw(6, false, "ManaStorage");

    // Next 2 cards -> Mana Pool.
    await functions.draw(2, false, "ManaPool");

    // Next 6 cards -> Life Zone.
    await functions.draw(6, false, "LifeZone");

    game.data.GameLogic.startupSetupDone = true;
}

async function handleNewTurn() {
    // onNewTurn fires for every new turn. Only the turn player performs
    // the Mana Storage -> Mana Pool transfer.
    if (!game.turn.isMyTurn) return;

    if ((cards?.ManaStorage ?? []).length === 0) return;

    // ManaStorage is an extra-deck section; draw its top card and force
    // the destination to ManaPool.
    await functions.drawFromExtraDeck(
        "ManaStorage",
        1,
        false,
        "ManaPool"
    );
}
