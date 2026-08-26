/*
 Essence Realms gameplay prototype v0.6.1

 Handles:
 - After mulligan: 8 cards to Mana Storage, 6 cards to Life Zone
 - Level 0 Leader -> Active Leader
 - Starting 2 cards in Mana Pool
 - Later turns: untap Active Leader/Mana Pool/Unit Zone, add 1 Mana,
   draw 1
 - End Phase button untaps the ending player's Active Leader/Mana Pool/Unit Zone
 - Shared phase buttons, with only the turn player enabled

 Important API limitation:
 The current documented TCG Arena scripting API does not expose a callable
 "end turn" / "pass priority" function. Therefore the End Phase button cannot
 itself advance the engine to the opponent's turn. It sets End Phase and performs
 the ending player's untap; the engine's native end-turn control must still be
 used to actually advance the turn.
*/

function cardDef(card) {
    return card ? functions.getCardData(card) : null;
}

function findLevelZeroLeader() {
    const leaders = cards?.Leader_Deck ?? [];
    return leaders.find(card => {
        const d = cardDef(card);
        return d?.type === "Leader" && Number(d?.level) === 0;
    });
}

async function afterMulliganSetup() {
    // Only operate on this player's cards. This event runs after all players
    // have completed their mulligan.
    const deck = cards?.Deck ?? [];
    const manaStorage = cards?.Mana_Storage ?? [];
    const life = cards?.Life_Zone ?? [];

    // Guard against accidental duplicate execution.
    if (manaStorage.length < 8 && life.length < 6) {
        // First execution: deal the 8 storage cards and 6 life cards.
        const storageCards = deck.slice(-8);
        if (storageCards.length) {
            await functions.moveCards(storageCards, "Mana_Storage");
        }

        // Re-read the deck after moving the storage cards.
        const deckAfterStorage = cards?.Deck ?? [];
        const lifeCards = deckAfterStorage.slice(-6);
        if (lifeCards.length) {
            await functions.moveCards(lifeCards, "Life_Zone");
        }
    }

    // If the 8/6 cards are already present, do not deal them again.
    const currentStorage = cards?.Mana_Storage ?? [];
    const currentLife = cards?.Life_Zone ?? [];

    // Put Level 0 Leader into Active Leader.
    const levelZero = findLevelZeroLeader();
    if (levelZero && !(cards?.Active_Leader ?? []).length) {
        await functions.moveCard(levelZero, "Active_Leader");
        await functions.updateCards([levelZero], { isTapped: false });
    }

    // Put exactly 2 Mana Storage cards into Mana Pool.
    const currentPool = cards?.Mana_Pool ?? [];
    const manaNeeded = Math.max(0, 2 - currentPool.length);
    if (manaNeeded > 0 && currentStorage.length > 0) {
        const manaCards = currentStorage.slice(-manaNeeded);
        await functions.moveCards(manaCards, "Mana_Pool");
        const poolAfter = cards?.Mana_Pool ?? [];
        const newest = poolAfter.slice(-manaCards.length);
        if (newest.length) {
            await functions.updateCards(newest, { isTapped: false });
        }
    }

    game.data.Gameplay_Status.status = "Opening setup complete";
}

async function beginEndPhase() {
    if (!game.turn.isMyTurn) return;

    // Untap the cards that are defined as untappable at the end of a turn.
    const cardsToUntap = [
        ...(cards?.Active_Leader ?? []),
        ...(cards?.Mana_Pool ?? []),
        ...(cards?.Unit_Zone ?? [])
    ];

    if (cardsToUntap.length) {
        await functions.updateCards(cardsToUntap, { isTapped: false });
    }

    game.data.Phase_Control.phase = "End Phase";
    game.data.Gameplay_Status.status = "End Phase";
}

async function handleNewTurn() {
    if (!game.turn.isMyTurn) return;

    // First player's first turn: no draw and no new mana.
    // The game engine's first global turn is expected to be count 1.
    if (game.turn.count <= 1) {
        game.data.Phase_Control.phase = "Draw Phase";
        game.data.Phase_Control.activePlayer = game.turn.orderPosition;
        game.data.Phase_Control.firstTurn = false;
        return;
    }

    // Start-of-turn untap.
    const cardsToUntap = [
        ...(cards?.Active_Leader ?? []),
        ...(cards?.Mana_Pool ?? []),
        ...(cards?.Unit_Zone ?? [])
    ];

    if (cardsToUntap.length) {
        await functions.updateCards(cardsToUntap, { isTapped: false });
    }

    // Add exactly one Mana Storage card to Mana Pool.
    const storage = cards?.Mana_Storage ?? [];
    if (storage.length) {
        const mana = storage[storage.length - 1];
        await functions.moveCard(mana, "Mana_Pool");
        const pool = cards?.Mana_Pool ?? [];
        const newest = pool[pool.length - 1];
        if (newest) {
            await functions.updateCards([newest], { isTapped: false });
        }
    }

    // Draw one card. If there is no card left, report the loss condition.
    const deck = cards?.Deck ?? [];
    if (deck.length > 0) {
        await functions.draw(1);
    } else {
        functions.chatLog("Draw Phase: no card could be drawn. This player loses the duel.");
        game.data.Gameplay_Status.status = "DRAW FAILED — LOSS CONDITION";
        return;
    }

    game.data.Phase_Control.phase = "Draw Phase";
    game.data.Phase_Control.activePlayer = game.turn.orderPosition;
}
