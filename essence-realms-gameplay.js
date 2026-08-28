/* Essence Realms gameplay foundation v2.5.27 */

/*
Opening Leader setup is intentionally handled entirely by TCG Arena's
native beforeGameStart.initialBoardSetup. The six Leaders are one normal
Leader category. The opening setup draws exactly one card from the Leader
deck directly into Active_Leader with isHidden=false and isTapped=false.
No script moves, searches for, duplicates, or corrects Leaders.
*/

async function untapTurnCards() {
  const all = [
    ...(cards?.Level_0_Leader ?? []),
    ...(cards?.Mana_Pool ?? []),
    ...(cards?.Unit_Zone ?? [])
  ];

  if (all.length) {
    await functions.updateCards(all, { isTapped: false });
  }
}

async function enforceLifeZoneRules() {
  // Life cards must never remain tapped. TCGA does not expose an untappable
  // section flag, so enforce the state whenever a card update occurs.
  const life = cards?.Life_Zone ?? [];
  const tappedLife = life.filter(card => card.isTapped);
  if (tappedLife.length) {
    await functions.updateCards(tappedLife, { isTapped: false });
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
  // Untap this player's cards at the start of every turn, regardless of
  // whose turn it is. Each player's script handles its own cards, which
  // makes the untap effectively occur at both the start and end of every
  // player's turn without attempting to modify the opponent's cards.
  await untapTurnCards();

  // Only the player whose turn it is performs the normal turn-start
  // draw/mana-channeling actions and updates the shared phase state.
  // Untapping above intentionally remains outside this check so each
  // player's script untaps their own Leader, Units, and Mana at every
  // turn boundary.
  if (!game.turn.isMyTurn) return;

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
