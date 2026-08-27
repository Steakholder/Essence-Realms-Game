/* Essence Realms gameplay foundation v2.7 */

function cardDef(card) {
  return card ? functions.getCardData(card) : null;
}

const LEADER_ORDER = ["er-05", "er-04", "er-03", "er-02", "er-01", "er-00"];

async function setupDuelStart() {
  const state = game.data.Game_Logic;
  if (!state || state.setupComplete || state.setupRunning) return;

  // Native setup must finish the starting Life and Mana first.
  const life = cards?.Life_6 ?? cards?.Life_Zone ?? [];
  const pool = cards?.Mana_Pool ?? [];
  const leaders = cards?.Leader ?? [];

  if (life.length < 1 || pool.length < 2 || leaders.length < 1) return;

  state.setupRunning = true;

  try {
    /*
      First restore the six Leader cards to a deterministic order.
      We only do this when all six expected Leader IDs are present.
    */
    const byDefinition = {};
    for (const card of leaders) {
      const d = cardDef(card);
      if (d?.id) byDefinition[d.id] = card;
    }

    const allLeadersPresent = LEADER_ORDER.every(id => byDefinition[id]);

    if (allLeadersPresent) {
      // Move all six out of the visible Leader deck.
      await functions.moveCards(
        LEADER_ORDER.map(id => byDefinition[id]),
        "Leader_Order_Temp"
      );

      // Put them back in reverse order so er-00 is the top card.
      for (const id of LEADER_ORDER) {
        const temp = cards?.Leader_Order_Temp ?? [];
        const card = temp.find(c => cardDef(c)?.id === id);
        if (card) {
          await functions.moveCard(card, "Leader");
        }
      }
    }

    // Now er-00 is deterministically the top Leader.
    const currentLeaders = cards?.Leader ?? [];
    const levelZero = currentLeaders.find(card => {
      const d = cardDef(card);
      return d?.id === "er-00";
    });

    const active = cards?.Active_Leader ?? [];

    if (!active.length && levelZero) {
      await functions.moveCard(levelZero, "Active_Leader");

      const now = cards?.Active_Leader ?? [];
      if (now.length) {
        await functions.updateCards(
          [now[now.length - 1]],
          { isTapped: false }
        );
      }
    }

    if ((cards?.Active_Leader ?? []).length >= 1) {
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
  if (!game.turn.isMyTurn) return;

  await untapTurnCards();

  const isFirstTurn = game.turn.count <= 1;

  if (!isFirstTurn) {
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

  game.data.Phase_Control.phase = "Draw Phase";
  game.data.Phase_Control.activePlayer = game.turn.orderPosition;
  game.data.Phase_Control.firstTurn = false;
}
