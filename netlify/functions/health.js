/* =============================================================================
   KDU Developer Community — /api/health
   -----------------------------------------------------------------------------
   A diagnostic for the email setup. It reports whether each variable is
   PRESENT, never what it contains:

     - no value is read, returned, or logged;
     - the variable names it reports are the ones already documented in the
       public README, so nothing here is a secret;
     - it does not connect to Gmail and cannot send anything.

   It exists to distinguish "the variables are not reaching the function" from
   "they are set but Gmail is rejecting them", which the form's own error
   message deliberately does not reveal to visitors.

   Safe to delete once the form is confirmed working. See README section 3.
   ========================================================================== */

"use strict";

const REQUIRED = ["GMAIL_USER", "GMAIL_APP_PASSWORD"];
const OPTIONAL = ["TEAM_INBOX", "GMAIL_SMTP_PORT"];

function present(name) {
  const value = process.env[name];
  return typeof value === "string" && value.trim().length > 0;
}

exports.handler = async function handler() {
  const config = {};
  for (const name of REQUIRED.concat(OPTIONAL)) config[name] = present(name);

  const ready = REQUIRED.every((name) => config[name]);

  // How many env keys look email-related at all. A count, not the names.
  const relatedKeyCount = Object.keys(process.env)
    .filter((k) => /GMAIL|TEAM_INBOX|SMTP/i.test(k)).length;

  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex"
    },
    body: JSON.stringify(
      {
        function: "ok",
        emailConfigured: ready,
        config,
        relatedKeyCount,
        deployContext: process.env.CONTEXT || null,
        branch: process.env.BRANCH || null,
        node: process.version,
        note: ready
          ? "Both required variables are visible to this function. If the form still fails, Gmail is rejecting the credentials - check the register function log."
          : "At least one required variable is missing. Netlify fixes env values at deploy time: set them in the UI (not netlify.toml), for the right deploy context, with a scope that includes Functions, then redeploy."
      },
      null,
      2
    )
  };
};
