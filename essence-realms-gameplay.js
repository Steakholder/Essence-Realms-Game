/*
 * Essence Realms - TCGA gameplay logic
 *
 * Native configuration handles the 6-card opening hand and one mulligan.
 * This script handles all custom initialization and turn-start actions.
 */

async function setupAfterMulligan() {
    const state = game.data.GameLogic;

    // onPlayersMulligan fires after every player has finished their
    // mulligan. This state is per-player, so each player initializes
    // their own deck/sections exactly once.
    if (state.startupSetupDone) return;

    // A 60-card main deck has 54 cards remaining after the 6-card hand.
    // We need 14 cards for the initial resource setup.
    const deck = cards?.Deck ?? [];
    if (deck.length < 14) return;

    // From the top of the main deck:
    // 6 -> Mana Storage
    // 2 -> Mana Pool
    // 6 -> Life Zone
    await functions.draw(6, false, "ManaStorage");
    await functions.draw(2, false, "ManaPool");
    await functions.draw(6, false, "LifeZone");

    state.startupSetupDone = true;
}

async function handleNewTurn() {
    if (!game.turn.isMyTurn) return;

    /*
     * drawOnStart is deliberately disabled in gamefile.json because the
     * first player must NOT draw on their first turn.
     *
     * TCGA's turn.count is the global turn count. The first turn is the
     * initial count (0), so no draw or mana transfer occurs there.
     */
    if (game.turn.count === 0) return;

    // Normal draw for the turn player.
    await functions.draw(1);

    // Then move the top card of Mana Storage into Mana Pool.
    if ((cards?.ManaStorage ?? []).length > 0) {
        await functions.drawFromExtraDeck(
            "ManaStorage",
            1,
            false,
            "ManaPool"
        );
    }
}
