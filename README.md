# Double Kout

Android-first card game project for phones such as Samsung A55.

## Source package
The current starter includes a playable four-player Double Kout sequence prototype, a four-player standard Hokm mode wired to its own rules engine, an Android WebView shell, an iOS WKWebView example, and a separate six-player Kuwaiti rules foundation.

## Three separate game modes
1. دابل کوت توالی — four players.
2. حکم معمولی — four players.
3. کوت کویتی — six players.

The six-player menu label must be «کوت کویتی» only. «دابل کوت» is reserved for the four-player sequence game. Card backs must show `Abdolhamid Dehvari`.

## Multiplayer modes and current status
- Four-player AI mode remains available.
- Four-player local hotseat is now selectable: after each card, a full-screen privacy cover hides the table until the next seat holder taps to reveal only their own hand. Pass the phone face-down or away from the previous player before revealing.
- Four-player online rooms are connected to the Supabase room backend, with server-authoritative hands, turn deadlines, and host-driven AI fallback. The GitHub Actions PostgreSQL smoke test exercises a complete four-seat game with two human seats and two AI seats; production behavior still depends on the deployed Supabase migrations and client configuration.
- Six-player Kuwaiti online play is not yet complete; its UI/engine and multi-device room integration remain separate follow-up work.

## Confirmed rule notes
- In Double Kout sequence, the first group begins at trick 1. The first exact-player consecutive win from tricks 3–4 onward closes that group and awards every trick from trick 1 through the closing trick to that player's team. If the first valid sequence is tricks 4–5, all five tricks are in the group; if tricks 5–6, all six are. Each later group begins on the trick after the previous group closes. If no valid sequence occurs by trick 13, the winner of trick 13 receives all remaining tricks.
- The 13-trick challenge can only be declared by the human user's team against the opposing team. The challenger's own sequences are ignored. An opposing individual sequence at tricks 3–4 or any later adjacent pair causes immediate challenge failure. If no opposing sequence occurs through trick 12, the challenger must win trick 13. Challenge success is tracked separately from ordinary trick scoring.
- Standard four-player Hokm is wired to its independent engine for dealing, legal follow-suit moves, trick winner evaluation, and 13-trick scoring. The Kuwaiti six-player engine is exposed to the browser and Android builds and initializes a six-player deal; its full table UI, bidding/contract flow, scoring, and AI are still unfinished.
- Kuwaiti power helper: naras = red joker > all four 2s > black joker > ordinary cards; tak-naras and saras = red joker > all four aces > black joker > ordinary cards.
- The Kuwaiti helper compares only eligible plays. Full suit-following, trump, contracts, scoring and round completion remain to be implemented.

## Test
Run `node engine/test-kuwaiti-card-power.cjs`.

## Android build
Open `android/` in Android Studio with JDK 17 and Android SDK 35, sync Gradle, then build a debug APK. This repository currently contains source, not a signed or verified APK.


## Central player accounts and cosmetic store
- Central player profiles, win points and leaderboard use Supabase migrations. The latest admin/payment migration is `supabase/migrations/20261116002400_admin_payments.sql`.
- The cosmetic store adds five card-back designs, server-side point deduction, unique ownership, and account-persistent equipped design. Buying and equipping are authenticated RPC operations; duplicate purchases cannot double-charge.
- The web/PWA and Android asset builds load the same central store module. The service worker cache was versioned for the new module.
- Point-based cosmetic purchases, Iran-oriented top-up packages (50/110/240/650 points at 50k/100k/200k/500k toman), a role-based admin console, auditable point ledger, manual payment review, and a server-side ZarinPal v4 Edge Function are implemented in source. Online payment remains inactive until the Supabase migrations, Edge Function and private ZarinPal secrets are deployed. Rewarded-video rewards remain inactive until an ad provider and server-side reward verification are configured.
- Admin roles: one initial super-admin, with finance and support roles available for later delegation. Follow `supabase/ADMIN_BOOTSTRAP.md` to safely bootstrap the first admin. Admin users can search player accounts, adjust balances with a reason, review manual transfers, and inspect pending orders. Manual credits are idempotently tied to payment orders.
- Apply production migrations in this order: `20261116002100_anonymous_strategy_learning.sql`, `20261116002200_central_player_progress.sql`, `20261116002300_central_cosmetic_store.sql`, and `20261116002400_admin_payments.sql`. Then set private Edge Function secrets and deploy `zarinpal` as documented in `supabase/ADMIN_BOOTSTRAP.md`.
- Production Supabase still requires applying the pending migrations in order: anonymous learning (`20261116002100`), central player progress (`20261116002200`), and cosmetic store (`20261116002300`). GitHub Actions PostgreSQL smoke tests do not apply migrations to production.
