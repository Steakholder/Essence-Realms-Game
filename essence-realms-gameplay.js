/* Essence Realms gameplay foundation v2.7 */

function cardDef(card) {
  return card ? functions.getCardData(card) : null;
}

const LEADER_ORDER = ["er-05", "er-04", "er-03", "er-02", "er-01", "er-00"];

async function setupDuelStart() {
  const state = game.data.Game_Logic;
  if (!state || state.setupComplete || state.setupRunning) return;

  const life = cards?.Life_Zone ?? [];
  const pool = cards?.Mana_Pool ?? [];
  const leaders = cards?.Leader ?? [];

  // Native setup must finish before Leader initialization.
  if (life.length < 6 || pool.length < 2 || leaders.length < 1) return;

  state.setupRunning = true;

  try {
    /*
      The Leader deck must be deterministic:
      TOP -> er-00, er-01, er-02, er-03, er-04, er-05 -> BOTTOM.

      Do not use drawFromTop for the Level 0 card because that previously
      produced an apparently random Leader. Reorder the actual card
      instances, then explicitly move er-00 to Active Leader.
    */
    const byDefinition = {};
    for (const card of leaders) {
      const d = cardDef(card);
      if (d?.id) byDefinition[d.id] = card;
    }

    const expected = ["er-00", "er-01", "er-02", "er-03", "er-04", "er-05"];
    const allPresent = expected.every(id => byDefinition[id]);

    if (!allPresent) {
      state.setupRunning = false;
      return;
    }

    const temp = [];
    for (const id of ["er-05", "er-04", "er-03", "er-02", "er-01", "er-00"]) {
      const card = byDefinition[id];
      if (card) {
        await functions.moveCard(card, "Leader_Order_Temp");
      }
    }

    // Move back in reverse so er-00 is the top card.
    for (const id of ["er-05", "er-04", "er-03", "er-02", "er-01", "er-00"]) {
      const waiting = cards?.Leader_Order_Temp ?? [];
      const card = waiting.find(c => cardDef(c)?.id === id);
      if (card) {
        await functions.moveCard(card, "Leader");
      }
    }

    const ordered = cards?.Leader ?? [];
    const levelZero = ordered.find(c => cardDef(c)?.id === "er-00");

    if (!(cards?.Active_Leader ?? []).length && levelZero) {
      await functions.moveCard(levelZero, "Active_Leader");

      const active = cards?.Active_Leader ?? [];
      if (active.length) {
        await functions.updateCards(
          [active[active.length - 1]],
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
