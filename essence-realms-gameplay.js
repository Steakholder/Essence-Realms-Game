/*
 * Essence Realms - TCGA gameplay logic
 * Phase system: Untap -> Draw -> Summon -> Combat -> End
 *
 * PhaseController is a shared custom section in sections.sharedZone.
 * Untap Phase begins automatically at the start of each turn.
 * The turn player requests Draw/Summon/Combat/End; the non-turn player approves.
 * The phase may only advance one step at a time and never moves backward.
 *
 * HandLimitController is intentionally NOT shared. It displays the turn
 * player's private hand-selection UI without exposing hand contents to the
 * opponent. The selected cards are returned to the bottom of the Main Deck.
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
const HAND_LIMIT = 7;

function phaseLabel(phase) {
    switch (phase) {
        case "START": return "Start";
        case "UNTAP": return "Untap Phase";
        case "DRAW": return "Draw Phase";
        case "SUMMON": return "Summon Phase";
        case "COMBAT": return "Combat Phase";
        case "END": return "End Phase";
        default: return phase;
    }
}

function nextPhaseName(phase) {
    if (phase === "START") return "UNTAP";
    const index = PHASES.indexOf(phase);
    return index >= 0 && index < PHASES.length - 1 ? PHASES[index + 1] : null;
}

async function setupAfterMulligan() {
    const state = game.data.GameLogic;
    if (state.startupSetupDone) return;
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
        "Mana", "Discard", "Stack"
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
    phase.effectEpoch = 1;
    phase.initialized = true;
    phase.status = "Untap Phase (automatic).";
}

async function resetPhaseForNewTurn() {
    const phase = game.data.PhaseController;
    const hand = game.data.HandLimitController;

    // Do NOT untap here. Untapping is deliberately tied to entering Untap Phase.
    if (!game.turn.isMyTurn) return;

    phase.currentPhase = "UNTAP";
    phase.pendingPhase = null;
    phase.transitionId += 1;
    phase.turnCount = game.turn.count;
    phase.effectEpoch += 1;
    phase.status = "Untap Phase (automatic).";

    hand.visible = false;
    hand.required = 0;
    hand.selectedIds = [];
    hand.handCards = [];
    hand.processing = false;
}

// Called directly by the phase buttons. Legality is enforced here rather than
// by a disabled HTML attribute, so the UI remains selectable and predictable.
async function requestPhase(targetPhase) {
    const phase = game.data.PhaseController;
    if (!game.turn.isMyTurn) return;
    if (phase.pendingPhase !== null) return;

    const expected = nextPhaseName(phase.currentPhase);
    if (targetPhase !== expected || targetPhase === "UNTAP") return;

    phase.pendingPhase = targetPhase;
    phase.transitionId += 1;
    phase.status = `Waiting for opponent approval to enter ${phaseLabel(targetPhase)}.`;
}

async function approvePhase() {
    const phase = game.data.PhaseController;
    if (game.turn.isMyTurn) return;
    if (phase.pendingPhase === null) return;

    const target = phase.pendingPhase;
    if (target !== nextPhaseName(phase.currentPhase)) return;

    phase.currentPhase = target;
    phase.pendingPhase = null;
    phase.transitionId += 1;
    phase.effectEpoch += 1;
    phase.status = target === "END"
        ? "End Phase. Turn player must resolve their hand limit before ending the turn."
        : `Entered ${phaseLabel(target)}.`;
}

async function processPhaseUpdate() {
    const phase = game.data.PhaseController;
    if (!phase.initialized) return;
    await processLocalPhaseEffect();
    if (phase.currentPhase === "END" && game.turn.isMyTurn) {
        await refreshHandLimit();
    }
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

async function refreshHandLimit() {
    const controller = game.data.HandLimitController;
    if (!controller || controller.processing) return;
    if (!game.turn.isMyTurn || game.data.PhaseController.currentPhase !== "END") {
        if (controller.visible) {
            controller.visible = false;
            controller.required = 0;
            controller.selectedIds = [];
            controller.handCards = [];
        }
        return;
    }

    const hand = cards?.Hand ?? [];
    const required = Math.max(0, hand.length - HAND_LIMIT);

    if (required === 0) {
        controller.visible = false;
        controller.required = 0;
        controller.selectedIds = [];
        controller.handCards = [];
        controller.processing = false;
        return;
    }

    const handCards = hand.map(card => {
        const data = functions.getCardData(card);
        return {
            id: card.id,
            label: data?.name ?? "Card"
        };
    });

    const currentIds = controller.handCards.map(card => card.id);
    const newIds = handCards.map(card => card.id);
    const idsChanged = currentIds.length !== newIds.length || currentIds.some((id, i) => id !== newIds[i]);

    controller.visible = true;
    controller.required = required;
    if (idsChanged) {
        controller.handCards = handCards;
        controller.selectedIds = controller.selectedIds.filter(id => newIds.includes(id));
    }
}

async function toggleHandLimitCard(cardId) {
    const controller = game.data.HandLimitController;
    if (!game.turn.isMyTurn || game.data.PhaseController.currentPhase !== "END") return;
    if (!controller.visible || controller.processing) return;

    const handIds = (cards?.Hand ?? []).map(card => card.id);
    if (!handIds.includes(cardId)) return;

    const index = controller.selectedIds.indexOf(cardId);
    if (index >= 0) {
        controller.selectedIds.splice(index, 1);
        return;
    }

    if (controller.selectedIds.length >= controller.required) return;
    controller.selectedIds.push(cardId);
}

async function returnCardsToBottom(selectedCards) {
    const deck = [...(cards?.Deck ?? [])];
    const selectedIds = selectedCards.map(card => card.id);

    // The temporary hidden buffer lets us reconstruct the deck so the chosen
    // cards are inserted before the existing deck order, i.e. at its bottom.
    // We move the selected cards into Deck first, then restore the previous
    // deck order above them.
    for (const card of deck) {
        await functions.moveCard(card, "HandLimitDeckBuffer", { noLogs: true });
    }

    await functions.moveCards(selectedCards, "Deck", { noLogs: true });

    for (const card of deck) {
        await functions.moveCard(card, "Deck", { noLogs: true });
    }
}

async function confirmHandLimit() {
    const controller = game.data.HandLimitController;
    if (!game.turn.isMyTurn || game.data.PhaseController.currentPhase !== "END") return;
    if (!controller.visible || controller.processing) return;
    if (controller.selectedIds.length !== controller.required) return;

    const selected = (cards?.Hand ?? []).filter(card => controller.selectedIds.includes(card.id));
    if (selected.length !== controller.required) return;

    controller.processing = true;
    try {
        await returnCardsToBottom(selected);
        controller.visible = false;
        controller.required = 0;
        controller.selectedIds = [];
        controller.handCards = [];
        game.data.PhaseController.status = "Hand limit resolved. Turn player may end the turn when ready.";
    } finally {
        controller.processing = false;
    }
}

async function handleNewTurn() {
    // Native new-turn draw is disabled. Phase actions are handled by the
    // PhaseController instead.
}
