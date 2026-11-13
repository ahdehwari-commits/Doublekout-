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
- Online play for four or six separate phones is a planned mode, not yet connected to a live room server. The UI explicitly blocks starting online play until a backend is configured; no fake room or simulated network play is presented as working.
- The six-player Kuwaiti UI/engine remains incomplete; local hotseat and real multi-device support for six players need to be integrated after the table flow is completed.

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
