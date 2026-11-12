# Independent game engines

- `double-kout-sequence/`: existing four-player sequence prototype. Its scoring and challenge rules must remain isolated.
- `standard-hokm/`: four-player, 52-card, 13-card-per-player core; first match trump is spades.
- `kuwaiti-six-player/`: six-player, 54-card, nine-card-per-player core, with the documented joker and contract power exceptions.

The Kuwaiti engine currently supplies dealing, legal-card filtering and card power only. Auction/contract validation, exact contract scoring, the ninth/final trick resolution and full AI strategy still require integration and regression tests. No unfinished rule is represented as final.
