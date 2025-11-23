// File: functions/register-participant/index.ts
import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

// Environment variables
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ORIGINS = ["https://kcdastrust.org"];
const RATE_LIMIT_WINDOW = 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 2;

// Simple in-memory store for rate-limiting
const ipRateLimitMap = new Map<string, { count: number; firstRequest: number }>();

serve(async (req) => {
  try {
    const origin = req.headers.get("Origin") || "";
    if (!ORIGINS.includes(origin)) {
      return new Response("Forbidden", { status: 403 });
    }

    // CORS preflight
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

    // Rate-limiting per IP
    const ip = req.headers.get("x-forwarded-for") || req.conn.remoteAddr.hostname;
    const now = Date.now();
    const ipData = ipRateLimitMap.get(ip);

    if (ipData) {
      if (now - ipData.firstRequest < RATE_LIMIT_WINDOW) {
        if (ipData.count >= MAX_REQUESTS_PER_WINDOW) {
          return new Response(
            JSON.stringify({ success: false, message: "Rate limit exceeded" }),
            { status: 429, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": origin } }
          );
        } else {
          ipData.count++;
          ipRateLimitMap.set(ip, ipData);
        }
      } else {
        // Reset window
        ipRateLimitMap.set(ip, { count: 1, firstRequest: now });
      }
    } else {
      ipRateLimitMap.set(ip, { count: 1, firstRequest: now });
    }

    // Parse body
    const { mainData, accompData } = await req.json();

    // Basic validation
    if (!mainData || !mainData.mobile_number || !mainData.full_name) {
      return new Response(
        JSON.stringify({ success: false, message: "Missing required main participant data" }),
        { status: 400, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": origin } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Check if main participant exists
    const { data: existing, error: fetchError } = await supabase
      .from("varanasi_events_primary_participants")
      .select("*")
      .eq("mobile_number", mainData.mobile_number)
      .limit(1);
    if (fetchError) throw fetchError;

    let mainId: number;

    if (existing && existing.length > 0) {
      mainId = existing[0].id;

      // Update main participant (except phone number)
      const { mobile_number, ...updateData } = mainData;
      const { error: updateError } = await supabase
        .from("varanasi_events_primary_participants")
        .update(updateData)
        .eq("id", mainId);
      if (updateError) throw updateError;

      // Delete old varanasi_event_accompanying_participants participants
      const { error: deleteError } = await supabase
        .from("varanasi_event_accompanying_participants")
        .delete()
        .eq("main_participant_id", mainId);
      if (deleteError) throw deleteError;
    } else {
      // Insert new main participant
      const { data: inserted, error: insertError } = await supabase
        .from("varanasi_events_primary_participants")
        .insert([mainData])
        .select()
        .single();
      if (insertError) throw insertError;
      mainId = inserted.id;
    }

    // Insert varanasi_event_accompanying_participants participants
    if (accompData && accompData.length > 0) {
      const accompToInsert = accompData.map((p: any) => ({ ...p, main_participant_id: mainId }));
      const { error: accompError } = await supabase
        .from("varanasi_event_accompanying_participants")
        .insert(accompToInsert);
      if (accompError) throw accompError;
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

  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": ORIGINS[0],
        },
      }
    );
  }
});
