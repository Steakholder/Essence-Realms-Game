/* Essence Realms gameplay foundation v0.6.3 */

function cardDef(card) { return card ? functions.getCardData(card) : null; }

function findLevelZeroLeader() {
    const leaders = [...(cards?.Leader_Deck ?? []), ...(cards?.Sideboard ?? [])];
    return leaders.find(card => {
        const d = cardDef(card);
        return d?.type === "Leader" && Number(d?.level) === 0;
    });
}

async function ensureLeaderDeck() {
    const sideboardLeaders = (cards?.Sideboard ?? []).filter(card => cardDef(card)?.type === "Leader");
    if (sideboardLeaders.length) await functions.moveCards(sideboardLeaders, "Leader_Deck");
}

async function afterMulliganSetup() {
    // This runs after the built-in mulligan, so the opening hand is already settled.
    const storage = cards?.Mana_Storage ?? [];
    const life = cards?.Life_Zone ?? [];
    const deck = cards?.Deck ?? [];

    if (storage.length < 8 && deck.length) {
        await functions.draw(Math.min(8 - storage.length, deck.length), false, "Mana_Storage");
    }

    const deckAfterStorage = cards?.Deck ?? [];
    const lifeNow = cards?.Life_Zone ?? [];
    if (lifeNow.length < 6 && deckAfterStorage.length) {
        await functions.draw(Math.min(6 - lifeNow.length, deckAfterStorage.length), false, "Life_Zone");
    }

    await ensureLeaderDeck();

    const levelZero = findLevelZeroLeader();
    if (levelZero && !(cards?.Active_Leader ?? []).length) {
        await functions.moveCard(levelZero, "Active_Leader");
        await functions.updateCards([levelZero], { isTapped: false });
    }

    const currentStorage = cards?.Mana_Storage ?? [];
    const currentPool = cards?.Mana_Pool ?? [];
    const manaNeeded = Math.max(0, 2 - currentPool.length);
    if (manaNeeded > 0 && currentStorage.length) {
        const manaCards = currentStorage.slice(-Math.min(manaNeeded, currentStorage.length));
        await functions.moveCards(manaCards, "Mana_Pool");
        const poolAfter = cards?.Mana_Pool ?? [];
        const newest = poolAfter.slice(-manaCards.length);
        if (newest.length) await functions.updateCards(newest, { isTapped: false });
    }

    game.data.Phase_Control.phase = "Draw Phase";
    game.data.Phase_Control.activePlayer = game.turn.orderPosition;
    game.data.Phase_Control.firstTurn = true;
}

async function untapTurnCards() {
    const toUntap = [...(cards?.Active_Leader ?? []), ...(cards?.Mana_Pool ?? []), ...(cards?.Unit_Zone ?? [])];
    if (toUntap.length) await functions.updateCards(toUntap, { isTapped: false });
}

async function selectPhase(phase) {
    if (!game.turn.isMyTurn) return;
    game.data.Phase_Control.phase = phase;
    game.data.Phase_Control.activePlayer = game.turn.orderPosition;
    if (phase === "End Phase") await untapTurnCards();
}

async function handleNewTurn() {
    if (!game.turn.isMyTurn) return;
    const isFirstTurn = game.turn.count <= 1;
    await untapTurnCards();
    if (!isFirstTurn) {
        const storage = cards?.Mana_Storage ?? [];
        if (storage.length) {
            const mana = storage[storage.length - 1];
            await functions.moveCard(mana, "Mana_Pool");
            const pool = cards?.Mana_Pool ?? [];
            const newest = pool[pool.length - 1];
            if (newest) await functions.updateCards([newest], { isTapped: false });
        }
        const deck = cards?.Deck ?? [];
        if (deck.length) {
            await functions.draw(1);
        } else {
            functions.chatLog("Draw Phase: no card could be drawn. This player loses the duel.");
        }
    }
    game.data.Phase_Control.phase = "Draw Phase";
    game.data.Phase_Control.activePlayer = game.turn.orderPosition;
    game.data.Phase_Control.firstTurn = false;
}
