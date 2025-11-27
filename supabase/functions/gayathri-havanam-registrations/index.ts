import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ORIGINS = ["https://kcdastrust.org"];

// Rate limiting
const RATE_LIMIT_WINDOW = 60 * 1000; // 60 seconds
const MAX_REQUESTS_PER_WINDOW = 5;

serve(async (req) => {
  try {
    const origin = req.headers.get("Origin") || "";

    if (!ORIGINS.includes(origin)) {
      return new Response("Forbidden", { status: 403 });
    }

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
            {
              status: 429,
              headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": origin },
            }
          );
        }

        await supabase
          .from("request_rate_limit")
          .update({ count: rateData.count + 1 })
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
        .insert({ ip, last_request: now, count: 1 });
    }
    // ===== END RATE LIMITING =====

    // Parse request
    const body = await req.json().catch(() => null);
    if (!body || !body.mainData) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing mainData in request" }),
        { status: 400, headers: { "Access-Control-Allow-Origin": origin } }
      );
    }

    const { mainData } = body;

    // Combine all slot IDs into one array
    const allSlotIds: number[] = [
      ...(mainData.day1 || []),
      ...(mainData.day2 || []),
      ...(mainData.day3 || []),
    ];

    // 1️⃣ Check capacity for each selected slot
    for (const slotId of allSlotIds) {
      const { data: slot, error: slotErr } = await supabase
        .from("slots")
        .select("registration_count, max_capacity")
        .eq("id", slotId)
        .single();

      if (slotErr) throw slotErr;

      if (slot.registration_count >= slot.max_capacity) {
        return new Response(
          JSON.stringify({
            success: false,
            message: `Slot ID ${slotId} is full`,
            full: true,
          }),
          { status: 400, headers: { "Access-Control-Allow-Origin": origin } }
        );
      }
    }

    // 2️⃣ Check if user exists
    const { data: existing } = await supabase
      .from("registrations")
      .select("id")
      .eq("mobile_number", mainData.mobile_number)
      .limit(1);

    let mainId;

    if (existing && existing.length > 0) {
      // Update existing registration
      const { mobile_number, ...updateData } = mainData;

      const { error: updErr } = await supabase
        .from("registrations")
        .update(updateData)
        .eq("id", existing[0].id);

      if (updErr) throw updErr;

      mainId = existing[0].id;
    } else {
      // 3️⃣ Insert new registration
      const { data: inserted, error: insertErr } = await supabase
        .from("registrations")
        .insert([mainData])
        .select()
        .single();

      if (insertErr) throw insertErr;

      mainId = inserted.id;
    }

    // 4️⃣ Increment registration_count for each slot
    for (const slotId of allSlotIds) {
      const { data: slot, error: slotErr } = await supabase
        .from("slots")
        .select("registration_count")
        .eq("id", slotId)
        .single();

      if (slotErr) throw slotErr;

      await supabase
        .from("slots")
        .update({ registration_count: slot.registration_count + 1 })
        .eq("id", slotId);
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
        status: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": ORIGINS[0],
        },
      }
    );
  }
});
