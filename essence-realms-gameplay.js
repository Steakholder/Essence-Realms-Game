/*
 * Essence Realms - TCGA gameplay logic
 *
 * Phase system:
 *   Untap -> Draw -> Summon -> Combat -> End
 *
 * The phase controller is a shared custom section. The active player requests
 * the next phase and the opponent approves it. Each player's client then
 * performs the local card operations that belong to that phase. This is
 * necessary because TCGA scripting only permits a player to modify their own
 * cards.
 *
 * IMPORTANT: The Untap phase therefore runs untapOwnCards() on BOTH clients,
 * which collectively untaps every tapped card belonging to both players.
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

function nextPhaseName(phase) {
    const index = PHASES.indexOf(phase);
    return index >= 0 && index < PHASES.length - 1 ? PHASES[index + 1] : null;
}

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

    const topMana = storage.slice(-manaNeeded);
    await functions.moveCards(topMana, "Mana");
    state.startingManaSetupDone = true;
}

async function arrangeUnitSlots() {
    const state = game.data.GameLogic;
    if (state.unitSlotsBusy) return;

    const slotCards = UNIT_SLOTS.map(slot => cards?.[slot] ?? []);
    const units = [];
    for (const slot of slotCards) {
        for (const card of slot) {
            const data = functions.getCardData(card);
            if (data?.type === "Unit") units.push(card);
        }
    }

    if (units.length === 0) return;

    const alreadySeparated = slotCards.every(slot => {
        const unitCount = slot.filter(card => functions.getCardData(card)?.type === "Unit").length;
        return unitCount <= 1;
    });
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
        const sectionCards = cards?.[sectionName] ?? [];
        for (const card of sectionCards) {
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
    phase.approvalId = 0;
    phase.turnCount = game.turn.count;
    phase.effectEpoch = 0;
    phase.status = game.turn.isMyTurn
        ? "You are the turn player. Request the Draw Phase when ready."
        : "Waiting for the turn player to request the Draw Phase.";
    phase.initialized = true;
}

async function resetPhaseForNewTurn() {
    const phase = game.data.PhaseController;
    const state = game.data.GameLogic;

    // Entering Untap Phase happens automatically when a new turn begins.
    // Every player runs this locally, so ALL tapped cards belonging to BOTH
    // players are untapped without one player trying to modify the opponent's
    // cards (which TCGA does not permit).
    await untapOwnCards();

    // Only the active player writes the shared phase state. This prevents both
    // clients from racing to reset the same shared object.
    if (!game.turn.isMyTurn) return;

    phase.currentPhase = "UNTAP";
    phase.pendingPhase = null;
    phase.transitionId += 1;
    phase.approvalId = 0;
    phase.turnCount = game.turn.count;
    phase.effectEpoch += 1;
    state.phaseEffectEpoch = phase.effectEpoch;
    phase.status = "You are the turn player. Request the Draw Phase when ready.";
}

async function requestNextPhase() {
    const phase = game.data.PhaseController;
    if (!game.turn.isMyTurn) return;
    if (phase.pendingPhase !== null) return;

    const next = nextPhaseName(phase.currentPhase);
    if (!next) return;

    phase.pendingPhase = next;
    phase.transitionId += 1;
    phase.approvalId = 0;
    phase.status = `Waiting for opponent approval to enter ${phaseLabel(next)}.`;
}

async function approvePhase() {
    const phase = game.data.PhaseController;
    if (game.turn.isMyTurn) return;
    if (phase.pendingPhase === null) return;

    phase.approvalId = phase.transitionId;
    phase.status = `Approved ${phaseLabel(phase.pendingPhase)}.`;
}

async function processPhaseUpdate() {
    const phase = game.data.PhaseController;

    if (!phase.initialized) return;
    if (phase.pendingPhase === null) return;
    if (phase.approvalId !== phase.transitionId) return;

    // Only the turn player resolves the approved shared transition. The shared
    // state change is then observed by both clients.
    if (!game.turn.isMyTurn) return;

    const next = phase.pendingPhase;
    phase.currentPhase = next;
    phase.pendingPhase = null;
    phase.approvalId = 0;
    phase.effectEpoch += 1;
    phase.status = next === "END"
        ? "End Phase reached. Finish the turn using the normal End Turn control."
        : `Entered ${phaseLabel(next)}. Request the next phase when ready.`;

    await processLocalPhaseEffect();
}

async function processLocalPhaseEffect() {
    const phase = game.data.PhaseController;
    const state = game.data.GameLogic;
    if (state.phaseEffectEpoch === phase.effectEpoch) return;

    state.phaseEffectEpoch = phase.effectEpoch;

    if (phase.currentPhase === "UNTAP") {
        // This runs independently on each player's client. Together, the two
        // executions untap ALL tapped cards for BOTH players.
        await untapOwnCards();
        return;
    }

    if (phase.currentPhase === "DRAW" && game.turn.isMyTurn) {
        // First turn gets no draw/channel. Later turns get exactly one each.
        if (game.turn.count <= 1) return;
        await drawAndChannel();
    }
}

async function handleNewTurn() {
    // Native turn-change effects are intentionally empty now. Untap, Draw,
    // and Channel are performed by phase transitions instead.
}
