# Independent game engines

- **Double Kout / Standard Hokm (4 players):** `double-kout-game.js` provides a reusable four-seat deal, legal-card, turn, trick-resolution, AI-card and scoring/challenge core for local and future online orchestration. `double-kout-sequence.js` contains the sequence/challenge rules.
- **Standard Hokm (4 players):** `standard-hokm/engine.js` provides a 52-card, 13-card-per-player deal and trick comparison. First match trump is spades.
- **Kuwaiti Kout (6 players):** `kuwaiti-six-player/engine.js` provides a 54-card deck, nine cards per player, opening lead by the unique holder of 2 clubs, and contract/joker foundations.

## Explicit Kuwaiti rules currently encoded
- Contracts: `naras`, `tak_naras`, and `saras`.
- Naras ranking: red joker > all four 2s > black joker > ordinary cards.
- Tak-naras and saras ranking: red joker > all four aces > black joker > ordinary cards.
- Ninth trick exception: if either joker is played as the first card, it has zero power and does not establish the background suit; the second player's card establishes the suit.
- The six-player deal is 54 cards (52 normal + two jokers), nine cards per player.

## Still incomplete
The full auction/baon rules, all contract-specific restrictions beyond the recorded card hierarchy, full trick winner resolution, team scoring, end-of-round conditions, AI strategy and six-seat table UI are not complete. In particular, do not infer the missing rules from standard Hokm.

## Tests
Run:
```bash
node engine/test-kuwaiti-card-power.cjs
node engines/test-engine-foundations.cjs
node engines/test-double-kout-game.cjs
```
