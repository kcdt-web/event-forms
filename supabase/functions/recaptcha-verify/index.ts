import { serve } from "https://deno.land/std@0.208.0/http/server.ts";

serve(async (req) => {
  try {
    // Allow OPTIONS preflight for CORS
    if (req.method === "OPTIONS") {
      return new Response("ok", {
        headers: {
          "Access-Control-Allow-Origin": "https://kcdastrust.org",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
      });
    }

    if (req.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    const { token } = await req.json();

    if (!token) {
      return new Response(
        JSON.stringify({ success: false, message: "Missing token" }),
        {
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "https://kcdastrust.org" },
          status: 400,
        }
      );
    }

    const secret = Deno.env.get("RECAPTCHA_SECRET_KEY");

    if (!secret) {
      return new Response(
        JSON.stringify({ success: false, message: "Missing RECAPTCHA_SECRET_KEY" }),
        {
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "https://kcdastrust.org" },
          status: 500,
        }
      );
    }

    // Verify token with Google
    const googleResp = await fetch(
      "https://www.google.com/recaptcha/api/siteverify",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `secret=${secret}&response=${token}`,
      }
    );

    const result = await googleResp.json();

    // Optional: enforce score threshold (recommended >=0.5)
    const scoreThreshold = 0.5;
    const passed = result.success && (result.score ?? 0) >= scoreThreshold;

    return new Response(
      JSON.stringify({
        success: passed,
        score: result.score,
        action: result.action,
        "error-codes": result["error-codes"] ?? [],
      }),
      {
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "https://kcdastrust.org" },
        status: 200,
      }
    );

  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, message: err.message || "Server error" }),
      {
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "https://kcdastrust.org" },
        status: 500,
      }
    );
  }
});
