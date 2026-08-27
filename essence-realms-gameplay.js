/* Essence Realms gameplay foundation v2.0 */
function cardDef(card) {
  return card ? functions.getCardData(card) : null;
}

async function setupDuelStart() {
  if (game.data.Game_Logic?.setupComplete) return;

  const leaders = cards?.Leader ?? [];
  const active = cards?.Active_Leader ?? [];

  // Native initialBoardSetup must have dealt the starting resources first.
  const life = cards?.Life_Zone ?? [];
  const storage = cards?.Mana_Storage ?? [];
  if (life.length < 6 || storage.length < 8) return;

  // Put Level 0 Leader into Active Leader.
  if (!active.length) {
    const levelZero = leaders.find(card => {
      const d = cardDef(card);
      return d?.type === "Leader" && Number(d?.level) === 0;
    });

    if (levelZero) {
      await functions.moveCard(levelZero, "Active_Leader");
      const moved = cards?.Active_Leader ?? [];
      if (moved.length) {
        await functions.updateCards(
          [moved[moved.length - 1]],
          { isTapped: false }
        );
      }
    }
  }

  // Move exactly two cards from Mana Storage to Mana Pool.
  const pool = cards?.Mana_Pool ?? [];
  const needMana = Math.max(0, 2 - pool.length);

  if (needMana > 0) {
    const currentStorage = cards?.Mana_Storage ?? [];
    const mana = currentStorage.slice(
      -Math.min(needMana, currentStorage.length)
    );

    if (mana.length) {
      await functions.moveCards(mana, "Mana_Pool");

      const newPool = cards?.Mana_Pool ?? [];
      const moved = newPool.slice(-mana.length);

      if (moved.length) {
        await functions.updateCards(moved, { isTapped: false });
      }
    }
  }

  if (
    (cards?.Active_Leader ?? []).length >= 1 &&
    (cards?.Mana_Pool ?? []).length >= 2
  ) {
    game.data.Game_Logic.setupComplete = true;
  }
}

async function untapTurnCards() {
  const all = [
    ...(cards?.Active_Leader ?? []),
    ...(cards?.Mana_Pool ?? []),
    ...(cards?.Unit_Zone ?? [])
  ];

  if (all.length) {
    await functions.updateCards(all, { isTapped: false });
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
  await untapTurnCards();

  const isFirstTurn = game.turn.count <= 1;

  if (!isFirstTurn && game.turn.isMyTurn) {
    const storage = cards?.Mana_Storage ?? [];

    if (storage.length) {
      await functions.moveCard(
        storage[storage.length - 1],
        "Mana_Pool"
      );

      const pool = cards?.Mana_Pool ?? [];

      if (pool.length) {
        await functions.updateCards(
          [pool[pool.length - 1]],
          { isTapped: false }
        );
      }
    }
  }

  if (game.turn.isMyTurn) {
    game.data.Phase_Control.phase = "Draw Phase";
    game.data.Phase_Control.activePlayer = game.turn.orderPosition;
    game.data.Phase_Control.firstTurn = false;
  }
}
