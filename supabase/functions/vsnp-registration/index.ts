import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ORIGINS = ["https://kcdastrust.org"];

// Rate limiting
const RATE_LIMIT_WINDOW = 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 5;

serve(async (req) => {
  try {
    const origin = req.headers.get("Origin") || "";

    /* ======================= CORS ======================= */
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
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": origin,
          },
        }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    /* ======================= RATE LIMIT ======================= */
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";

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
            JSON.stringify({ success: false, error: "Rate limit exceeded" }),
            {
              status: 429,
              headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": origin,
              },
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

    /* ======================= BODY ======================= */
    const body = await req.json().catch(() => null);
    if (!body) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid JSON" }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": origin,
          },
        }
      );
    }

    /* =====================================================
       DELETE VSNP REGISTRATIONS (CHANGE SLOTS)
       ===================================================== */
    if (body.action === "DELETE_VSNP") {
      const sourceReferences = body.source_reference;

      if (!Array.isArray(sourceReferences) || sourceReferences.length === 0) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "source_reference must be a non-empty array",
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

      const { error } = await supabase.rpc(
        "vsnp_delete_by_source_refs",
        {
          p_source_reference: sourceReferences
        }
      );

      if (error) {
        return new Response(
          JSON.stringify({
            success: false,
            error: error.message,
          }),
          {
            status: 500,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": origin,
            },
          }
        );
      }

      return new Response(
        JSON.stringify({ success: true }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": origin,
          },
        }
      );
    }


    /* =====================================================
       REGISTER / UPDATE VSNP SLOTS (UNCHANGED)
       ===================================================== */
    if (!Array.isArray(body.mainData)) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid payload" }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": origin,
          },
        }
      );
    }

    const { error } = await supabase.rpc(
      "vsnp_register_bulk",
      { payload: body.mainData }
    );

    if (error) {
      return new Response(
        JSON.stringify({ success: false, error: error.message }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": origin,
          },
        }
      );
    }

    return new Response(
      JSON.stringify({ success: true }),
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
      JSON.stringify({
        success: false,
        error: err?.message || "Unknown error",
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
