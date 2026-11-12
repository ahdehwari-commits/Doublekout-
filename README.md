# Double Kout

Android-first card game project for phones such as Samsung A55.

## Source package
The current starter includes a playable four-player Double Kout sequence prototype, an Android WebView shell, an iOS WKWebView example, and an isolated Kuwaiti card-power helper.

## Three separate game modes
1. دابل کوت توالی — four players.
2. حکم معمولی — four players.
3. کوت کویتی — six players.

The six-player menu label must be «کوت کویتی» only. «دابل کوت» is reserved for the four-player sequence game. Card backs must show `Abdolhamid Dehvari`.

## Confirmed rule notes
- In Double Kout sequence, tricks 1–4 are not claimable separately. No scoring claim is recorded until trick 4 is complete. From trick 5 onward, consecutive tricks are evaluated as pairs.
- Kuwaiti power helper: naras = red joker > all four 2s > black joker > ordinary cards; tak-naras and saras = red joker > all four aces > black joker > ordinary cards.
- The Kuwaiti helper compares only eligible plays. Full suit-following, trump, contracts, scoring and round completion remain to be implemented.

## Test
Run `node engine/test-kuwaiti-card-power.cjs`.

## Android build
Open `android/` in Android Studio with JDK 17 and Android SDK 35, sync Gradle, then build a debug APK. This repository currently contains source, not a signed or verified APK.
