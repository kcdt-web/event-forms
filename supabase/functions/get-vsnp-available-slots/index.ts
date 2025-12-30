import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ORIGINS = ["http://localhost:4200"];

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
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    if (req.method !== "GET") {
      return new Response(
        JSON.stringify({ success: false, error: "GET required" }),
        {
          status: 400,
          headers: { "Access-Control-Allow-Origin": origin },
        }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data, error } = await supabase
      .from("vsnp_slots")
      .select("*")
      .order("id", { ascending: true });

    if (error) throw error;

    const slotsWithAvailability = data.map((slot) => ({
      ...slot,
      remaining: slot.max_capacity - slot.registration_count,
      disabled: slot.registration_count >= slot.max_capacity,
    }));

    return new Response(
      JSON.stringify({ success: true, slots: slotsWithAvailability }),
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
      JSON.stringify({ success: false, error: err?.message || "Unknown error" }),
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
