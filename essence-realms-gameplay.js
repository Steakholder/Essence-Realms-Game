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
/*
  Level 0 Leader is selected by TCG Arena's native pre-game
  boardCardSelection step. After every player has completed that
  selection, move the selected Level 0 card directly to Active Leader.

  There is deliberately no onCardsUpdate polling here: the opening board
  is established by initialBoardSetup in one flat setup, and this handler
  runs only once after the native pre-game selection is complete.
*/
/*
  Level 0 Leader deployment.

  The target is explicitly the card whose card-data type is exactly
  "Level 0 Leader". The card is moved as an existing card instance; no
  duplicate is created.

  We search the player's Deck first because Level 0 is intentionally left
  there by initialBoardSetup. If the engine exposes the card in another
  pre-game collection after initialization, the fallback search covers the
  player's accessible card collections as well.
*/
/*
  Level 0 Leader deployment.

  TCG Arena moves the "Level 0 Leader" deck category into the sideboard
  before board setup because it is listed in boardCategoriesInSideboard.
  onPlayersDeckPicked fires before the mulligan and before initial board
  setup, so the Level 0 card is removed from the main Deck before ANY
  opening-hand/life/mana draw can touch it.

  The five normal Leader cards remain in the native Leader extra deck.
  They are therefore also unavailable to the Main Deck and opening hand.

  This function moves the existing Level 0 card instance directly to
  Active_Leader. No duplicate is created.
*/
async function placeSelectedLevelZeroLeader() {
  const state = game.data.Game_Logic;
  if (state.levelZeroSetupComplete || state.levelZeroSetupRunning) return;

  const findLevelZero = (collection) => {
    return (collection ?? []).find(card => {
      const data = functions.getCardData(card);
      return data?.type === "Level 0 Leader";
    });
  };

  // boardCategoriesInSideboard should put it here before any board setup.
  let levelZero = findLevelZero(cards?.Sideboard);

  // Defensive fallback: if the engine has not yet exposed the category in
  // Sideboard, find the same exact type in Deck. This still occurs before
  // the mulligan/initial board setup because the event is onPlayersDeckPicked.
  if (!levelZero) levelZero = findLevelZero(cards?.Deck);

  if (!levelZero) return;

  state.levelZeroSetupRunning = true;

  try {
    await functions.moveCard(levelZero, "Active_Leader", { noLogs: true });

    const movedLeader = findLevelZero(cards?.Active_Leader);

    if (movedLeader) {
      // Active_Leader itself is a visible section. Explicitly ensure the
      // card enters upright and face-up rather than inheriting a tapped
      // state from another destination.
      await functions.updateCards(
        [movedLeader],
        { isTapped: false, isHidden: false }
      );
      state.levelZeroSetupComplete = true;
    }
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
