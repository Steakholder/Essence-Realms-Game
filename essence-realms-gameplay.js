/* Essence Realms gameplay foundation v2.9 */

function cardDef(card) {
  return card ? functions.getCardData(card) : null;
}

/*
  Leader order:
    TOP    er-00 (Level 0)
           er-01 (Level 1)
           er-02 (Level 2)
           er-03 (Level 3)
           er-04 (Level 4)
    BOTTOM er-05 (Level 5)

  Opening Mana/Life setup is native in gamefile.json, using the same
  initialBoardSetup that was known to work in v1.6.
*/
async function setupDuelStart() {
  const state = game.data.Game_Logic;
  if (!state || state.setupComplete || state.setupRunning) return;

  const life = cards?.Life_Zone ?? [];
  const pool = cards?.Mana_Pool ?? [];
  const leaders = cards?.Leader ?? [];

  if (life.length < 6 || pool.length < 2 || leaders.length < 6) return;

  state.setupRunning = true;

  try {
    const ids = ["er-00","er-01","er-02","er-03","er-04","er-05"];
    const byId = {};

    for (const card of leaders) {
      const d = cardDef(card);
      if (d?.id) byId[d.id] = card;
    }

    if (!ids.every(id => byId[id])) return;

    // Empty the Leader deck into the hidden temporary deck.
    for (const id of ["er-05","er-04","er-03","er-02","er-01","er-00"]) {
      const card = byId[id];
      if (card) await functions.moveCard(card, "Leader_Order_Temp");
    }

    // Rebuild it so er-00 is the top card.
    for (const id of ["er-05","er-04","er-03","er-02","er-01","er-00"]) {
      const waiting = cards?.Leader_Order_Temp ?? [];
      const card = waiting.find(c => cardDef(c)?.id === id);
      if (card) await functions.moveCard(card, "Leader");
    }

    const ordered = cards?.Leader ?? [];
    const levelZero = ordered.find(c => cardDef(c)?.id === "er-00");
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
