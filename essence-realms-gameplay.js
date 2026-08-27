/* Essence Realms gameplay foundation v1.2 */
function cardDef(card) {
  return card ? functions.getCardData(card) : null;
}

async function setupDuelStart() {
  if (game.data.Game_Logic?.setupComplete) return;

  // Native initialBoardSetup is responsible for the 8 Mana Storage + 6 Life cards.
  // This script only performs the card-dependent portion of setup.
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
      if (moved.length) await functions.updateCards([moved[moved.length - 1]], { isTapped: false });
    }
  }

  // Move exactly two cards from Mana Storage to Mana Pool.
  const pool = cards?.Mana_Pool ?? [];
  const needMana = Math.max(0, 2 - pool.length);
  if (needMana > 0) {
    const storage = cards?.Mana_Storage ?? [];
    const mana = storage.slice(-Math.min(needMana, storage.length));
    if (mana.length) {
      await functions.moveCards(mana, "Mana_Pool");
      const newPool = cards?.Mana_Pool ?? [];
      const moved = newPool.slice(-mana.length);
      if (moved.length) await functions.updateCards(moved, { isTapped: false });
    }
  }

  if ((cards?.Active_Leader ?? []).length >= 1 && (cards?.Mana_Pool ?? []).length >= 2) {
    game.data.Game_Logic.setupComplete = true;
  }
}

async function untapTurnCards() {
  const all = [ ...(cards?.Active_Leader ?? []), ...(cards?.Mana_Pool ?? []), ...(cards?.Unit_Zone ?? []) ];
  if (all.length) await functions.updateCards(all, { isTapped: false });
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
  const isFirstTurn = game.turn.count <= 1;
  if (!isFirstTurn) {
    const storage = cards?.Mana_Storage ?? [];
    if (storage.length) {
      await functions.moveCard(storage[storage.length - 1], "Mana_Pool");
      const pool = cards?.Mana_Pool ?? [];
      if (pool.length) await functions.updateCards([pool[pool.length - 1]], { isTapped: false });
    }
  }
  game.data.Phase_Control.phase = "Draw Phase";
  game.data.Phase_Control.activePlayer = game.turn.orderPosition;
  game.data.Phase_Control.firstTurn = false;
}
