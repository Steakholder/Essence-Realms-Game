/*
 * Essence Realms - TCGA gameplay logic
 * Phase system: Untap -> Draw -> Summon -> Combat -> End
 *
 * PhaseController is a shared custom section in sections.sharedZone.
 * The turn player requests the next phase; the non-turn player approves.
 * The phase may only advance one step at a time and never moves backward.
 *
 * Untap is global in effect: TCGA scripts may only modify the current
 * player's cards, so each client untaps its own cards when Untap is entered.
 * Both clients therefore untap their own board, resulting in both boards
 * being untapped.
 */

const UNIT_SLOTS = [
    "ActiveUnitZone",
    "ActiveUnit2",
    "ActiveUnit3",
    "ActiveUnit4",
    "ActiveUnit5",
    "ActiveUnit6"
];

const PHASES = ["UNTAP", "DRAW", "SUMMON", "COMBAT", "END"];

function phaseLabel(phase) {
    switch (phase) {
        case "UNTAP": return "Untap Phase";
        case "DRAW": return "Draw Phase";
        case "SUMMON": return "Summon Phase";
        case "COMBAT": return "Combat Phase";
        case "END": return "End Phase";
        default: return phase;
    }
}

function nextPhaseName(phase) {
    const index = PHASES.indexOf(phase);
    return index >= 0 && index < PHASES.length - 1 ? PHASES[index + 1] : null;
}

async function setupAfterMulligan() {
    const state = game.data.GameLogic;
    if (state.startupSetupDone) return;
    await functions.draw(6, false, "LifeZone");
    state.startupSetupDone = true;
}

async function setupStartingMana() {
    const state = game.data.GameLogic;
    if (state.startingManaSetupDone) return;

    const manaInPool = (cards?.Mana ?? []).length;
    const manaNeeded = Math.max(0, 2 - manaInPool);
    if (manaNeeded === 0) {
        state.startingManaSetupDone = true;
        return;
    }

    const storage = cards?.ManaStorage ?? [];
    if (storage.length < manaNeeded) return;

    await functions.moveCards(storage.slice(-manaNeeded), "Mana");
    state.startingManaSetupDone = true;
}

async function arrangeUnitSlots() {
    const state = game.data.GameLogic;
    if (state.unitSlotsBusy) return;

    const slotCards = UNIT_SLOTS.map(slot => cards?.[slot] ?? []);
    const units = [];
    for (const slot of slotCards) {
        for (const card of slot) {
            if (functions.getCardData(card)?.type === "Unit") units.push(card);
        }
    }

    if (units.length === 0) return;

    const alreadySeparated = slotCards.every(slot =>
        slot.filter(card => functions.getCardData(card)?.type === "Unit").length <= 1
    );
    if (alreadySeparated && units.length <= UNIT_SLOTS.length) return;

    state.unitSlotsBusy = true;
    try {
        const unitIds = units.map(card => card.id);
        for (const card of units) {
            await functions.moveCard(card, "Hand", { noLogs: true });
        }

        const handUnits = [];
        for (const card of (cards?.Hand ?? [])) {
            if (unitIds.includes(card.id) && functions.getCardData(card)?.type === "Unit") {
                handUnits.push(card);
            }
        }

        for (let i = 0; i < Math.min(handUnits.length, UNIT_SLOTS.length); i++) {
            await functions.moveCard(handUnits[i], UNIT_SLOTS[i], { noLogs: true });
        }
    } finally {
        state.unitSlotsBusy = false;
    }
}

function allOwnBoardSections() {
    return [
        "Hand", "LV0Leader", "Leader", "ManaStorage", ...UNIT_SLOTS,
        "Mana", "Banishment", "Discard", "LifeZone", "Stack"
    ];
}

async function untapOwnCards() {
    const tappedCards = [];
    for (const sectionName of allOwnBoardSections()) {
        for (const card of (cards?.[sectionName] ?? [])) {
            if (card.isTapped) tappedCards.push(card);
        }
    }

    if (tappedCards.length > 0) {
        await functions.updateCards(tappedCards, { isTapped: false });
    }
}

async function drawAndChannel() {
    await functions.draw(1);
    if ((cards?.ManaStorage ?? []).length > 0) {
        await functions.drawFromExtraDeck("ManaStorage", 1, false, "Mana");
    }
}

async function initializePhaseSystem() {
    const phase = game.data.PhaseController;
    if (phase.initialized) return;

    phase.currentPhase = "UNTAP";
    phase.pendingPhase = null;
    phase.transitionId = 0;
    phase.turnCount = game.turn.count;
    phase.effectEpoch = 0;
    phase.initialized = true;
    phase.status = game.turn.isMyTurn
        ? "Turn player: request Draw Phase when ready."
        : "Waiting for the turn player to request Draw Phase.";
}

async function resetPhaseForNewTurn() {
    const phase = game.data.PhaseController;

    // Reset the shared phase state only on the active player's client.
    // Every client independently untaps its own cards.
    await untapOwnCards();

    if (!game.turn.isMyTurn) return;

    phase.currentPhase = "UNTAP";
    phase.pendingPhase = null;
    phase.transitionId += 1;
    phase.turnCount = game.turn.count;
    phase.effectEpoch += 1;
    phase.status = "Turn player: request Draw Phase when ready.";
}

// Called directly by the phase buttons. There is intentionally no disabled
// attribute on the buttons; legality is enforced here instead.
async function requestPhase(targetPhase) {
    const phase = game.data.PhaseController;
    if (!game.turn.isMyTurn) return;
    if (phase.pendingPhase !== null) return;

    const expected = nextPhaseName(phase.currentPhase);
    if (targetPhase !== expected) return;

    phase.pendingPhase = targetPhase;
    phase.transitionId += 1;
    phase.status = `Waiting for opponent approval to enter ${phaseLabel(targetPhase)}.`;
}

async function approvePhase() {
    const phase = game.data.PhaseController;
    if (game.turn.isMyTurn) return;
    if (phase.pendingPhase === null) return;

    // Approval is the only action the non-turn player can take.
    const target = phase.pendingPhase;
    if (target !== nextPhaseName(phase.currentPhase)) return;

    phase.currentPhase = target;
    phase.pendingPhase = null;
    phase.transitionId += 1;
    phase.effectEpoch += 1;
    phase.status = target === "END"
        ? "End Phase. Turn player may end the turn when ready."
        : `Entered ${phaseLabel(target)}.`;
}

async function processPhaseUpdate() {
    const phase = game.data.PhaseController;
    if (!phase.initialized) return;
    await processLocalPhaseEffect();
}

async function processLocalPhaseEffect() {
    const phase = game.data.PhaseController;
    const state = game.data.GameLogic;
    if (state.phaseEffectEpoch === phase.effectEpoch) return;

    state.phaseEffectEpoch = phase.effectEpoch;

    if (phase.currentPhase === "UNTAP") {
        await untapOwnCards();
        return;
    }

    if (phase.currentPhase === "DRAW" && game.turn.isMyTurn) {
        // Turn 1 has no draw/channel. Later turns get one draw and one channel.
        if (game.turn.count <= 1) return;
        await drawAndChannel();
    }
}

async function handleNewTurn() {
    // Native new-turn draw is disabled. Phase actions are handled by the
    // PhaseController instead.
}
