// The player's rackets: which ones they own, which one they hold, and the coins to buy more (the shop, section 11 of the plan).
// For now this lives on the device: the account's server wallet comes later, and the starting rackets and coins below stand in for it.
import { racketById, plainRacket, starterOwned } from './rackets.js';

export const closetKey = 'oddbirdle-closet';
export const starterCoins = 340;

export function createCloset(storage, { starting = starterOwned, coins = starterCoins } = {}) {
  let state;
  function load() {
    if (state) return state;
    try {
      const saved = JSON.parse(storage?.getItem(closetKey) ?? 'null');
      if (saved && Array.isArray(saved.owned) && Number.isFinite(saved.coins)) {
        state = { owned: saved.owned.filter(id => racketById(id)), equipped: racketById(saved.equipped) ? saved.equipped : plainRacket.id, coins: saved.coins };
      }
    } catch { /* a fresh closet */ }
    state ??= { owned: [...starting], equipped: plainRacket.id, coins };
    if (!state.owned.includes(plainRacket.id)) state.owned.unshift(plainRacket.id);
    if (!state.owned.includes(state.equipped)) state.equipped = plainRacket.id;
    return state;
  }
  const save = () => { try { storage?.setItem(closetKey, JSON.stringify(state)); } catch { /* kept for this visit */ } };
  return {
    get owned() { return [...load().owned]; },
    get equipped() { return load().equipped; },
    get coins() { return load().coins; },
    has: id => load().owned.includes(id),
    // The racket in hand, as the game wants it (the plain one is no shape at all).
    get shape() {
      const racket = racketById(load().equipped);
      return racket && racket.id !== plainRacket.id ? racket : undefined;
    },
    equip(id) {
      if (!load().owned.includes(id) || !racketById(id)) return false;
      state.equipped = id;
      save();
      return true;
    },
    // One racket for coins: only an unowned racket that is for sale, and only with enough coins.
    buy(id) {
      const racket = racketById(id);
      load();
      if (!racket || racket.price <= 0) return { ok: false, reason: 'unknown' };
      if (state.owned.includes(id)) return { ok: false, reason: 'owned' };
      if (state.coins < racket.price) return { ok: false, reason: 'coins' };
      state.coins -= racket.price;
      state.owned.push(id);
      save();
      return { ok: true };
    },
    // Test coins only (until real ones exist).
    addCoins(amount) {
      load().coins += amount;
      save();
    }
  };
}
