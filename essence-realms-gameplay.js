/* Essence Realms gameplay foundation v1.1 */
function cardDef(card) {
    return card ? functions.getCardData(card) : null;
}

async function setupDuelStart() {
    if (game.data.Game_Logic?.setupComplete) return;
    if (!game.data.Game_Logic?.mulliganFinished) return;

    // Opening sequence AFTER both players finish mulliganing:
    // 8 cards -> Mana Storage, 6 cards -> Life Zone.
    // The current player can only modify their own cards.
    const storage = cards?.Mana_Storage ?? [];
    const life = cards?.Life_Zone ?? [];

    if (storage.length < 8) {
        await functions.draw(8 - storage.length, false, "Mana_Storage");
    }
    if (life.length < 6) {
        await functions.draw(6 - life.length, false, "Life_Zone");
    }

    // The Leader category is placed on the board before setup.
    // Find this player's Level 0 Leader and make it the Active Leader.
    const leaders = cards?.Leader ?? [];
    const active = cards?.Active_Leader ?? [];
    if (!active.length) {
        const levelZero = leaders.find(card => {
            const d = cardDef(card);
            return d?.type === "Leader" && Number(d?.level) === 0;
        });
        if (levelZero) {
            await functions.moveCard(levelZero, "Active_Leader");
            const moved = cards?.Active_Leader ?? [];
            if (moved.length) {
                await functions.updateCards([moved[moved.length - 1]], { isTapped:false });
            }
        }
    }

    // Exactly two of the eight stored cards become starting Mana.
    const currentPool = cards?.Mana_Pool ?? [];
    const needMana = Math.max(0, 2 - currentPool.length);
    if (needMana > 0) {
        const currentStorage = cards?.Mana_Storage ?? [];
        const mana = currentStorage.slice(-Math.min(needMana, currentStorage.length));
        if (mana.length) {
            await functions.moveCards(mana, "Mana_Pool");
            const pool = cards?.Mana_Pool ?? [];
            const moved = pool.slice(-mana.length);
            if (moved.length) {
                await functions.updateCards(moved, { isTapped:false });
            }
        }
    }

    // Only mark complete once the intended opening state exists.
    if ((cards?.Life_Zone ?? []).length >= 6 &&
        (cards?.Mana_Pool ?? []).length >= 2 &&
        (cards?.Active_Leader ?? []).length >= 1) {
        game.data.Game_Logic.setupComplete = true;
    }
}

async function untapTurnCards() {
    const all = [
        ...(cards?.Active_Leader ?? []),
        ...(cards?.Mana_Pool ?? []),
        ...(cards?.Unit_Zone ?? [])
    ];
    if (all.length) await functions.updateCards(all, { isTapped:false });
}

async function selectPhase(phase) {
    if (!game.turn.isMyTurn) return;
    game.data.Phase_Control.phase = phase;
    game.data.Phase_Control.activePlayer = game.turn.orderPosition;
    if (phase === "End Phase") await untapTurnCards();
}

async function handleNewTurn() {
    if (!game.turn.isMyTurn) return;

    await untapTurnCards();

    // First turn: no additional Mana. Later turns: +1 Mana.
    const isFirstTurn = game.turn.count <= 1;
    if (!isFirstTurn) {
        const storage = cards?.Mana_Storage ?? [];
        if (storage.length) {
            const mana = storage[storage.length - 1];
            await functions.moveCard(mana, "Mana_Pool");
            const pool = cards?.Mana_Pool ?? [];
            if (pool.length) {
                await functions.updateCards([pool[pool.length - 1]], { isTapped:false });
            }
        }
    }

    game.data.Phase_Control.phase = "Draw Phase";
    game.data.Phase_Control.activePlayer = game.turn.orderPosition;
    game.data.Phase_Control.firstTurn = false;
}
