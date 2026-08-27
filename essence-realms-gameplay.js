/* Essence Realms gameplay foundation v1.9 */
function cardDef(card) {
  return card ? functions.getCardData(card) : null;
}

async function setupDuelStart() {
  const state = game.data.Game_Logic;
  if (!state || state.setupComplete || state.setupRunning) return;

  const life = cards?.Life_Zone ?? [];
  const storage = cards?.Mana_Storage ?? [];

  // Wait until the native opening deal has completed.
  if (life.length < 6 || storage.length < 8) return;

  state.setupRunning = true;
  try {
    // Put exactly 2 of the 8 starting Mana Storage cards into Mana Pool.
    let pool = cards?.Mana_Pool ?? [];
    if (pool.length < 2) {
      const needed = 2 - pool.length;
      const available = cards?.Mana_Storage ?? [];
      const toPool = available.slice(Math.max(0, available.length - needed));

      if (toPool.length) {
        await functions.moveCards(toPool, "Mana_Pool");
        pool = cards?.Mana_Pool ?? [];
        if (pool.length) {
          await functions.updateCards(pool, { isTapped: false });
        }
      }
    }

    // Put the Level 0 Leader into Active Leader.
    let active = cards?.Active_Leader ?? [];
    if (!active.length) {
      const leaders = cards?.Leader ?? [];
      const levelZero = leaders.find(card => {
        const d = cardDef(card);
        return d?.type === "Leader" && Number(d?.level) === 0;
      });

      if (levelZero) {
        await functions.moveCard(levelZero, "Active_Leader");
        active = cards?.Active_Leader ?? [];
        if (active.length) {
          await functions.updateCards([active[active.length - 1]], {
            isTapped: false
          });
        }
      }
    }

    pool = cards?.Mana_Pool ?? [];
    active = cards?.Active_Leader ?? [];

    if (pool.length >= 2 && active.length >= 1) {
      state.setupComplete = true;
    }
  } finally {
    state.setupRunning = false;
  }
}

async function untapTurnCards() {
  const all = [
    ...(cards?.Active_Leader ?? []),
    ...(cards?.Mana_Pool ?? []),
    ...(cards?.Unit_Zone ?? [])
  ];
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
      if (pool.length) {
        await functions.updateCards([pool[pool.length - 1]], {
          isTapped: false
        });
      }
    }
  }

  game.data.Phase_Control.phase = "Draw Phase";
  game.data.Phase_Control.activePlayer = game.turn.orderPosition;
  game.data.Phase_Control.firstTurn = false;
}
