/*
 * Essence Realms - TCGA gameplay logic
 *
 * Phase system:
 *   Untap -> Draw -> Summon -> Combat -> End
 *
 * PhaseController is a SHARED custom section rendered in TCGA's sharedZone,
 * so it appears once in the space between the two player boards instead of
 * being duplicated over each player's play area.
 *
 * Only the turn player can request the next phase. The non-turn player sees
 * an approval control only while a transition is pending.
 *
 * IMPORTANT: TCGA scripts can only modify the current player's cards. During
 * the Untap Phase, each client therefore untaps its own cards. Together this
 * untaps every tapped card belonging to BOTH players.
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
        ? "Turn player: choose the next phase when ready."
        : "Waiting for the turn player to request the next phase.";
    phase.initialized = true;
}

async function resetPhaseForNewTurn() {
    const phase = game.data.PhaseController;
    const state = game.data.GameLogic;

    // The new turn begins in Untap Phase. Each client untaps its own cards,
    // which collectively untaps every tapped card for both players.
    await untapOwnCards();

    if (!game.turn.isMyTurn) return;

    phase.currentPhase = "UNTAP";
    phase.pendingPhase = null;
    phase.transitionId += 1;
    phase.approvalId = 0;
    phase.turnCount = game.turn.count;
    phase.effectEpoch += 1;
    state.phaseEffectEpoch = phase.effectEpoch;
    phase.status = "Turn player: choose the next phase when ready.";
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
    if (phase.approvalId === phase.transitionId) return;

    phase.approvalId = phase.transitionId;
    phase.status = `Approved ${phaseLabel(phase.pendingPhase)}.`;
}

async function processPhaseUpdate() {
    const phase = game.data.PhaseController;
    if (!phase.initialized) return;

    // The turn player is the sole authority that resolves the shared
    // transition after the opponent approves it.
    if (phase.pendingPhase !== null && phase.approvalId === phase.transitionId && game.turn.isMyTurn) {
        const next = phase.pendingPhase;
        phase.currentPhase = next;
        phase.pendingPhase = null;
        phase.approvalId = 0;
        phase.effectEpoch += 1;
        phase.status = next === "END"
            ? "End Phase reached. End your turn when ready."
            : `Entered ${phaseLabel(next)}. Choose the next phase when ready.`;
    }

    // Every client watches the resulting effectEpoch and performs the phase's
    // local card operation. This is what makes Untap global across both boards.
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
        // Turn 1 has no draw or channel. Later turns get exactly one of each.
        if (game.turn.count <= 1) return;
        await drawAndChannel();
    }
}

async function handleNewTurn() {
    // New-turn draw/untap/channel are controlled by the phase system now.
}
