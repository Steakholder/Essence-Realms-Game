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


/*
Stack Action system

The Stack remains TCGA's built-in Stack. The custom UI watches the current
player's top Stack card and exposes actions according to its card type.

IMPORTANT: `cost` is the mana COST spent by tapping untapped Mana_Pool cards.
`manaValue` is a separate card property and is never substituted for `cost`.

Banish and Remove are deliberately different. Banish uses the custom
Banished section. The engine-reserved Remove section is never used because
Remove deletes the card instance.
*/

function getTopStackCard() {
  const stack = cards?.Stack ?? [];
  return stack.length ? stack[stack.length - 1] : null;
}

function getStackCardData(card) {
  return card ? (functions.getCardData(card) ?? {}) : {};
}

function syncStackActionState() {
  const state = game.data.Stack_Actions;
  const top = getTopStackCard();

  if (!top) {
    state.cardId = '';
    state.cardType = '';
    state.cardName = '';
    state.cost = 0;
    state.selectedAction = '';
    state.targetId = '';
    state.targetName = '';
    state.leaderTargetId = '';
    state.leaderTargetName = '';
    state.error = '';
    return;
  }

  const data = getStackCardData(top);
  const type = data.type ?? '';

  if (state.cardId !== top.id) {
    state.selectedAction = '';
    state.targetId = '';
    state.targetName = '';
    state.leaderTargetId = '';
    state.leaderTargetName = '';
    state.error = '';
  }

  state.cardId = top.id;
  state.cardType = type;
  state.cardName = data.name ?? data.face?.front?.name?.name ?? '';
  state.cost = Number(data.cost ?? 0);

  // The default action for Leaders is Return. Units still require an explicit choice.
  if ((type === 'Leader' || type === 'Level_0_Leader') && !state.selectedAction) {
    state.selectedAction = 'Return';
  }
}

function selectUnitStackAction(action) {
  const state = game.data.Stack_Actions;
  if (state.cardType !== 'Unit') return;
  state.selectedAction = action;
  state.error = '';
}

function selectLeaderStackAction(action) {
  const state = game.data.Stack_Actions;
  if (state.cardType !== 'Leader' && state.cardType !== 'Level_0_Leader') return;
  state.selectedAction = action;
  state.error = '';
}

function clearStackAction() {
  const state = game.data.Stack_Actions;
  state.selectedAction = '';
  state.targetId = '';
  state.targetName = '';
  state.leaderTargetId = '';
  state.leaderTargetName = '';
  state.error = '';
}

function findCurrentStackCard() {
  const top = getTopStackCard();
  const state = game.data.Stack_Actions;
  if (!top || top.id !== state.cardId) return null;
  return top;
}

function getUntappedMana() {
  return (cards?.Mana_Pool ?? []).filter(card => !card.isTapped);
}

async function payManaCost(cost) {
  const required = Math.max(0, Number(cost ?? 0));
  const available = getUntappedMana();

  if (available.length < required) return false;
  if (required > 0) {
    await functions.updateCards(available.slice(0, required), { isTapped: true });
  }
  return true;
}

async function payStackCardCost(card) {
  const data = getStackCardData(card);
  // IMPORTANT: cost is the mana COST. manaValue is intentionally not used.
  return await payManaCost(Number(data.cost ?? 0));
}

async function resolveUnitStackAction(card, action) {
  if (action === 'Banish') {
    await functions.moveCard(card, 'Banished');
    return;
  }

  if (action === 'Grave') {
    await functions.moveCard(card, 'Discard');
    return;
  }

  if (action === 'Call') {
    await functions.moveCard(card, 'Unit_Zone');
    return;
  }

  if (action === 'Summon') {
    const paid = await payStackCardCost(card);
    if (!paid) {
      await functions.moveCard(card, 'Discard');
      return;
    }
    await functions.moveCard(card, 'Unit_Zone');
    return;
  }

  if (action === 'Evolve' || action === 'Overlay') {
    // Target selection and native grouping are intentionally left for the
    // dedicated Unit/Leader grouping implementation. No false grouping is done here.
    game.data.Stack_Actions.error = action + ' requires a Unit Zone target and native grouping.';
  }
}

async function resolveLeaderStackAction(card, action) {
  const state = game.data.Stack_Actions;
  const active = cards?.Level_0_Leader?.[0] ?? null;

  if (action === 'Return' || !action) {
    await functions.moveCard(card, 'Leader');
    return;
  }

  if (action !== 'Evolve') {
    state.error = 'Invalid Leader action.';
    return;
  }

  if (!active) {
    state.error = 'No active Leader is available to evolve from.';
    return;
  }

  const activeData = getStackCardData(active);
  const stackData = getStackCardData(card);

  // Evolve cost = max(0, new Leader cost - current Leader cost).
  // This compares mana COST, never manaValue.
  const evolveCost = Math.max(
    0,
    Number(stackData.cost ?? 0) - Number(activeData.cost ?? 0)
  );

  const paid = await payManaCost(evolveCost);
  if (!paid) {
    await functions.moveCard(card, 'Discard');
    return;
  }

  // Put the new Leader into the Active Leader zone. TCGA's documented
  // scripting API does not expose a direct scripted GROUP/attach function;
  // therefore the old Leader is not falsely simulated as grouped here.
  await functions.moveCard(card, 'Level_0_Leader');

  state.error = 'Leader Evolve cost paid and new Leader placed in Active Leader. Native grouping still requires TCGA\'s native GROUP resolution path.';
}

async function resolveCurrentStackAction() {
  const state = game.data.Stack_Actions;
  const card = findCurrentStackCard();

  if (!card) {
    state.error = 'No card is currently on top of the Stack.';
    return;
  }

  const data = getStackCardData(card);
  const type = data.type ?? '';
  const action = state.selectedAction || (type === 'Leader' || type === 'Level_0_Leader' ? 'Return' : '');

  state.error = '';

  if (!action) {
    state.error = 'Select an action first.';
    return;
  }

  if (type === 'Unit') {
    await resolveUnitStackAction(card, action);
    return;
  }

  if (type === 'Leader' || type === 'Level_0_Leader') {
    await resolveLeaderStackAction(card, action);
    return;
  }

  // Preserve the default Stack resolution for card types not yet given a custom action panel.
  await functions.moveCard(card, 'Discard');
}

