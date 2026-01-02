export const environment = {
    production: true,
    supabaseUrl: 'https://blopfvarveykkggbpkfr.supabase.co',
    supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJsb3BmdmFydmV5a2tnZ2Jwa2ZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM3NTAyOTMsImV4cCI6MjA3OTMyNjI5M30.wQrrYv7LDUsMOI8RaAEE6kT9VakBAMJ-baz3lxZYsnA',
    recaptchaSiteKey: '6LcHyRUsAAAAAF7A2DKSOeCsB9gIhaJaJOZXoPX9',
    recaptchaEdgeFunction: "https://blopfvarveykkggbpkfr.supabase.co/functions/v1/recaptcha-verify",

    registerEdgeFunction: 'https://blopfvarveykkggbpkfr.supabase.co/functions/v1/register-participant',
    searchEdgeFunction: "https://blopfvarveykkggbpkfr.supabase.co/functions/v1/search-registration",
    varanasiPrimaryTable: "varanasi_events_primary_participants",
    varanasiAccompanyingTable: "varanasi_event_accompanying_participants",

    gayathriHavanamRegistrationEdgeFunction: "https://blopfvarveykkggbpkfr.supabase.co/functions/v1/gayathri-havanam-registrations",
    gayathriHavanamSlotsEdgeFunction: "https://blopfvarveykkggbpkfr.supabase.co/functions/v1/get-gh-available-slots",
    gayathriHavanamWaitlists: "https://blopfvarveykkggbpkfr.supabase.co/functions/v1/gh-waitlists",

    vsnpSlotsEdgeFunction: "https://blopfvarveykkggbpkfr.supabase.co/functions/v1/get-vsnp-available-slots",
    vsnpRegistrationsEdgeFunction: "https://blopfvarveykkggbpkfr.supabase.co/functions/v1/vsnp-registration",
    vsnpWaitlists: "https://blopfvarveykkggbpkfr.supabase.co/functions/v1/vsnp-waitlists",
    vsnpSearch: "https://blopfvarveykkggbpkfr.supabase.co/functions/v1/vsnp-search"
};