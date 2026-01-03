import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

/* =========================
   Environment variables
========================= */
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const ORIGINS = ["https://kcdastrust.org"];

const RATE_LIMIT_WINDOW = 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 5;

const VSNP_ACTIVITY = "Vishnu Sahasra Nama Parayanam";

/* =========================
   Helpers
========================= */
function hasVsnpActivity(activities: string[] | null): boolean {
  if (!Array.isArray(activities)) return false;
  return activities.some(a =>
    a.toLowerCase().includes(VSNP_ACTIVITY.toLowerCase())
  );
}

/* =========================
   Server
========================= */
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
      return new Response("Method Not Allowed", {
        status: 405,
        headers: { "Access-Control-Allow-Origin": origin },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    /* =========================
       Rate limiting
    ========================= */
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
    const now = Date.now();

    const { data: rateData } = await supabase
      .from("request_rate_limit")
      .select("*")
      .eq("ip", ip)
      .single();

    if (rateData) {
      if (now - rateData.last_request < RATE_LIMIT_WINDOW) {
        if (rateData.count >= MAX_REQUESTS_PER_WINDOW) {
          return new Response(
            JSON.stringify({ success: false, message: "Rate limit exceeded" }),
            { status: 429, headers: { "Access-Control-Allow-Origin": origin } }
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
        .insert({ ip, count: 1, last_request: now });
    }

    /* =========================
       Request body
    ========================= */
    const { mobile_number, context } = await req.json();
    const isVsnpContext = context === "VSNP";

    if (!mobile_number) {
      return new Response(
        JSON.stringify({ success: false, message: "Mobile number required" }),
        { status: 400, headers: { "Access-Control-Allow-Origin": origin } }
      );
    }

    /* =========================
       Primary participant
    ========================= */
    const { data: mainParticipant } = await supabase
      .from("varanasi_events_primary_participants")
      .select("*")
      .eq("mobile_number", mobile_number)
      .single();

    if (!mainParticipant) {
      return new Response(
        JSON.stringify({ success: false, message: "Participant not found" }),
        { status: 404, headers: { "Access-Control-Allow-Origin": origin } }
      );
    }

    /* =========================
       Accompanying participants
    ========================= */
    const { data: accompParticipants = [] } = await supabase
      .from("varanasi_event_accompanying_participants")
      .select("*")
      .eq("main_participant_id", mainParticipant.id);

    /* =========================
       VSNP filter
    ========================= */
    let filteredMain = mainParticipant;
    let filteredAccomp = accompParticipants;

    if (isVsnpContext) {
      filteredMain = hasVsnpActivity(mainParticipant.activities)
        ? mainParticipant
        : null;

      filteredAccomp = accompParticipants.filter(p =>
        hasVsnpActivity(p.activities)
      );
    }

    /* =========================
       Participant map
    ========================= */
    const participantMap = new Map<number, string>();
    if (filteredMain) participantMap.set(filteredMain.id, filteredMain.full_name);
    filteredAccomp.forEach(p => participantMap.set(p.id, p.full_name));
    const participantIds = [...participantMap.keys()];

    /* =========================
       Registrations
    ========================= */
    const [{ data: vsnpRegs }, { data: ghRegs }] = await Promise.all([
      supabase
        .from("vsnp_registrations")
        .select("source_reference, day1, day2")
        .in("source_reference", participantIds),

      supabase
        .from("gh_registrations")
        .select("source_reference, day1, day2, day3")
        .in("source_reference", participantIds),
    ]);

    /* =========================
       Slot resolution (ARRAY FIX)
    ========================= */
    const vsnpSlotIds = new Set<number>();
    const ghSlotIds = new Set<number>();

    vsnpRegs?.forEach(r => {
      r.day1?.forEach((id: string) => vsnpSlotIds.add(Number(id)));
      r.day2?.forEach((id: string) => vsnpSlotIds.add(Number(id)));
    });

    ghRegs?.forEach(r => {
      if (r.day1) ghSlotIds.add(Number(r.day1));
      if (r.day2) ghSlotIds.add(Number(r.day2));
      if (r.day3) ghSlotIds.add(Number(r.day3));
    });

    const [{ data: vsnpSlots }, { data: ghSlots }] = await Promise.all([
      supabase
        .from("vsnp_slots")
        .select("id, slot_time")
        .in("id", [...vsnpSlotIds]),

      supabase
        .from("gh_slots")
        .select("id, slot_time")
        .in("id", [...ghSlotIds]),
    ]);

    const vsnpSlotMap = new Map(vsnpSlots?.map(s => [s.id, s.slot_time]));
    const ghSlotMap = new Map(ghSlots?.map(s => [s.id, s.slot_time]));

    /* =========================
       Tables
    ========================= */
    const vsnp = (vsnpRegs || []).map(r => ({
      full_name: participantMap.get(r.source_reference),

      day1: r.day1?.length
        ? r.day1
          .map((id: string) => vsnpSlotMap.get(Number(id)))
          .filter(Boolean)
          .join(", ")
        : "-",

      day2: r.day2?.length
        ? r.day2
          .map((id: string) => vsnpSlotMap.get(Number(id)))
          .filter(Boolean)
          .join(", ")
        : "-",
    }));

    const gh = (ghRegs || []).map(r => ({
      full_name: participantMap.get(r.source_reference),
      day1: r.day1 ? ghSlotMap.get(Number(r.day1)) || "-" : "-",
      day2: r.day2 ? ghSlotMap.get(Number(r.day2)) || "-" : "-",
      day3: r.day3 ? ghSlotMap.get(Number(r.day3)) || "-" : "-",
    }));

    /* =========================
       Final response
    ========================= */
    return new Response(
      JSON.stringify({
        success: true,
        mainParticipant: filteredMain,
        accompParticipants: filteredAccomp,
        vsnp,
        gh,
      }),
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
        headers: { "Access-Control-Allow-Origin": ORIGINS[0] },
      }
    );
  }
});
