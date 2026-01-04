import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ORIGINS = ["http://localhost:4200"];

const RATE_LIMIT_WINDOW = 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 5;

serve(async (req) => {
  try {
    const origin = req.headers.get("Origin") || "";
    if (!ORIGINS.includes(origin)) {
      return new Response("Forbidden", { status: 403 });
    }

    // ---- CORS ----
    if (req.method === "OPTIONS") {
      return new Response("ok", {
        headers: {
          "Access-Control-Allow-Origin": origin,
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
      });
    }

    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ success: false, error: "POST required" }),
        { status: 400, headers: { "Access-Control-Allow-Origin": origin } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // ---- Rate limit ----
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";

    const now = Date.now();

    const { data: rate } = await supabase
      .from("request_rate_limit")
      .select("*")
      .eq("ip", ip)
      .single();

    if (rate) {
      if (now - rate.last_request < RATE_LIMIT_WINDOW) {
        if (rate.count >= MAX_REQUESTS_PER_WINDOW) {
          return new Response(
            JSON.stringify({ success: false, error: "Rate limit exceeded" }),
            { status: 429, headers: { "Access-Control-Allow-Origin": origin } }
          );
        }

        await supabase
          .from("request_rate_limit")
          .update({ count: rate.count + 1 })
          .eq("ip", ip);
      } else {
        await supabase
          .from("request_rate_limit")
          .update({ count: 1, last_request: now })
          .eq("ip", ip);
      }
    } else {
      await supabase
        .from("request_rate_limit")
        .insert({ ip, count: 1, last_request: now });
    }

    // ---- Payload ----
    const body = await req.json();

    if (!body?.action) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing action" }),
        { status: 400, headers: { "Access-Control-Allow-Origin": origin } }
      );
    }

    let rpcName: string;
    let rpcParams: Record<string, any>;

    switch (body.action) {
      case "DELETE_VSNP":
        rpcName = "vsnp_delete_by_source_refs";
        rpcParams = { p_source_reference: body.source_reference };
        break;

      case "DELETE_GH":
        rpcName = "gh_delete_by_source_refs";
        rpcParams = { p_source_reference: body.source_reference };
        break;

      case "REGISTER_GH":
        rpcName = "gh_register";
        rpcParams = { payload: body.mainData };
        break;

      default:
        return new Response(
          JSON.stringify({ success: false, error: "Invalid action" }),
          { status: 400, headers: { "Access-Control-Allow-Origin": origin } }
        );
    }

    // ---- RPC Call ----
    const { data, error } = await supabase.rpc(rpcName, rpcParams);
    if (error) throw error;

    return new Response(
      JSON.stringify({ success: true, data }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": origin,
        },
      }
    );

  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      {
        status: 400,
        headers: { "Access-Control-Allow-Origin": ORIGINS[0] },
      }
    );
  }
});
