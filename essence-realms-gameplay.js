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
  const state = game.data.Game_Logic;
  if (!state || state.leaderSetupRunning) return;

  const active = cards?.Active_Leader ?? [];
  const leaderDeck = cards?.Leader ?? [];
  const temp = cards?.Leader_Order_Temp ?? [];

  // The native setup now puts its one random Leader into the hidden temp
  // section. Wait until that card exists before correcting it.
  if (!temp.length && !active.length) return;

  // If Level 0 is already active, there is nothing to do here.
  if (active.length) {
    const activeData = functions.getCardData(active[active.length - 1]);
    if (activeData?.id === "er-00") return;
  }

  // We need the actual Level 0 instance either in the Leader deck or temp.
  let levelZero = leaderDeck.find(c => functions.getCardData(c)?.id === "er-00");
  if (!levelZero) {
    levelZero = temp.find(c => functions.getCardData(c)?.id === "er-00");
  }

  if (!levelZero) return;

  state.leaderSetupRunning = true;

  try {
    // Return any random card that the native setup placed in the temp section.
    // Do not return er-00 if it happened to be the card drawn.
    const tempCards = [...(cards?.Leader_Order_Temp ?? [])];
    for (const card of tempCards) {
      const id = functions.getCardData(card)?.id;
      if (id !== "er-00") {
        await functions.moveCard(card, "Leader", { noLogs: true });
      }
    }

    // Refresh after the return.
    let currentDeck = cards?.Leader ?? [];
    levelZero = currentDeck.find(c => functions.getCardData(c)?.id === "er-00")
      ?? (cards?.Leader_Order_Temp ?? []).find(c => functions.getCardData(c)?.id === "er-00");

    if (!levelZero) return;

    // Put Level 0 face-up into Active Leader.
    await functions.moveCard(levelZero, "Active_Leader", { noLogs: true });

    const nowActive = cards?.Active_Leader ?? [];
    if (nowActive.length) {
      await functions.updateCards(
        [nowActive[nowActive.length - 1]],
        { isTapped: false }
      );
    }
  } finally {
    state.leaderSetupRunning = false;
  }
}

async function ensureLeaderDeckOrder() {
  const state = game.data.Game_Logic;
  if (!state || state.leaderOrderRunning) return;

  const leaderDeck = cards?.Leader ?? [];
  if (leaderDeck.length !== 5) return;

  const expected = ["er-01", "er-02", "er-03", "er-04", "er-05"];
  const byId = {};

  for (const card of leaderDeck) {
    const data = functions.getCardData(card);
    if (data?.id) byId[data.id] = card;
  }

  if (!expected.every(id => byId[id])) return;

  /*
    IMPORTANT: TCG Arena's documented cards.<Section> array treats the
    LAST array item as the top card of a deck.

    Therefore the desired physical order:
      TOP    er-01
             er-02
             er-03
             er-04
      BOTTOM er-05

    corresponds to the array:
      [er-05, er-04, er-03, er-02, er-01]

    We rebuild exactly that array order.
  */
  const currentIds = leaderDeck.map(c => functions.getCardData(c)?.id);
  const desiredIds = ["er-05", "er-04", "er-03", "er-02", "er-01"];

  if (currentIds.join("|") === desiredIds.join("|")) return;

  state.leaderOrderRunning = true;

  try {
    // Empty the deck in a deterministic order.
    for (const id of ["er-05", "er-04", "er-03", "er-02", "er-01"]) {
      const card = byId[id];
      if (card) {
        await functions.moveCard(card, "Leader_Order_Temp", { noLogs: true });
      }
    }

    /*
      Return 05 -> 04 -> 03 -> 02 -> 01.
      This creates [05,04,03,02,01], making er-01 the top card.
    */
    for (const id of ["er-05", "er-04", "er-03", "er-02", "er-01"]) {
      const waiting = cards?.Leader_Order_Temp ?? [];
      const card = waiting.find(c => functions.getCardData(c)?.id === id);
      if (card) {
        await functions.moveCard(card, "Leader", { noLogs: true });
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
