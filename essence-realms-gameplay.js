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
/*
  Level 0 Leader is now its own native card-type category.
  The deckbuilder therefore automatically places cards with
  type "Level 0 Leader" into that category, while levels 1-5 remain
  in the built-in Leader category.

  At game start, the selected Level 0 card is already in the player's
  sideboard/category pool. We identify that actual card instance and move
  it directly to Active Leader. No random Leader draw or replacement is used.
*/
async function ensureLevelZeroLeaderFromCategory() {
  const state = game.data.Game_Logic;
  if (!state || state.levelZeroSetupComplete || state.levelZeroSetupRunning) return;

  const active = cards?.Active_Leader ?? [];
  const sideboard = cards?.Sideboard ?? [];

  if (active.length) {
    const activeData = functions.getCardData(active[active.length - 1]);
    if (activeData?.type === "Level 0 Leader") {
      state.levelZeroSetupComplete = true;
      return;
    }
  }

  const levelZero = sideboard.find(card => {
    const d = functions.getCardData(card);
    return d?.type === "Level 0 Leader";
  });

  if (!levelZero) return;

  state.levelZeroSetupRunning = true;

  try {
    await functions.moveCard(levelZero, "Active_Leader", { noLogs: true });

    const nowActive = cards?.Active_Leader ?? [];
    if (nowActive.length) {
      await functions.updateCards(
        [nowActive[nowActive.length - 1]],
        { isTapped: false, isHidden: false }
      );
    }

    state.levelZeroSetupComplete = true;
  } finally {
    state.levelZeroSetupRunning = false;
  }
}

async function ensureLeaderDeckOrder() {
  const state = game.data.Game_Logic;
  if (!state || state.leaderOrderRunning || state.leaderSetupRunning) return;

  // Ordering is only valid after Level 0 is active and exactly five Leaders
  // remain in the real Leader Deck.
  const active = cards?.Active_Leader ?? [];
  const leaderDeck = cards?.Leader ?? [];

  if (active.length !== 1 || leaderDeck.length !== 5) return;

  const activeData = functions.getCardData(active[active.length - 1]);
  if (activeData?.id !== "er-00") return;

  const desiredIds = ["er-05", "er-04", "er-03", "er-02", "er-01"];
  const byId = {};

  for (const card of leaderDeck) {
    const id = functions.getCardData(card)?.id;
    if (id) byId[id] = card;
  }

  if (!desiredIds.every(id => byId[id])) return;

  /*
    cards.<Section> uses the LAST array entry as the top of a deck.

    Desired physical order:
      TOP    er-01
             er-02
             er-03
             er-04
      BOTTOM er-05

    Desired array:
      [er-05, er-04, er-03, er-02, er-01]

    Unlike the previous implementation, we NEVER move these cards into
    another section. The Leader Deck therefore never becomes a temporary
    zero-card zone and ownership cannot cross to the opponent's deck.
  */
  const currentIds = leaderDeck.map(c => functions.getCardData(c)?.id);
  if (currentIds.join("|") === desiredIds.join("|")) return;

  state.leaderOrderRunning = true;

  try {
    const desiredCards = desiredIds.map(id => byId[id]);

    /*
      Re-submit the five actual card instances to their EXISTING Leader
      section as one batch. This is the documented moveCards() operation,
      and avoids the empty temporary section that caused the 0-count bug.
    */
    await functions.moveCards(desiredCards, "Leader", { noLogs: true });
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
