# Supabase deployment

This directory contains the database schema and migrations for the Double Kout online lobby and four-player game.

## Current implementation

- Migrations 001 and 002 create rooms, member seats, anonymous sign-in support, ready state, row-level security and lobby RPCs.
- Migration 003 adds the authoritative four-seat game state, private per-seat hands, server-side legal-card validation, turn/trick resolution, AI-seat moves, Double Kout challenge resolution and scoring.
- The browser UI can start a four-player room with at least two ready humans; unoccupied seats are filled by server-held AI hands. The host client advances AI turns through a host-only RPC.
- Human clients can read only their own cards. Public room state contains played cards, turn, trick history and result, never opponents' hands.
- The six-player Kuwaiti mode is not included in this online game engine yet. Local six-player play remains separate.

## Required Supabase setup

1. Keep **Anonymous Sign-Ins** enabled under Authentication > Providers.
2. Apply all migrations in `supabase/migrations/` in ascending filename order. If migrations through `20261115002000` are already applied, apply `20261116002100_anonymous_strategy_learning.sql` next.
3. The web app uses only the project URL and public publishable key. Never put the `service_role` key in the app, website, GitHub source, or chat.
4. Realtime is used for lobby changes; game state also has client polling as a reconnect fallback.

## Game RPCs

- `create_game_room(p_game_mode, p_player_count, p_display_name)`
- `join_game_room(p_code, p_display_name)`
- `set_room_ready(p_room_id, p_ready)`
- `start_room_game(p_room_id, p_start_with_present, p_trump, p_challenge_team)`
- `play_room_card(p_room_id, p_card_id)`
- `play_room_ai_turn(p_room_id)` — host only, and only when an AI seat owns the current turn.

The SQL migration must be applied to the connected Supabase project before the new online game controls can work. The GitHub deployment alone does not apply SQL migrations to an already-created Supabase project.


## Anonymous strategy learning

- Human card decisions are collected only after local players consent; the first human move asks whether all players on that device agree.
- The learning client stores no player name, auth user ID, device ID, email, phone, room ID, or stable player/session identifier.
- It records compact game context, the legal cards and chosen card, then uploads the record after the trick winner is known.
- Raw decision rows are not readable by browser clients. The summary RPC returns only action aggregates with at least five samples.
- The first release builds an anonymized evidence dataset and aggregated action win rates. It does not yet change AI choices automatically; strategy updates require enough representative data and validation against the game's rules before enabling adaptive play.
- The new migration must be applied to the production Supabase project before uploads can succeed. GitHub Pages / APK deployment does not apply database migrations.
