import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

/* =========================
   Environment variables
========================= */
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const ORIGINS = ["https://kcdastrust.org"];
// const ORIGINS = ["http://localhost:4200"];

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
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
      (req.conn as any)?.remoteAddr?.hostname ||
      "unknown";
    const now = Date.now();

    const { data: rateData, error: rateError } = await supabase
      .from("request_rate_limit")
      .select("*")
      .eq("ip", ip)
      .single();

    if (rateError && rateError.code !== "PGRST116") {
      throw rateError;
    }

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
    const { mobile_number, kcdt_member_id, context, action } = await req.json();

    const isVsnpContext = context === "VSNP";
    const isGhContext = context === "GH";

    if (!mobile_number) {
      return new Response(
        JSON.stringify({ success: false, message: "Mobile number required" }),
        { status: 400, headers: { "Access-Control-Allow-Origin": origin } }
      );
    }

    if (isGhContext && !kcdt_member_id) {
      return new Response(
        JSON.stringify({
          success: false,
          message: "KCDT Member ID required for GH",
        }),
        { status: 400, headers: { "Access-Control-Allow-Origin": origin } }
      );
    }

    /* =========================
       Primary participant
    ========================= */
    let mainParticipantQuery = supabase
      .from("varanasi_events_primary_participants")
      .select("*")
      .eq("mobile_number", mobile_number);

    if (isGhContext) {
      mainParticipantQuery = mainParticipantQuery.eq(
        "kcdt_member_id",
        kcdt_member_id
      );
    }

    let matchedRecord = null;
    let matchedAs: "primary" | "accompanying" | null = null;
    let primaryParticipant = null;

    const { data: primary } = await mainParticipantQuery.single();

    if (primary) {
      matchedRecord = primary;
      matchedAs = "primary";
      primaryParticipant = primary;
    } else if (isGhContext) {
      const { data: accomp } = await supabase
        .from("varanasi_event_accompanying_participants")
        .select("*")
        .eq("mobile_number", mobile_number)
        .eq("kcdt_member_id", kcdt_member_id)
        .single();

      if (accomp) {
        matchedRecord = accomp;
        matchedAs = "accompanying";

        // resolve real primary
        const { data: parent } = await supabase
          .from("varanasi_events_primary_participants")
          .select("*")
          .eq("id", accomp.main_participant_id)
          .single();

        primaryParticipant = parent;
      }
    }

    if (!matchedRecord || !primaryParticipant) {
      return new Response(
        JSON.stringify({
          success: false,
          message: "No participant found with the provided mobile number.",
        }),
        {
          status: 404,
          headers: { "Access-Control-Allow-Origin": origin },
        }
      );
    }

    /* =====================================================
    VSNP: Check accompanying participants if not primary
    ===================================================== */
    if (isVsnpContext && matchedAs === null) {
      const { data: accompList } = await supabase
        .from("varanasi_event_accompanying_participants")
        .select(`
      *,
      varanasi_events_primary_participants (
        id,
        full_name
      )
    `)
        .eq("mobile_number", mobile_number);

      if (accompList && accompList.length > 0) {
        const vsnpAccompParticipants = accompList.filter(p =>
          hasVsnpActivity(p.activities)
        );

        if (vsnpAccompParticipants.length > 0) {
          const mainForAccomp =
            vsnpAccompParticipants[0].varanasi_events_primary_participants;

          return new Response(
            JSON.stringify({
              success: false,
              message: `You are registered as an accompanying participant for ${mainForAccomp.full_name}. Please contact them to complete slot registration.`,
            }),
            {
              status: 403,
              headers: { "Access-Control-Allow-Origin": origin },
            }
          );
        }

        return new Response(
          JSON.stringify({
            success: false,
            message: "You are not registered for Vishnu Sahasra Nama Parayana activity.",
          }),
          {
            status: 403,
            headers: { "Access-Control-Allow-Origin": origin },
          }
        );
      }
    }

    /* =========================
      Withdraw logic
    ========================= */
    if (action === "withdraw") {
      const withdrawal_date = new Date().toISOString();

      // Withdraw primary participant
      const { error: primaryWithdrawError } = await supabase
        .from("varanasi_events_primary_participants")
        .update({
          status: "false",
          withdrawal_date,
        })
        .eq("id", primaryParticipant.id)

      if (primaryWithdrawError) {
        throw primaryWithdrawError;
      }

      // Withdraw all accompanying participants
      const { error: accompWithdrawError } = await supabase
        .from("varanasi_event_accompanying_participants")
        .update({
          status: "false",
          withdrawal_date,
        })
        .eq("main_participant_id", primaryParticipant.id)

      if (accompWithdrawError) {
        throw accompWithdrawError;
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: "Participant and accompanying members withdrawn successfully.",
          withdrawal_date,
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": origin,
          },
        }
      );
    }

    /* =========================
       Accompanying participants
    ========================= */
    const { data: accompParticipants = [] } = await supabase
      .from("varanasi_event_accompanying_participants")
      .select("*")
      .eq("main_participant_id", primaryParticipant.id);

    /* =========================
    VSNP validation
    ========================= */
    let filteredMain = primaryParticipant;
    let filteredAccomp = accompParticipants;

    if (isVsnpContext) {
      const primaryHasVsnp = hasVsnpActivity(primaryParticipant?.activities);

      // Keep only accomp participants registered for VSNP
      filteredAccomp = accompParticipants.filter(p =>
        hasVsnpActivity(p.activities)
      );

      // Case 1: Primary NOT registered, but accompanying ARE registered
      if (!primaryHasVsnp && filteredAccomp.length > 0) {
        // Attach message to primaryParticipant, but continue to final response
        filteredMain = {
          ...primaryParticipant,
          messages: [
            "You are not registered for the Vishnu Sahasranama Parayana activity; however, some members accompanying you are. Please select the slots for them.",
          ],
        };
      }

      // Case 2: Neither primary nor accompanying are registered
      if (!primaryHasVsnp && filteredAccomp.length === 0) {
        return new Response(
          JSON.stringify({
            success: false,
            message:
              "You are not registered for Vishnu Sahasra Nama Parayana activity.",
          }),
          {
            status: 403,
            headers: { "Access-Control-Allow-Origin": origin },
          }
        );
      }
    }

    /* =========================
       Participant map
    ========================= */
    const participantMap = new Map<number, string>();
    participantMap.set(filteredMain.id, filteredMain.full_name);
    filteredAccomp.forEach(p =>
      participantMap.set(p.id, p.full_name)
    );

    // const registrationSourceIds = [
    //   primaryParticipant.id,
    //   ...filteredAccomp.map(p => p.id),
    // ];

    const registrationSourceIds = isGhContext
      ? [matchedRecord.id]
      : [primaryParticipant.id, ...filteredAccomp.map(p => p.id)];

    /* =========================
       Registrations
    ========================= */
    const [{ data: vsnpRegs }, { data: ghRegs }] = await Promise.all([
      supabase
        .from("vsnp_registrations")
        .select("source_reference, day1, day2")
        .in("source_reference", registrationSourceIds),

      supabase
        .from("gh_registrations")
        .select("source_reference, day1, day2, day3")
        .in("source_reference", registrationSourceIds),
    ]);


    /* =========================
       Slot resolution
    ========================= */
    const vsnpSlotIds = new Set<number>();
    const ghSlotIds = new Set<number>();

    vsnpRegs?.forEach(r => {
      r.day1?.forEach((id: string) => vsnpSlotIds.add(Number(id)));
      r.day2?.forEach((id: string) => vsnpSlotIds.add(Number(id)));
    });

    ghRegs?.forEach(r => {
      r.day1?.forEach((id: string) => ghSlotIds.add(Number(id)));
      r.day2?.forEach((id: string) => ghSlotIds.add(Number(id)));
      r.day3?.forEach((id: string) => ghSlotIds.add(Number(id)));
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
      day1: r.day1?.map(id => vsnpSlotMap.get(Number(id))).filter(Boolean).join(", ") || "-",
      day2: r.day2?.map(id => vsnpSlotMap.get(Number(id))).filter(Boolean).join(", ") || "-",
    }));

    const gh = (ghRegs || []).map(r => ({
      full_name: participantMap.get(r.source_reference),
      day1: r.day1?.map(id => ghSlotMap.get(Number(id))).filter(Boolean).join(", ") || "-",
      day2: r.day2?.map(id => ghSlotMap.get(Number(id))).filter(Boolean).join(", ") || "-",
      day3: r.day3?.map(id => ghSlotMap.get(Number(id))).filter(Boolean).join(", ") || "-",
    }));

    /* =========================
       Final response
    ========================= */
    return new Response(
      JSON.stringify({
        success: true,
        matchedAs,
        participant: matchedRecord,
        primaryParticipant: filteredMain,
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
