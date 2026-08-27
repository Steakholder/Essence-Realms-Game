/* Essence Realms gameplay foundation v1.0 */
function cardDef(card) { return card ? functions.getCardData(card) : null; }

async function setupDuelStart() {
    if (game.data.Game_Logic?.setupComplete) return;

    // Native beforeGameStart.initialBoardSetup should have placed these cards first.
    const storage = cards?.Mana_Storage ?? [];
    const life = cards?.Life_Zone ?? [];
    if (storage.length < 8 || life.length < 6) return;

    // Move exactly the Level 0 Leader to Active Leader.
    const leaders = cards?.Leader ?? [];
    const levelZero = leaders.find(card => {
        const d = cardDef(card);
        return d?.type === 'Leader' && Number(d?.level) === 0;
    });
    if (levelZero && (cards?.Active_Leader ?? []).length === 0) {
        await functions.moveCard(levelZero, 'Active_Leader');
        const active = cards?.Active_Leader ?? [];
        if (active.length) await functions.updateCards([active[active.length - 1]], { isTapped: false });
    }

    // Move exactly two cards from Mana Storage to Mana Pool.
    const pool = cards?.Mana_Pool ?? [];
    const needed = Math.max(0, 2 - pool.length);
    if (needed > 0) {
        const currentStorage = cards?.Mana_Storage ?? [];
        const mana = currentStorage.slice(-Math.min(needed, currentStorage.length));
        if (mana.length) {
            await functions.moveCards(mana, 'Mana_Pool');
            const newPool = cards?.Mana_Pool ?? [];
            const moved = newPool.slice(-mana.length);
            if (moved.length) await functions.updateCards(moved, { isTapped: false });
        }
    }

    // Mark this player's opening setup complete only after the required moves are done.
    game.data.Game_Logic.setupComplete = true;
}

async function untapTurnCards() {
    const all = [ ...(cards?.Active_Leader ?? []), ...(cards?.Mana_Pool ?? []), ...(cards?.Unit_Zone ?? []) ];
    if (all.length) await functions.updateCards(all, { isTapped: false });
}

async function selectPhase(phase) {
    if (!game.turn.isMyTurn) return;
    game.data.Phase_Control.phase = phase;
    game.data.Phase_Control.activePlayer = game.turn.orderPosition;
    if (phase === 'End Phase') await untapTurnCards();
}

async function handleNewTurn() {
    if (!game.turn.isMyTurn) return;
    await untapTurnCards();
    // The native newTurn system supplies the draw. We add one mana only after the first turn.
    const isFirstTurn = game.turn.count <= 1;
    if (!isFirstTurn) {
        const storage = cards?.Mana_Storage ?? [];
        if (storage.length) {
            const mana = storage[storage.length - 1];
            await functions.moveCard(mana, 'Mana_Pool');
            const pool = cards?.Mana_Pool ?? [];
            if (pool.length) await functions.updateCards([pool[pool.length - 1]], { isTapped: false });
        }
    }
    game.data.Phase_Control.phase = 'Draw Phase';
    game.data.Phase_Control.activePlayer = game.turn.orderPosition;
    game.data.Phase_Control.firstTurn = false;
}
