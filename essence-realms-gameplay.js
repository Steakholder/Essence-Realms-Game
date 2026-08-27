/* Essence Realms gameplay foundation v2.1 */
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

  // First player receives no new Mana on the opening turn.
  const isFirstTurn = game.turn.count <= 1;
  if (!isFirstTurn) {
    const storage = cards?.Mana_Storage ?? [];
    if (storage.length) {
      await functions.moveCard(storage[storage.length - 1], "Mana_Pool");
      const pool = cards?.Mana_Pool ?? [];
      if (pool.length) {
        await functions.updateCards([pool[pool.length - 1]], { isTapped: false });
      }
    }
  }

  game.data.Phase_Control.phase = "Draw Phase";
  game.data.Phase_Control.activePlayer = game.turn.orderPosition;
  game.data.Phase_Control.firstTurn = false;
}
