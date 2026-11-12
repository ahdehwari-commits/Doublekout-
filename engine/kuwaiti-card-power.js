/**
 * Kuwaiti six-player card power rules.
 * This module compares only plays already deemed eligible by the full rules engine.
 * Suit-following, trump eligibility and scoring remain separate concerns.
 */
const NORMAL_RANKS = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
const NORMAL_POWER = Object.fromEntries(NORMAL_RANKS.map((r, i) => [r, i + 1]));
const CONTRACTS = new Set(['naras', 'tak_naras', 'saras']);

function validateContract(contract) {
  if (!CONTRACTS.has(contract)) {
    throw new Error('قرارداد کوت کویتی نامعتبر است: ' + contract);
  }
}

function cardTier(card, contract) {
  validateContract(contract);
  if (!card || typeof card !== 'object') throw new TypeError('کارت نامعتبر است');

  const red = card.kind === 'joker' && card.color === 'red';
  const black = card.kind === 'joker' && card.color === 'black';
  if (red) return 4;

  if (contract === 'naras') {
    if (card.kind === 'normal' && card.rank === '2') return 3;
  } else {
    if (card.kind === 'normal' && card.rank === 'A') return 3;
  }

  if (black) return 2;
  if (card.kind === 'normal' && NORMAL_POWER[card.rank]) return 1;
  throw new Error('نوع یا رتبه کارت ناشناخته است');
}

function cardPower(card, contract) {
  const tier = cardTier(card, contract);
  if (tier === 4) return 10000;
  if (tier === 3) return 9000;
  if (tier === 2) return 8000;
  return NORMAL_POWER[card.rank];
}

function findHighestEligiblePlay(plays, contract) {
  validateContract(contract);
  if (!Array.isArray(plays) || plays.length === 0) {
    throw new Error('هیچ کارتی برای ارزیابی وجود ندارد');
  }
  return plays.reduce((best, current) =>
    cardPower(current.card, contract) > cardPower(best.card, contract) ? current : best
  );
}

if (typeof module !== 'undefined') {
  module.exports = { cardPower, cardTier, findHighestEligiblePlay, validateContract };
}
