/*
 * Essence Realms - TCGA gameplay logic
 *
 * The Active Unit Zone is six real, aligned card sections. Slot 1 keeps the
 * original ActiveUnitZone name so existing auto-play destinations remain valid.
 */

const UNIT_SLOTS = [
    "ActiveUnitZone",
    "ActiveUnit2",
    "ActiveUnit3",
    "ActiveUnit4",
    "ActiveUnit5",
    "ActiveUnit6"
];

async function setupAfterMulligan() {
    const state = game.data.GameLogic;
    if (state.startupSetupDone) return;

    // Six cards from the main deck become the Life Zone.
    await functions.draw(6, false, "LifeZone");

    // Mana Rune cards are all placed into Mana Storage at startup. The special
    // Mana section then handles the two starting cards that appear in the Mana
    // Pool, leaving the intended 8 cards in Storage. If any Mana Runes
    // nevertheless reach the opening hand, move only enough of them to Storage
    // to restore Storage to 8.
    const storageCount = (cards?.ManaStorage ?? []).length;
    const needed = Math.max(0, 8 - storageCount);

    if (needed > 0) {
        const handMana = (cards?.Hand ?? []).filter(card =>
            functions.getCardData(card)?.type === "ManaRune"
        );

        for (let i = 0; i < Math.min(needed, handMana.length); i++) {
            await functions.moveCard(handMana[i], "ManaStorage", { noLogs: true });
        }
    }

    state.startupSetupDone = true;
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

    // If the six slots already contain at most one Unit each, nothing needs
    // to happen. This check is important because this function is triggered
    // by onCardsUpdate and must not move cards on every board update.
    const alreadySeparated = slotCards.every(slot => {
        const unitCount = slot.filter(card => functions.getCardData(card)?.type === "Unit").length;
        return unitCount <= 1;
    });
    if (alreadySeparated && units.length <= UNIT_SLOTS.length) return;

    state.unitSlotsBusy = true;
    try {
        const unitIds = units.map(card => card.id);

        // Temporarily gather the affected Units in Hand so that occupied
        // slots cannot collide while we redistribute them.
        for (const card of units) {
            await functions.moveCard(card, "Hand", { noLogs: true });
        }

        // Re-read Hand after the moves to get current card objects.
        const handUnits = [];
        for (const card of (cards?.Hand ?? [])) {
            if (unitIds.includes(card.id) && functions.getCardData(card)?.type === "Unit") {
                handUnits.push(card);
            }
        }

        // Place at most six Units into the six slots. Any additional Unit
        // remains in Hand, enforcing the six-Unit control limit.
        for (let i = 0; i < Math.min(handUnits.length, UNIT_SLOTS.length); i++) {
            await functions.moveCard(handUnits[i], UNIT_SLOTS[i], { noLogs: true });
        }
    } finally {
        state.unitSlotsBusy = false;
    }
}

async function untapMyCards() {
    const sectionNames = [
        "Hand", "LV0Leader", "Leader", "ManaStorage", ...UNIT_SLOTS,
        "Mana", "Banishment", "Discard", "LifeZone", "Stack"
    ];

    for (const sectionName of sectionNames) {
        const sectionCards = cards?.[sectionName] ?? [];
        const tappedCards = sectionCards.filter(card => card.isTapped);
        if (tappedCards.length > 0) {
            await functions.updateCards(tappedCards, { isTapped: false });
        }
    }
}

async function handleNewTurn() {
    await untapMyCards();
    if (!game.turn.isMyTurn) return;

    const state = game.data.GameLogic;

    // game.turn.count is global across players, so it cannot reliably be used
    // to identify a player's first turn. Track that locally instead. Each
    // player skips the Mana Pool transfer and draw on their own first turn.
    if (!state.firstTurnCompleted) {
        state.firstTurnCompleted = true;
        return;
    }

    await functions.draw(1);

    if ((cards?.ManaStorage ?? []).length > 0) {
        await functions.drawFromExtraDeck("ManaStorage", 1, false, "Mana");
    }
}
