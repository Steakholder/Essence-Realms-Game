/*
 * Essence Realms - TCGA gameplay logic
 *
 * Starting Mana flow:
 *   1. TCGA puts all 10 Mana Runes into ManaStorage before the game starts.
 *   2. After every player finishes all pre-game steps, the top 2 Mana Runes
 *      are moved from ManaStorage into the special Mana section.
 *   3. This leaves exactly 8 Mana Runes in ManaStorage and 2 Mana in the pool.
 *
 * ManaStorage also uses its native extra-deck click destination so a Mana Rune
 * clicked from Storage goes directly into the Mana pool.
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

    // Six cards from the main deck become the Life Zone after mulligan.
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

    // cards arrays are ordered with the top of a deck-like section at the end.
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

    // Each player's first turn skips both the normal draw and Mana transfer.
    if (!state.firstTurnCompleted) {
        state.firstTurnCompleted = true;
        return;
    }

    await functions.draw(1);

    if ((cards?.ManaStorage ?? []).length > 0) {
        await functions.drawFromExtraDeck("ManaStorage", 1, false, "Mana");
    }
}
