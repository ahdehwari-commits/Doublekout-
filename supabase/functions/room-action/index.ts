import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return Response.json({ error: "method_not_allowed" }, { status: 405, headers: corsHeaders });
  }

  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return Response.json({ error: "authentication_required" }, { status: 401, headers: corsHeaders });
  }

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !anonKey) {
    return Response.json({ error: "server_not_configured" }, { status: 500, headers: corsHeaders });
  }

  const supabase = createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const body = await req.json();
    const roomId = typeof body.room_id === "string" ? body.room_id : "";
    if (!/^[0-9a-f-]{36}$/i.test(roomId)) {
      return Response.json({ error: "invalid_room_id" }, { status: 400, headers: corsHeaders });
    }

    let result;
    if (body.action === "ready" && typeof body.ready === "boolean") {
      result = await supabase.rpc("set_room_ready", {
        p_room_id: roomId,
        p_ready: body.ready,
      });
    } else if (body.action === "start") {
      result = await supabase.rpc("start_game_room", { p_room_id: roomId });
    } else {
      return Response.json({ error: "unsupported_action" }, { status: 400, headers: corsHeaders });
    }

    if (result.error) {
      return Response.json(
        { error: result.error.message, code: result.error.code ?? null },
        { status: 400, headers: corsHeaders },
      );
    }

    return Response.json({ ok: true, data: result.data }, { headers: corsHeaders });
  } catch (_error) {
    return Response.json({ error: "invalid_request" }, { status: 400, headers: corsHeaders });
  }
});
