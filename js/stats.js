// Decision tracking persisted to localStorage.

const KEY = 'uth-trainer-stats-v1';
const MAX_MISTAKES = 100;
export const CATEGORIES = ['preflop', 'flop', 'river', 'drill'];
export const START_BANKROLL = 1000;

export function emptyStats() {
  return {
    by: Object.fromEntries(CATEGORIES.map((c) => [c, { correct: 0, total: 0 }])),
    streak: 0,
    bestStreak: 0,
    hands: 0,
    bankroll: START_BANKROLL,
    counts: { exact: 0, close: 0, total: 0 },
    mistakes: [],
  };
}

export class Stats {
  constructor(storage = globalThis.localStorage) {
    this.storage = storage;
    this.data = this.load();
    this.session = { correct: 0, total: 0 };
  }

  load() {
    try {
      const raw = this.storage?.getItem(KEY);
      if (!raw) return emptyStats();
      const parsed = JSON.parse(raw);
      const base = emptyStats();
      return { ...base, ...parsed, by: { ...base.by, ...parsed.by }, counts: { ...base.counts, ...parsed.counts } };
    } catch {
      return emptyStats();
    }
  }

  save() {
    try {
      this.storage?.setItem(KEY, JSON.stringify(this.data));
    } catch {
      // Storage full or disabled (private mode). Stats still work for this session.
    }
  }

  /** Record one decision. `mistake` is stored when wrong so it can be reviewed later. */
  record(category, isCorrect, mistake) {
    const b = this.data.by[category];
    b.total++;
    this.session.total++;
    if (isCorrect) {
      b.correct++;
      this.session.correct++;
      this.data.streak++;
      this.data.bestStreak = Math.max(this.data.bestStreak, this.data.streak);
    } else {
      this.data.streak = 0;
      if (mistake) {
        this.data.mistakes.unshift({ ts: Date.now(), category, ...mistake });
        this.data.mistakes.length = Math.min(this.data.mistakes.length, MAX_MISTAKES);
      }
    }
    this.save();
  }

  recordCount(guess, actual) {
    const c = this.data.counts;
    c.total++;
    if (guess === actual) c.exact++;
    if (Math.abs(guess - actual) <= 2) c.close++;
    this.save();
  }

  recordHand(net) {
    this.data.hands++;
    this.data.bankroll += net;
    this.save();
  }

  resetBankroll() {
    this.data.bankroll = START_BANKROLL;
    this.save();
  }

  reset() {
    this.data = emptyStats();
    this.session = { correct: 0, total: 0 };
    this.save();
  }

  totals() {
    let correct = 0;
    let total = 0;
    for (const c of CATEGORIES) {
      correct += this.data.by[c].correct;
      total += this.data.by[c].total;
    }
    return { correct, total };
  }
}

export function pct(correct, total) {
  return total ? Math.round((correct / total) * 100) : null;
}
