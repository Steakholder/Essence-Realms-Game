/*
 * Essence Realms - native-board phase controller
 * Board intentionally uses only TCGA native card sections.
 * The only custom section retained is PhaseController, which is UI for phase selection.
 */

const NATIVE_PHASE_ZONES = ["Hand", "Deck", "Discard", "Remove", "Stack"];
const PHASES = ["UNTAP", "DRAW", "SUMMON", "COMBAT", "END"];

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

async function untapOwnCards() {
    const tappedCards = [];
    for (const sectionName of NATIVE_PHASE_ZONES) {
        for (const card of (cards?.[sectionName] ?? [])) {
            if (card.isTapped) tappedCards.push(card);
        }
    }
    if (tappedCards.length > 0) {
        await functions.updateCards(tappedCards, { isTapped: false });
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
    if (!game.turn.isMyTurn) return;
    phase.currentPhase = "UNTAP";
    phase.pendingPhase = null;
    phase.transitionId += 1;
    phase.turnCount = game.turn.count;
    phase.effectEpoch += 1;
    phase.status = "Untap Phase (automatic).";
}

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
    phase.status = `Entered ${phaseLabel(target)}.`;
}

async function processLocalPhaseEffect() {
    const phase = game.data.PhaseController;
    if (phase.effectEpoch === phase.localEffectEpoch) return;
    phase.localEffectEpoch = phase.effectEpoch;
    if (phase.currentPhase === "UNTAP") {
        await untapOwnCards();
    }
}

async function processPhaseUpdate() {
    const phase = game.data.PhaseController;
    if (!phase.initialized) return;
    await processLocalPhaseEffect();
}
