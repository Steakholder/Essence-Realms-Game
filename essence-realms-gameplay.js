/* Essence Realms gameplay foundation v2.5 */

/*
Opening setup is intentionally NOT performed by this file.
TCG Arena's beforeGameStart.initialBoardSetup handles:
  - 8 cards -> Mana Storage
  - 6 Life cards -> Life_6 ... Life_1
  - 2 Mana Storage -> Mana Pool
  - 1 Level 0 Leader -> Active Leader

The setup is a single flat array, so the same sequence is applied to
both players. This avoids the previous seat-specific initialization
problem.
*/


/*
  Leader correction only.

  Native V2.5 setup still performs the initial Leader draw. If TCG Arena
  happens to choose a Leader other than er-00, this function returns that
  card to the Leader Deck and moves the actual er-00 card to Active Leader.

  No Mana, Life, Main Deck, layout, or other opening behavior is changed.
*/
async function ensureLevelZeroLeader() {
  const active = cards?.Active_Leader ?? [];
  const leaderDeck = cards?.Leader ?? [];

  if (!active.length || !leaderDeck.length) return;

  const activeCard = active[active.length - 1];
  const activeData = functions.getCardData(activeCard);

  if (activeData?.id === "er-00") return;

  const levelZero = leaderDeck.find(card => {
    const data = functions.getCardData(card);
    return data?.id === "er-00";
  });

  if (!levelZero) return;

  // Return the randomly selected Leader to the Leader Deck first.
  await functions.moveCard(activeCard, "Leader");

  // Then put the actual Level 0 Leader into Active Leader.
  await functions.moveCard(levelZero, "Active_Leader");

  const nowActive = cards?.Active_Leader ?? [];
  if (nowActive.length) {
    await functions.updateCards(
      [nowActive[nowActive.length - 1]],
      { isTapped: false }
    );
  }
}


/*
  Leader Deck ordering only.

  Once Level 0 is active, the remaining five Leaders are ordered:
    TOP    er-01 (Level 1)
           er-02 (Level 2)
           er-03 (Level 3)
           er-04 (Level 4)
    BOTTOM er-05 (Level 5)

  Level 0 is already in Active Leader, so it cannot simultaneously remain
  in the physical Leader Deck. The Leader section remains V2.5.1's
  isHidden: "yes" DECK section, so all cards in the deck remain face-down.
*/
async function ensureLeaderDeckOrder() {
  const state = game.data.Game_Logic;
  if (!state || state.leaderOrderComplete || state.leaderOrderRunning) return;

  const leaderDeck = cards?.Leader ?? [];

  // After Level 0 is active, exactly five Leaders should remain.
  if (leaderDeck.length !== 5) return;

  const expected = ["er-01", "er-02", "er-03", "er-04", "er-05"];
  const byId = {};

  for (const card of leaderDeck) {
    const data = functions.getCardData(card);
    if (data?.id) byId[data.id] = card;
  }

  if (!expected.every(id => byId[id])) return;

  /*
    Lock the function before the first move.

    onCardsUpdate fires after card movements, so without this lock the
    five moves into/out of the temporary section can start multiple copies
    of this function at the same time. That can corrupt the deck order and
    cause the temporary section to be manipulated repeatedly.
  */
  state.leaderOrderRunning = true;

  try {
    // Empty the Leader deck in a deterministic order.
    for (const id of ["er-05", "er-04", "er-03", "er-02", "er-01"]) {
      const card = byId[id];
      if (card) {
        await functions.moveCard(card, "Leader_Order_Temp", { noLogs: true });
      }
    }

    /*
      Rebuild in the opposite direction.

      TCG Arena's DECK presentation treats the first card in the resulting
      section stack as the visually/topmost card. Returning 01 -> 05 gives:

        TOP    er-01
               er-02
               er-03
               er-04
        BOTTOM er-05
    */
    for (const id of ["er-01", "er-02", "er-03", "er-04", "er-05"]) {
      const waiting = cards?.Leader_Order_Temp ?? [];
      const card = waiting.find(c => functions.getCardData(c)?.id === id);
      if (card) {
        await functions.moveCard(card, "Leader", { noLogs: true });
      }
    }

    const finalDeck = cards?.Leader ?? [];

    if (finalDeck.length === 5) {
      const first = finalDeck[0];
      const last = finalDeck[finalDeck.length - 1];
      const firstId = first ? functions.getCardData(first)?.id : null;
      const lastId = last ? functions.getCardData(last)?.id : null;

      if (firstId === "er-01" && lastId === "er-05") {
        state.leaderOrderComplete = true;
      }
    }
  } finally {
    state.leaderOrderRunning = false;
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
  /*
    onNewTurn fires for a new turn, and the script may only modify the
    current player's own cards. Therefore only the active player performs
    the Mana/untap actions below.
  */
  if (!game.turn.isMyTurn) return;

  await untapTurnCards();

  // The first player's opening turn gets no additional Mana.
  const isFirstTurn = game.turn.count <= 1;

  if (!isFirstTurn) {
    const storage = cards?.Mana_Storage ?? [];

    if (storage.length) {
      const nextMana = storage[storage.length - 1];

      await functions.moveCard(nextMana, "Mana_Pool");

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
