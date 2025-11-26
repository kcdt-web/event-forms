import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

// Env variables
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// CORS
const ORIGINS = ["http://127.0.0.1:4200"];

// Rate limit window (60s)
const RATE_LIMIT_WINDOW = 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 5;

serve(async (req) => {
  try {
    const origin = req.headers.get("Origin") || "";

    // Block unknown origins
    if (!ORIGINS.includes(origin)) {
      return new Response("Forbidden", { status: 403 });
    }

    // Preflight CORS
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
      return new Response("Method Not Allowed", {
        status: 405,
        headers: { "Access-Control-Allow-Origin": origin },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get IP
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
      (req.conn as any).remoteAddr?.hostname ||
      "unknown";

    // ====== RATE LIMITING ======
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
            {
              status: 429,
              headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": origin,
              },
            }
          );
        }

        // Increase count
        await supabase
          .from("request_rate_limit")
          .update({ count: rateData.count + 1 })
          .eq("ip", ip);
      } else {
        // Reset sliding window
        await supabase
          .from("request_rate_limit")
          .update({ count: 1, last_request: now })
          .eq("ip", ip);
      }
    } else {
      // Add new
      await supabase
        .from("request_rate_limit")
        .insert({ ip, last_request: now, count: 1 });
    }
    // ===== END RATE LIMITING ======

    // Parse body
    const { mainData } = await req.json();



    // ===== VALIDATE REQUIRED FIELDS =====
    // Basic validation
    if (!mainData || !mainData.mobile_number || !mainData.full_name) {
      return new Response(
        JSON.stringify({ success: false, message: "Missing required main participant data" }),
        { status: 400, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": origin } }
      );
    }

    // Check if mobile number exists
    const { data: existing, error: fetchErrorParticipants } = await supabase
      .from("registrations")
      .select("*")
      .eq("mobile_number", mainData.mobile_number)
      .limit(1);
    if (fetchErrorParticipants) throw fetchErrorParticipants;

    let mainId: number;

    if (existing && existing.length > 0) {
      mainId = existing[0].id;

      const { mobile_number, ...updateData } = mainData;
      const { error: updateError } = await supabase
        .from("registrations")
        .update(updateData)
        .eq("id", mainId);
      if (updateError) throw updateError;
    } else {
      // Insert new record
      const { data: inserted, error: insertError } = await supabase
        .from("registrations")
        .insert([mainData])
        .select()
        .single();
      if (insertError) throw insertError;

      mainId = inserted.id;
    }

    return new Response(
      JSON.stringify({ success: true, mainId }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": origin,
        },
      }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      {
        status: err.status,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": ORIGINS[0],
        },
      }
    );
  }
});
