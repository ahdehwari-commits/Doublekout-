# Independent game engines

- **Double Kout sequence (4 players):** the current playable prototype still lives in `web-prototype.html`. Its trick sequence/challenge logic has not yet been extracted into a standalone module.
- **Standard Hokm (4 players):** `standard-hokm/engine.js` provides a 52-card, 13-card-per-player dealing and trick-comparison foundation. First match trump is spades.
- **Kuwaiti Kout (6 players):** `kuwaiti-six-player/engine.js` provides a 54-card, nine-card-per-player foundation plus the recorded joker/contract exceptions.

The Kuwaiti engine currently supplies dealing, legal-card filtering and card-power handling only. Auction/contract scoring, exact ninth/final-trick resolution, complete team scoring, AI strategy and UI integration remain unfinished. The two foundational engines are not yet wired into the game screen.

Run regression checks with:
```bash
node engine/test-kuwaiti-card-power.cjs
node engines/test-engine-foundations.cjs
```
