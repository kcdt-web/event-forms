import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ORIGINS = ["http://127.0.0.1:4200"];

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
    if (!body || !body.mainData) {
      return new Response(JSON.stringify({ success: false, error: "Missing mainData" }), { status: 400, headers: { "Access-Control-Allow-Origin": origin } });
    }

    const { mainData } = body;
    const newSlots: number[] = [
      ...(mainData.day1 || []),
      ...(mainData.day2 || []),
      ...(mainData.day3 || []),
    ];

    // 1️⃣ Check if user exists
    const { data: existing } = await supabase
      .from("registrations")
      .select("id, day1, day2, day3")
      .eq("mobile_number", mainData.mobile_number)
      .limit(1);

    let mainId: number;
    let oldSlots: number[] = [];

    if (existing && existing.length > 0) {
      const old = existing[0];
      oldSlots = [...(old.day1 || []), ...(old.day2 || []), ...(old.day3 || [])];

      // Determine slots to add/remove
      const slotsToAdd = newSlots.filter(id => !oldSlots.includes(id));
      const slotsToRemove = oldSlots.filter(id => !newSlots.includes(id));

      // 2️⃣ Check capacity only for slots to add
      for (const slotId of slotsToAdd) {
        const { data: slot, error: slotErr } = await supabase
          .from("slots")
          .select("registration_count, max_capacity")
          .eq("id", slotId)
          .single();
        if (slotErr) throw slotErr;
        if (slot.registration_count >= slot.max_capacity) {
          return new Response(JSON.stringify({ success: false, message: `Slot ${slotId} is full`, full: true }), { status: 400, headers: { "Access-Control-Allow-Origin": origin } });
        }
      }

      // 3️⃣ Update registration
      const { mobile_number, ...updateData } = mainData;
      const { error: updErr } = await supabase.from("registrations").update(updateData).eq("id", old.id);
      if (updErr) throw updErr;
      mainId = old.id;

      // 4️⃣ Update slot counts atomically
      for (const slotId of slotsToRemove) await supabase.rpc("decrement_slot", { slot_id: slotId });
      for (const slotId of slotsToAdd) await supabase.rpc("increment_slot", { slot_id: slotId });

    } else {
      // New registration
      const { data: inserted, error: insertErr } = await supabase
        .from("registrations")
        .insert([mainData])
        .select()
        .single();
      if (insertErr) throw insertErr;
      mainId = inserted.id;

      for (const slotId of newSlots) await supabase.rpc("increment_slot", { slot_id: slotId });
    }

    return new Response(JSON.stringify({ success: true, mainId }), {
      status: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": origin },
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err?.message || "Unknown error" }), {
      status: 400,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": ORIGINS[0] },
    });
  }
});
