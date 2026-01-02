import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

/* =========================
   Environment variables
========================= */
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const ORIGINS = ["https://kcdastrust.org"];
// const ORIGINS = ["http://localhost:4200"];
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 5;

/* =========================
   Server
========================= */
serve(async (req) => {
  try {
    const origin = req.headers.get("Origin") || "";
    if (!ORIGINS.includes(origin)) {
      return new Response("Forbidden", { status: 403 });
    }

    /* ===== CORS preflight ===== */
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
       Client IP
    ========================= */
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
      (req.conn as any)?.remoteAddr?.hostname ||
      "unknown";

    /* =========================
       Rate limiting
    ========================= */
    const now = Date.now();

    const { data: rateData, error: rateFetchError } = await supabase
      .from("request_rate_limit")
      .select("*")
      .eq("ip", ip)
      .single();

    if (rateFetchError && rateFetchError.code !== "PGRST116") {
      throw rateFetchError;
    }

    if (rateData) {
      if (now - rateData.last_request < RATE_LIMIT_WINDOW) {
        if (rateData.count >= MAX_REQUESTS_PER_WINDOW) {
          return new Response(
            JSON.stringify({
              success: false,
              message: "Rate limit exceeded",
            }),
            {
              status: 429,
              headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": origin,
              },
            }
          );
        }

        const { error: updateError } = await supabase
          .from("request_rate_limit")
          .update({ count: rateData.count + 1 })
          .eq("ip", ip);

        if (updateError) throw updateError;
      } else {
        const { error: resetError } = await supabase
          .from("request_rate_limit")
          .update({ count: 1, last_request: now })
          .eq("ip", ip);

        if (resetError) throw resetError;
      }
    } else {
      const { error: insertError } = await supabase
        .from("request_rate_limit")
        .insert({
          ip,
          count: 1,
          last_request: now,
        });

      if (insertError) throw insertError;
    }

    /* =========================
       Request body
    ========================= */
    const { mobile_number, action } = await req.json();

    if (!mobile_number) {
      return new Response(
        JSON.stringify({
          success: false,
          message: "Mobile number is required",
        }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": origin,
          },
        }
      );
    }

    /* =========================
       Lookup primary participant
    ========================= */
    const { data: mainParticipant, error: mainError } = await supabase
      .from("varanasi_events_primary_participants")
      .select("*")
      .eq("mobile_number", mobile_number)
      .limit(1)
      .single();

    if (mainError && mainError.code !== "PGRST116") {
      throw mainError;
    }

    /* =========================
       If not primary → lookup accompanying
    ========================= */
    if (!mainParticipant) {
      const { data: accompParticipant, error: accompError } = await supabase
        .from("varanasi_event_accompanying_participants")
        .select("*")
        .eq("mobile_number", mobile_number)
        .limit(1)
        .single();

      if (accompError && accompError.code !== "PGRST116") {
        throw accompError;
      }

      if (accompParticipant) {
        const { data: mainForAccomp, error: mainFetchError } =
          await supabase
            .from("varanasi_events_primary_participants")
            .select("full_name")
            .eq("id", accompParticipant.main_participant_id)
            .single();

        if (mainFetchError) throw mainFetchError;

        return new Response(
          JSON.stringify({
            success: false,
            message: `You are registered as an accompanying participant for ${mainForAccomp.full_name}. Please contact them to complete slot registration.`,
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

      return new Response(
        JSON.stringify({
          success: false,
          message: "Participant not found",
        }),
        {
          status: 404,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": origin,
          },
        }
      );
    }

    /* =========================
       Fetch accompanying participants
    ========================= */
    const { data: accompParticipants, error: accompFetchError } =
      await supabase
        .from("varanasi_event_accompanying_participants")
        .select("*")
        .eq("main_participant_id", mainParticipant.id);

    if (accompFetchError) throw accompFetchError;

    /* =========================
       Withdraw logic
    ========================= */
    if (action === "withdraw") {
      const withdrawal_date = new Date().toISOString();

      const { error: mainWithdrawError } = await supabase
        .from("varanasi_events_primary_participants")
        .update({
          status: "false",
          withdrawal_date,
        })
        .eq("id", mainParticipant.id);

      if (mainWithdrawError) throw mainWithdrawError;

      const { error: accompWithdrawError } = await supabase
        .from("varanasi_event_accompanying_participants")
        .update({
          status: "false",
          withdrawal_date,
        })
        .eq("main_participant_id", mainParticipant.id);

      if (accompWithdrawError) throw accompWithdrawError;

      mainParticipant.status = "false";
      mainParticipant.withdrawal_date = withdrawal_date;

      accompParticipants.forEach((p) => {
        p.status = "false";
        p.withdrawal_date = withdrawal_date;
      });
    }

    /* =========================
       Success response
    ========================= */
    return new Response(
      JSON.stringify({
        success: true,
        mainParticipant,
        accompParticipants,
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
      JSON.stringify({
        success: false,
        error: error.message,
      }),
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
