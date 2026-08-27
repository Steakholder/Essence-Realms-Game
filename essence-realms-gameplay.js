/* Essence Realms gameplay foundation v0.8 */

function cardDef(card) {
    return card ? functions.getCardData(card) : null;
}

function findLevelZeroLeader() {
    const leaders = cards?.Leader ?? [];
    return leaders.find(card => {
        const d = cardDef(card);
        return d?.type === "Leader" && Number(d?.level) === 0;
    });
}

async function setupDuelStart() {
    // Native initialBoardSetup now handles:
    // 8 cards -> Mana_Storage
    // 6 cards -> Life_Zone
    //
    // This script only performs the two actions that require card inspection:
    // Level 0 Leader -> Active Leader
    // 2 Mana Storage cards -> Mana Pool
    const levelZero = findLevelZeroLeader();
    const activeLeader = cards?.Active_Leader ?? [];

    if (levelZero && activeLeader.length === 0) {
        await functions.moveCard(levelZero, "Active_Leader");
        const movedLeader = cards?.Active_Leader ?? [];
        const newest = movedLeader[movedLeader.length - 1];
        if (newest) {
            await functions.updateCards([newest], { isTapped: false });
        }
    }

    const currentPool = cards?.Mana_Pool ?? [];
    const currentStorage = cards?.Mana_Storage ?? [];
    const manaNeeded = Math.max(0, 2 - currentPool.length);

    if (manaNeeded > 0 && currentStorage.length > 0) {
        const manaCards = currentStorage.slice(
            -Math.min(manaNeeded, currentStorage.length)
        );
        await functions.moveCards(manaCards, "Mana_Pool");
        const pool = cards?.Mana_Pool ?? [];
        const movedMana = pool.slice(-manaCards.length);
        if (movedMana.length) {
            await functions.updateCards(movedMana, { isTapped: false });
        }
    }

    game.data.Phase_Control.phase = "Draw Phase";
    game.data.Phase_Control.activePlayer = game.turn.orderPosition;
    game.data.Phase_Control.firstTurn = true;
}

async function untapTurnCards() {
    const toUntap = [
        ...(cards?.Active_Leader ?? []),
        ...(cards?.Mana_Pool ?? []),
        ...(cards?.Unit_Zone ?? [])
    ];
    if (toUntap.length) {
        await functions.updateCards(toUntap, { isTapped: false });
    }
}

async function selectPhase(phase) {
    if (!game.turn.isMyTurn) return;

    game.data.Phase_Control.phase = phase;
    game.data.Phase_Control.activePlayer = game.turn.orderPosition;

    if (phase === "End Phase") {
        await untapTurnCards();
    }
}

async function handleNewTurn() {
    if (!game.turn.isMyTurn) return;

    // The engine's native newTurn system handles the draw:
    // drawOnStart=false means the first player does not draw.
    // drawPerTurn=1 means subsequent turns draw one.
    //
    // We only add the one automatic mana and untap here.
    const isFirstTurn = game.turn.count <= 1;

    await untapTurnCards();

    if (!isFirstTurn) {
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
    }

    game.data.Phase_Control.phase = "Draw Phase";
    game.data.Phase_Control.activePlayer = game.turn.orderPosition;
    game.data.Phase_Control.firstTurn = false;
}
