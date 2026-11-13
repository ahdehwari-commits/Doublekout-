# Supabase deployment

This directory is connected to the Supabase project through the Supabase GitHub integration.

## Current stage

- Database migration creates rooms, member seats, private-hand storage, RLS, room creation/join RPCs, ready state, and host-only lobby start.
- Edge Function `room-action` authenticates the caller and invokes the RLS-safe ready/start RPCs.
- Starting a room currently moves it to `playing` with phase `engine_pending`. This is intentionally not represented as a playable card game yet: authoritative dealing, legal-move validation, private hand delivery, turn resolution, reconnect and scoring must be integrated with the existing game engines before release.

## Supabase Dashboard steps

1. Enable **Anonymous Sign-Ins** in Authentication > Providers.
2. Ensure the GitHub integration deploys migrations from the repository root (`.`).
3. Deploy the `room-action` Edge Function from this directory. If the integration does not deploy functions automatically, deploy with the Supabase CLI after linking the project.
4. Configure the client with the Project URL and the public publishable/anon key only.
5. Never place the `service_role` key in the app, website, GitHub source, or chat.

## RPCs

- `create_game_room(p_game_mode, p_player_count, p_display_name)`
- `join_game_room(p_code, p_display_name)`
- `set_room_ready(p_room_id, p_ready)`
- `start_game_room(p_room_id)`

All RPCs require an authenticated user. Room creation/joining use database transactions; starting is restricted to the host and requires every seat to be occupied and ready.
