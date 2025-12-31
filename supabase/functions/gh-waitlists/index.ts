import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// const ORIGINS = ["https://kcdastrust.org"];
const ORIGINS = ["http://localhost:4200"];

// Rate limiting
const RATE_LIMIT_WINDOW = 60 * 1000; // 60 seconds
const MAX_REQUESTS_PER_WINDOW = 5;

serve(async (req) => {
  try {
    const origin = req.headers.get("Origin") || "";
    if (!ORIGINS.includes(origin)) return new Response("Forbidden", { status: 403 });

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
      return new Response(JSON.stringify({ success: false, error: "POST required" }), {
        status: 400,
        headers: { "Access-Control-Allow-Origin": origin },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // ===== RATE LIMITING =====
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
      (req.conn as any).remoteAddr?.hostname ||
      "unknown";
    const now = Date.now();

    const { data: rateData, error: rateErr } = await supabase
      .from("request_rate_limit")
      .select("*")
      .eq("ip", ip)
      .single();

    if (rateErr && rateErr.code !== "PGRST116") throw rateErr;

    if (rateData) {
      if (now - rateData.last_request < RATE_LIMIT_WINDOW) {
        if (rateData.count >= MAX_REQUESTS_PER_WINDOW) {
          return new Response(
            JSON.stringify({ success: false, message: "Rate limit exceeded" }),
            { status: 429, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": origin } }
          );
        }
        await supabase.from("request_rate_limit").update({ count: rateData.count + 1 }).eq("ip", ip);
      } else {
        await supabase.from("request_rate_limit").update({ count: 1, last_request: now }).eq("ip", ip);
      }
    } else {
      await supabase.from("request_rate_limit").insert({ ip, last_request: now, count: 1 });
    }
    // ===== END RATE LIMITING =====

    // Parse request body
    const body = await req.json().catch(() => null);
    if (!body) {
      return new Response(JSON.stringify({ success: false, error: "Missing request body" }), {
        status: 400,
        headers: { "Access-Control-Allow-Origin": origin },
      });
    }

    const { kcdt_member_id, full_name, country_code, mobile_number } = body.mainData;

    if (!kcdt_member_id || !full_name || !country_code || !mobile_number) {
      return new Response(JSON.stringify({ success: false, error: "Missing required fields" }), {
        status: 400,
        headers: { "Access-Control-Allow-Origin": origin },
      });
    }

    // Check if mobile number already exists
    const { data: existing } = await supabase
      .from("waitlist")
      .select("mobile_number")
      .eq("mobile_number", mobile_number)
      .single();

    if (existing) {
      return new Response(
        JSON.stringify({ success: false, message: "Mobile number already exists" }),
        { status: 409, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": origin } }
      );
    }

    // Insert new waitlist entry
    const { data, error: insertError } = await supabase.from("waitlist").insert([
      { kcdt_member_id, full_name, country_code, mobile_number },
    ]);

    if (insertError) throw insertError;

    return new Response(JSON.stringify({ success: true, data }), {
      status: 201,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": origin },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err.message || "Unknown error" }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": ORIGINS[0] },
    });
  }
});
