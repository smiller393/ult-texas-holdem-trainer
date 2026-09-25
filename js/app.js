import {
  cardId, parseCard, rankLabel, rankName, SUIT_SYMBOLS, SUIT_NAMES, SUITS, RANKS, dealHand,
} from './cards.js';
import { bestHand, describeHand } from './evaluator.js';
import {
  preflopDecision, riverDecision, holeCode, ACTION_LABELS, OUTS_THRESHOLD, countOuts,
} from './strategy.js';
import { newHand, act, visibleBoard, RAISE_MULT } from './game.js';
import { Stats, pct, CATEGORIES } from './stats.js';

const UNIT = 10; // dollars per ante
const $ = (sel, el = document) => el.querySelector(sel);
const stats = new Stats();
const prefs = loadPrefs();

// ---------- Rendering helpers ----------

function cardHTML(c, opts = {}) {
  if (!c) return '<div class="card slot" aria-hidden="true"></div>';
  const delay = opts.delay ? ` style="animation-delay:${opts.delay}ms"` : '';
  const anim = opts.anim ? ' deal' : '';
  if (opts.back) return `<div class="card back${anim}"${delay} role="img" aria-label="Face-down card"></div>`;
  return `<div class="card s-${c.s}${anim}"${delay} role="img" aria-label="${rankName(c.r)} of ${SUIT_NAMES[c.s]}" data-card="${cardId(c)}">`
    + `<span class="c-corner"><span class="c-rank">${rankLabel(c.r)}</span><span class="c-suit">${SUIT_SYMBOLS[c.s]}</span></span>`
    + `<span class="c-pip">${SUIT_SYMBOLS[c.s]}</span></div>`;
}

function miniHTML(c) {
  return `<span class="mini s-${c.s}">${rankLabel(c.r)}${SUIT_SYMBOLS[c.s]}</span>`;
}

const money = (n) => `${n < 0 ? '−' : '+'}$${Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const bank = (n) => `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

function button(label, action, cls = '', kbd = '') {
  return `<button type="button" class="btn ${cls}" data-action="${action}">${label}${kbd ? `<span class="kbd">${kbd}</span>` : ''}</button>`;
}

function flash(el, ok) {
  el.classList.remove('flash-ok', 'flash-bad');
  void el.offsetWidth;
  el.classList.add(ok ? 'flash-ok' : 'flash-bad');
  if (!ok && navigator.vibrate) navigator.vibrate(60);
}

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 1600);
}

function renderScorePill() {
  const s = stats.session;
  const p = pct(s.correct, s.total);
  $('#scorePill').innerHTML = s.total
    ? `<span class="acc">${p}%</span><span class="muted">${s.correct}/${s.total}</span><span class="streak" title="Current streak">🔥 ${stats.data.streak}</span>`
    : `<span class="muted">Session</span><span class="acc">–</span><span class="streak" title="Current streak">🔥 ${stats.data.streak}</span>`;
}

/**
 * Explain a river spot's dealer outs: count, threshold meter, groups by reason,
 * and a 52-card grid highlighting every out.
 */
function outsHTML(o, hole, board, guess = null) {
  const n = o.outs.length;
  const ok = n < OUTS_THRESHOLD;
  const scale = (v) => `${Math.min(100, (v / 30) * 100)}%`;
  const groups = o.groups.map((g) => `
    <li><span class="og-count">${g.count}</span><span class="og-label">${g.label}</span>
    <span class="og-ranks">${g.ranks.map(rankChip).join('')}</span></li>`).join('');
  const ties = o.ties.length ? `
    <li class="og-ties"><span class="og-count">${o.ties.length}</span><span class="og-label">Push only (not outs)</span>
    <span class="og-ranks">${o.tieRanks.map(rankChip).join('')}</span></li>` : '';

  const outIds = new Set(o.outs.map(cardId));
  const tieIds = new Set(o.ties.map(cardId));
  const holeIds = new Set(hole.map(cardId));
  const boardIds = new Set(board.map(cardId));
  let grid = '<div class="gh"></div>' + RANKS.map((r) => `<div class="gh">${rankLabel(r)}</div>`).join('');
  for (const s of SUITS) {
    grid += `<div class="gs s-${s}">${SUIT_SYMBOLS[s]}</div>`;
    for (const r of RANKS) {
      const id = cardId({ r, s });
      const cls = holeIds.has(id) ? 'hole' : boardIds.has(id) ? 'board' : outIds.has(id) ? 'out' : tieIds.has(id) ? 'tie' : '';
      grid += `<div class="gc ${cls}" title="${rankName(r)} of ${SUIT_NAMES[s]}">${rankLabel(r)}</div>`;
    }
  }
  const guessMark = guess != null ? `<div class="meter-guess" style="left:${scale(guess)}" title="Your count: ${guess}"></div>` : '';
  return `
  <div class="outs">
    <div class="outs-summary">
      <span class="outs-num ${ok ? 'good' : 'bad'}">${n}</span>
      <span class="outs-verdict">dealer outs → ${ok ? '<span class="good">Raise 1x</span>' : '<span class="bad">Fold</span>'}</span>
      ${guess != null ? `<span class="muted small">(you counted ${guess}${guess === n ? ', exactly right' : ''})</span>` : ''}
    </div>
    <div class="meter" aria-hidden="true">
      <div class="meter-fill ${ok ? 'good' : 'bad'}" style="width:${scale(n)}"></div>
      <div class="meter-mark" style="left:${scale(OUTS_THRESHOLD)}"><span>21</span></div>
      ${guessMark}
    </div>
    ${groups || ties ? `<ul class="out-groups">${groups}${ties}</ul>` : '<p class="small muted">Nothing the dealer can catch beats you.</p>'}
    <div class="ogrid" aria-label="All 52 cards with dealer outs highlighted">${grid}</div>
    <div class="legend">
      <span style="--c:#7f2429">Out (beats you)</span><span style="--c:#6b5214">Push</span>
      <span style="--c:#1a2621">Safe</span><span style="--c:var(--gold)">Your cards</span><span style="--c:#e7ece9">Board</span>
    </div>
  </div>`;
}

function rankChip({ r, n }) {
  return `<span class="rchip">${rankLabel(r)}<small>×${n}</small></span>`;
}

// ---------- Play mode ----------

const play = {
  state: null,
  shownBoard: 0,
  dealerShown: false,

  deal() {
    this.state = newHand();
    this.shownBoard = 0;
    this.dealerShown = false;
    this.render(true);
  },

  choose(action) {
    const before = this.state;
    if (!before || before.street === 'showdown') return;
    const allowed = Object.keys(ACTION_LABELS[before.street]);
    if (!allowed.includes(action)) return;
    this.state = act(before, action);
    const d = this.state.decisions.at(-1);
    stats.record(d.street, d.isCorrect, d.isCorrect ? null : mistakeFrom(before.player, before.board.slice(0, visibleBoard(before)), d));
    if (this.state.result) stats.recordHand(this.state.result.net * UNIT);
    flash($('#playActions'), d.isCorrect);
    renderScorePill();
    this.render();
  },

  render(fresh = false) {
    const s = this.state;
    const showdown = s.street === 'showdown';
    const nBoard = showdown ? 5 : visibleBoard(s);

    // Dealer
    const dealerAnim = showdown && !this.dealerShown;
    $('#dealerCards').innerHTML = s.dealer.map((c, i) => cardHTML(c, {
      back: !showdown, anim: fresh || dealerAnim, delay: dealerAnim ? 150 * Math.max(0, nBoard - this.shownBoard) + i * 90 : i * 60 + 120,
    })).join('');
    $('#dealerDesc').textContent = showdown ? s.result.dealerDesc + (s.result.qualifies ? '' : ' · no qualify') : '';

    // Board
    const board = [];
    for (let i = 0; i < 5; i++) {
      if (i < nBoard) {
        const isNew = i >= this.shownBoard;
        board.push(cardHTML(s.board[i], { anim: isNew, delay: isNew ? (i - this.shownBoard) * 110 : 0 }));
      } else {
        board.push(cardHTML(null));
      }
    }
    $('#boardCards').innerHTML = board.join('');
    this.shownBoard = nBoard;
    this.dealerShown = showdown;

    // Player
    if (fresh) $('#playerCards').innerHTML = s.player.map((c, i) => cardHTML(c, { anim: true, delay: i * 90 })).join('');
    const pHand = bestHand([...s.player, ...s.board.slice(0, nBoard)]);
    $('#playerDesc').textContent = nBoard === 0 ? holeCode(s.player) : describeHand(pHand);

    // Bets
    const r = s.result;
    const chip = (name, amount, res) => `<span class="chip ${name.toLowerCase()} ${res > 0 ? 'win' : res < 0 ? 'lose' : ''}"><i></i>${name} <span class="amt">$${amount}</span>${r ? ` <span class="muted">${res > 0 ? money(res) : res < 0 ? 'lost' : 'push'}</span>` : ''}</span>`;
    $('#bets').innerHTML = chip('Ante', UNIT, (r?.ante ?? 0) * UNIT) + chip('Blind', UNIT, (r?.blind ?? 0) * UNIT)
      + (s.playMult ? chip('Play', s.playMult * UNIT, (r?.play ?? 0) * UNIT) : '');

    // Status + actions
    const status = $('#playStatus');
    const actions = $('#playActions');
    if (showdown) {
      status.innerHTML = resultHTML(s);
      actions.className = 'actions single';
      actions.innerHTML = button('Deal next hand', 'deal', 'primary', 'Space');
    } else {
      const prompts = {
        preflop: ['Preflop', 'Raise 4x or check?'],
        flop: ['Flop', 'Raise 2x or check?'],
        river: ['River', 'Raise 1x or fold?'],
      };
      const [street, q] = prompts[s.street];
      status.innerHTML = `<div class="prompt"><span class="street">${street}</span>${q}</div><div class="bankroll">Bankroll ${bank(stats.data.bankroll)}</div>`;
      actions.className = 'actions';
      actions.innerHTML = s.street === 'river'
        ? button('Fold', 'fold', 'danger', 'F') + button('Raise 1x', 'raise', 'primary', 'R')
        : button('Check', 'check', '', 'C') + button(`Raise ${RAISE_MULT[s.street]}x`, 'raise', 'primary', 'R');
    }

    // Feedback (newest first)
    $('#playFeedback').innerHTML = s.decisions.slice().reverse().map((d, i) => decisionHTML(d, s, i === 0)).join('');
  },
};

function resultHTML(s) {
  const r = s.result;
  const net = r.net * UNIT;
  const titles = { win: 'You win', lose: 'Dealer wins', push: 'Push', fold: 'You folded' };
  let sub;
  if (r.outcome === 'fold') sub = `Dealer had ${r.dealerDesc.toLowerCase()}. You had ${r.playerDesc.toLowerCase()}.`;
  else if (r.outcome === 'push') sub = `Both play ${r.playerDesc.toLowerCase()}.`;
  else sub = `${r.outcome === 'win' ? 'Your' : 'Dealer\'s'} ${(r.outcome === 'win' ? r.playerDesc : r.dealerDesc).toLowerCase()} beats ${(r.outcome === 'win' ? r.dealerDesc : r.playerDesc).toLowerCase()}.`;
  if (r.outcome !== 'fold' && !r.qualifies) sub += ' Dealer doesn\'t qualify, so the Ante pushes.';
  const right = s.decisions.filter((d) => d.isCorrect).length;
  return `<div class="result ${r.outcome}">
    <div class="big">${titles[r.outcome]} ${r.outcome === 'push' ? '' : money(net)}</div>
    <div class="sub">${sub}</div>
    <div class="hand-score">Decisions this hand: ${right}/${s.decisions.length} correct · Bankroll ${bank(stats.data.bankroll)}</div>
  </div>`;
}

function decisionHTML(d, s, latest) {
  const labels = ACTION_LABELS[d.street];
  const street = d.street[0].toUpperCase() + d.street.slice(1);
  const board = s.board.slice(0, d.street === 'preflop' ? 0 : d.street === 'flop' ? 3 : 5);
  let extra = '';
  if (d.street === 'river' && d.info.outs) {
    const body = outsHTML(d.info.outs, s.player, board);
    extra = d.isCorrect
      ? `<details class="more"><summary>Show the ${d.info.outs.outs.length} dealer outs</summary>${body}</details>`
      : body;
  }
  return `<div class="fb ${d.isCorrect ? 'is-ok' : 'is-bad'}" data-street="${d.street}">
    <div class="fb-head"><span class="fb-badge">${d.isCorrect ? '✓' : '✕'}</span>
      <span class="fb-street">${street}</span> You: ${labels[d.chosen]}
      <span class="fb-rule">${d.info.rule}</span></div>
    ${d.isCorrect ? '' : `<p class="fb-correct">Correct play: <b>${labels[d.correct]}</b></p>`}
    ${d.isCorrect && !latest ? '' : `<p class="fb-reason">${d.info.reason}</p>`}
    ${extra}
  </div>`;
}

function mistakeFrom(hole, board, d) {
  return {
    street: d.street,
    hole: hole.map(cardId),
    board: board.map(cardId),
    chosen: d.chosen,
    correct: d.correct,
    rule: d.info.rule,
    reason: d.info.reason,
    outs: d.info.outs ? d.info.outs.outs.length : null,
  };
}

// ---------- Outs drill ----------

function randomRiver() {
  const { player, board } = dealHand();
  return { hole: player, board };
}

function isTricky(hole, board, dec) {
  const boardPaired = new Set(board.map((c) => c.r)).size < 5;
  const holeMatch = hole[0].r === hole[1].r || hole.some((c) => board.some((b) => b.r === c.r));
  const draws = dec.outs.groups.some((g) => /straight|flush/i.test(g.label));
  return boardPaired || holeMatch || draws;
}

function generateSpot(mode) {
  for (let i = 0; i < 4000; i++) {
    const spot = randomRiver();
    const dec = riverDecision(spot.hole, spot.board);
    if (mode === 'mixed') {
      if (dec.hidden && Math.random() < 0.8) continue; // mostly counting spots, some hidden pairs
      return { ...spot, dec };
    }
    if (dec.hidden) continue;
    const n = dec.outs.outs.length;
    if (mode === 'close' && n >= 16 && n <= 26) return { ...spot, dec };
    if (mode === 'tricky' && isTricky(spot.hole, spot.board, dec)) return { ...spot, dec };
  }
  const spot = randomRiver();
  return { ...spot, dec: riverDecision(spot.hole, spot.board) };
}

const drill = {
  spot: null,
  answered: false,
  mode: 'mixed',

  next() {
    this.spot = generateSpot(this.mode);
    this.answered = false;
    $('#countInput').value = '';
    this.render(true);
  },

  load(hole, board) {
    this.spot = { hole, board, dec: riverDecision(hole, board) };
    this.answered = false;
    $('#countInput').value = '';
    this.render(true);
  },

  guess() {
    const v = $('#countInput').value.trim();
    if (v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? Math.max(0, Math.min(45, Math.round(n))) : null;
  },

  answer(action) {
    if (this.answered || !this.spot) return;
    if (action !== 'raise' && action !== 'fold') return;
    const { dec, hole, board } = this.spot;
    const ok = action === dec.action;
    this.answered = true;
    this.chosen = action;
    stats.record('drill', ok, ok ? null : mistakeFrom(hole, board, {
      street: 'river', chosen: action, correct: dec.action, info: dec,
    }));
    const g = this.guess();
    if (g != null && dec.outs) stats.recordCount(g, dec.outs.outs.length);
    flash($('#drillActions'), ok);
    renderScorePill();
    this.render();
  },

  bump(delta) {
    if (this.answered) return;
    const input = $('#countInput');
    const cur = input.value === '' ? 15 - delta : Number(input.value);
    input.value = String(Math.max(0, Math.min(45, cur + delta)));
  },

  render(fresh = false) {
    const { hole, board, dec } = this.spot;
    if (fresh) {
      $('#drillBoard').innerHTML = board.map((c, i) => cardHTML(c, { anim: true, delay: i * 70 })).join('');
      $('#drillHole').innerHTML = hole.map((c, i) => cardHTML(c, { anim: true, delay: 350 + i * 70 })).join('');
    }
    $('#drillDesc').textContent = describeHand(bestHand([...hole, ...board]));
    const actions = $('#drillActions');
    const input = $('#countInput');
    input.disabled = this.answered;
    $('#countMinus').disabled = this.answered;
    $('#countPlus').disabled = this.answered;
    if (!this.answered) {
      actions.className = 'actions';
      actions.innerHTML = button('Fold', 'fold', 'danger', 'F') + button('Raise 1x', 'raise', 'primary', 'R');
      $('#drillFeedback').innerHTML = '';
      return;
    }
    actions.className = 'actions single';
    actions.innerHTML = button('Next spot', 'next', 'primary', 'Space');
    const ok = this.chosen === dec.action;
    const labels = ACTION_LABELS.river;
    const g = this.guess();
    $('#drillFeedback').innerHTML = `<div class="fb ${ok ? 'is-ok' : 'is-bad'}">
      <div class="fb-head"><span class="fb-badge">${ok ? '✓' : '✕'}</span>
        <span class="fb-street">River</span> You: ${labels[this.chosen]}
        <span class="fb-rule">${dec.rule}</span></div>
      ${ok ? '' : `<p class="fb-correct">Correct play: <b>${labels[dec.action]}</b></p>`}
      <p class="fb-reason">${dec.reason}</p>
      ${dec.outs ? outsHTML(dec.outs, hole, board, g) : ''}
    </div>`;
  },
};

// ---------- Strategy view ----------

function renderPreflopGrid() {
  const el = $('#preflopGrid');
  if (el.childElementCount) return;
  const cells = [];
  for (let i = 0; i < 13; i++) {
    for (let j = 0; j < 13; j++) {
      const a = RANKS[i];
      const b = RANKS[j];
      let hole;
      let label;
      if (i === j) { hole = [{ r: a, s: 's' }, { r: a, s: 'h' }]; label = `${rc(a)}${rc(a)}`; }
      else if (i < j) { hole = [{ r: a, s: 's' }, { r: b, s: 's' }]; label = `${rc(a)}${rc(b)}s`; }
      else { hole = [{ r: b, s: 's' }, { r: a, s: 'h' }]; label = `${rc(b)}${rc(a)}o`; }
      const raise = preflopDecision(hole).action === 'raise';
      cells.push(`<div class="${raise ? 'raise' : ''} ${i === j ? 'pair' : ''}" role="cell" title="${label}: ${raise ? 'Raise 4x' : 'Check'}">${label.replace(/[so]$/, '')}</div>`);
    }
  }
  el.innerHTML = cells.join('');
}
const rc = (r) => (r === 10 ? 'T' : rankLabel(r));

// ---------- Stats view ----------

let mistakeFilter = 'all';

function renderStats() {
  const d = stats.data;
  const t = stats.totals();
  const overall = pct(t.correct, t.total);
  const names = { preflop: 'Preflop', flop: 'Flop', river: 'River', drill: 'Outs drill' };
  const bars = CATEGORIES.map((c) => {
    const b = d.by[c];
    const p = pct(b.correct, b.total);
    const cls = p == null ? '' : p >= 90 ? '' : p >= 75 ? 'mid' : 'low';
    return `<div class="bar-row" data-cat="${c}"><span class="lbl">${names[c]}</span>
      <div class="bar"><i class="${cls}" style="width:${p ?? 0}%"></i></div>
      <span class="val"><b>${p == null ? '–' : p + '%'}</b> ${b.correct}/${b.total}</span></div>`;
  }).join('');
  const ce = pct(d.counts.exact, d.counts.total);
  const cc = pct(d.counts.close, d.counts.total);
  const list = d.mistakes.filter((m) => mistakeFilter === 'all' || m.category === mistakeFilter || (mistakeFilter === 'river' && m.street === 'river'));
  const filters = ['all', 'preflop', 'flop', 'river', 'drill'].map((f) => `<button type="button" class="filter" data-filter="${f}" aria-pressed="${f === mistakeFilter}">${f === 'all' ? 'All' : names[f]}</button>`).join('');
  const mistakes = list.length ? list.slice(0, 40).map((m, idx) => mistakeHTML(m, idx)).join('') : '<div class="empty">No mistakes here yet. Nice.</div>';

  $('#statsBody').innerHTML = `
    <div class="tiles">
      <div class="tile"><div class="tile-label">Accuracy</div><div class="tile-value">${overall == null ? '–' : overall + '%'}</div><div class="tile-sub">${t.correct}/${t.total} decisions</div></div>
      <div class="tile"><div class="tile-label">Streak</div><div class="tile-value">🔥 ${d.streak}</div><div class="tile-sub">Best ${d.bestStreak}</div></div>
      <div class="tile"><div class="tile-label">Hands</div><div class="tile-value">${d.hands}</div><div class="tile-sub">Session ${stats.session.correct}/${stats.session.total}</div></div>
      <div class="tile"><div class="tile-label">Bankroll</div><div class="tile-value">${bank(d.bankroll)}</div><div class="tile-sub">$${UNIT} ante</div></div>
    </div>
    <article class="card-panel"><h2>Accuracy by decision</h2><div class="bars">${bars}</div>
      <p class="small muted" style="margin:12px 0 0">Outs counting: ${d.counts.total ? `${ce}% exact, ${cc}% within ±2 (${d.counts.total} counted)` : 'enter a count in the Outs Drill to track this'}.</p>
    </article>
    <article class="card-panel"><h2>Mistakes to review</h2><div class="filters">${filters}</div><div class="mistakes">${mistakes}</div></article>
    <article class="card-panel"><h2>Settings</h2>
      <div class="settings">
        <label class="setting"><span>Four-color deck <span class="muted small">(blue ♦, green ♣)</span></span>
          <span class="switch"><input type="checkbox" id="fourColor" ${prefs.fourColor ? 'checked' : ''}><span></span></span></label>
        <div class="btn-row">
          <button type="button" class="btn small" id="resetBankroll">Reset bankroll</button>
          <button type="button" class="btn small danger" id="resetStats">Reset all stats</button>
        </div>
      </div>
    </article>`;
}

function mistakeHTML(m, idx) {
  const hole = m.hole.map(parseCard);
  const board = m.board.map(parseCard);
  const labels = ACTION_LABELS[m.street];
  const where = m.category === 'drill' ? 'Outs drill' : m.street;
  const replay = m.street === 'river' ? `<button type="button" class="btn small" data-replay="${idx}">Practice this spot</button>` : '';
  return `<div class="mistake">
    <div class="mistake-top"><span class="tag">${where}</span>
      <span>You: <b class="bad">${labels[m.chosen]}</b> · Correct: <b class="good">${labels[m.correct]}</b></span>
      ${m.outs != null ? `<span class="muted">${m.outs} outs</span>` : ''}</div>
    <div class="mini-cards">${hole.map(miniHTML).join('')}${board.length ? '<span class="mini-sep"></span>' + board.map(miniHTML).join('') : ''}</div>
    <div class="small">${m.reason}</div>
    ${replay ? `<div style="margin-top:8px">${replay}</div>` : ''}
  </div>`;
}

// ---------- Prefs ----------

function loadPrefs() {
  try { return JSON.parse(localStorage.getItem('uth-trainer-prefs') ?? '{}'); } catch { return {}; }
}
function savePrefs() {
  try { localStorage.setItem('uth-trainer-prefs', JSON.stringify(prefs)); } catch { /* ignore */ }
}
function applyPrefs() {
  document.body.classList.toggle('four-color', !!prefs.fourColor);
}

// ---------- Routing ----------

const VIEWS = ['play', 'drill', 'strategy', 'stats'];
let current = null;

function route() {
  const view = VIEWS.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'play';
  current = view;
  for (const v of VIEWS) $(`#view-${v}`).hidden = v !== view;
  document.querySelectorAll('.tab').forEach((t) => {
    if (t.dataset.view === view) t.setAttribute('aria-current', 'page');
    else t.removeAttribute('aria-current');
  });
  if (view === 'play' && !play.state) play.deal();
  if (view === 'drill' && !drill.spot) drill.next();
  if (view === 'strategy') renderPreflopGrid();
  if (view === 'stats') renderStats();
  window.scrollTo(0, 0);
}

// ---------- Events ----------

function bind() {
  $('#playActions').addEventListener('click', (e) => {
    const a = e.target.closest('[data-action]')?.dataset.action;
    if (!a) return;
    if (a === 'deal') play.deal();
    else play.choose(a);
  });
  $('#drillActions').addEventListener('click', (e) => {
    const a = e.target.closest('[data-action]')?.dataset.action;
    if (!a) return;
    if (a === 'next') drill.next();
    else drill.answer(a);
  });
  $('#countMinus').addEventListener('click', () => drill.bump(-1));
  $('#countPlus').addEventListener('click', () => drill.bump(1));
  $('#drillMode').addEventListener('change', (e) => { drill.mode = e.target.value; drill.next(); });

  document.addEventListener('click', (e) => {
    const g = e.target.closest('[data-goto]');
    if (g) location.hash = g.dataset.goto;
  });

  $('#statsBody').addEventListener('click', (e) => {
    const f = e.target.closest('[data-filter]');
    if (f) { mistakeFilter = f.dataset.filter; renderStats(); return; }
    const r = e.target.closest('[data-replay]');
    if (r) {
      const list = stats.data.mistakes.filter((m) => mistakeFilter === 'all' || m.category === mistakeFilter || (mistakeFilter === 'river' && m.street === 'river'));
      const m = list[Number(r.dataset.replay)];
      if (m) {
        drill.load(m.hole.map(parseCard), m.board.map(parseCard));
        location.hash = 'drill';
      }
      return;
    }
    if (e.target.id === 'resetBankroll') { stats.resetBankroll(); renderStats(); toast('Bankroll reset to $1,000'); }
    if (e.target.id === 'resetStats' && confirm('Reset all stats and mistakes? This cannot be undone.')) {
      stats.reset(); renderStats(); renderScorePill(); toast('Stats reset');
    }
  });
  $('#statsBody').addEventListener('change', (e) => {
    if (e.target.id === 'fourColor') { prefs.fourColor = e.target.checked; savePrefs(); applyPrefs(); }
  });

  document.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const typing = e.target.matches('input, select, textarea');
    const k = e.key.toLowerCase();
    if (current === 'play' && play.state && !typing) {
      if (play.state.street === 'showdown') {
        if (k === ' ' || k === 'enter' || k === 'n') { e.preventDefault(); play.deal(); }
      } else if (k === 'r') play.choose('raise');
      else if (k === 'c' && play.state.street !== 'river') play.choose('check');
      else if (k === 'f' && play.state.street === 'river') play.choose('fold');
    } else if (current === 'drill' && drill.spot) {
      if (drill.answered) {
        if (k === ' ' || k === 'enter' || k === 'n') { e.preventDefault(); drill.next(); }
      } else if (k === 'r' || k === 'f') {
        e.preventDefault(); drill.answer(k === 'r' ? 'raise' : 'fold');
      } else if (!typing && (k === 'arrowup' || k === '+' || k === '=')) { e.preventDefault(); drill.bump(1); }
      else if (!typing && (k === 'arrowdown' || k === '-')) { e.preventDefault(); drill.bump(-1); }
      else if (typing && k === 'enter') e.preventDefault();
    }
  });

  window.addEventListener('hashchange', route);
}

applyPrefs();
bind();
renderScorePill();
route();

// Debug/test hook: load a specific play layout, e.g. window.__uth.loadPlay('As Kd', 'Qc 3d', '2h 7s 9c Jd 4h')
window.__uth = {
  loadPlay(player, dealer, board) {
    const p = (s) => s.split(' ').map(parseCard);
    play.state = newHand(undefined, { player: p(player), dealer: p(dealer), board: p(board) });
    play.shownBoard = 0;
    play.dealerShown = false;
    play.render(true);
  },
  loadDrill(hole, board) {
    const p = (s) => s.split(' ').map(parseCard);
    drill.load(p(hole), p(board));
  },
  stats,
  countOuts,
};

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
