/* =============================================================================
   KDU Developer Community — /api/register
   -----------------------------------------------------------------------------
   Receives the join / contact form, validates it, then sends two emails through
   Gmail SMTP with Nodemailer:

     1. a confirmation to the person who wrote in;
     2. a notification to the community inbox, with Reply-To set to them.

   Credentials come from Netlify environment variables and are never committed:

     GMAIL_USER            the Gmail address that sends the mail
     GMAIL_APP_PASSWORD    a 16-character Google App Password (not the account password)
     TEAM_INBOX            optional; where notifications go. Defaults to GMAIL_USER.
     GMAIL_SMTP_PORT       optional; 465 (default, implicit TLS) or 587 (STARTTLS)

   See README.md for how to generate the App Password and set the variables.
   ========================================================================== */

"use strict";

const nodemailer = require("nodemailer");

const TEAM_NAME = "KDU Developer Community";
const SITE_URL = "https://dev-comm.netlify.app";

const LIMITS = { name: 120, email: 160, studentId: 40, message: 2000, interests: 12 };
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/* Minimum time a genuine person needs to fill the form in, in milliseconds.
   Only enforced when the browser supplied a timestamp. */
const MIN_FILL_MS = 1500;
const MAX_FILL_MS = 1000 * 60 * 60 * 12;

/* Best-effort rate limiting. Netlify functions are stateless between cold
   starts, so this only catches bursts against one warm instance — which is
   exactly the shape of most naive spam. It is not a security boundary. */
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX = 5;
const seen = new Map();

/* -----------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/* Strips CR/LF so nothing submitted can be smuggled into a mail header. */
function headerSafe(value, max) {
  return String(value == null ? "" : value)
    .replace(/[\r\n]+/g, " ")
    .trim()
    .slice(0, max);
}

function clean(value, max) {
  return String(value == null ? "" : value).trim().slice(0, max);
}

function parseBody(event) {
  const raw = event.isBase64Encoded
    ? Buffer.from(event.body || "", "base64").toString("utf8")
    : event.body || "";

  const type = String(
    (event.headers && (event.headers["content-type"] || event.headers["Content-Type"])) || ""
  ).toLowerCase();

  if (type.includes("application/json")) {
    try {
      return { data: JSON.parse(raw), wantsJson: true };
    } catch (error) {
      return { data: null, wantsJson: true };
    }
  }

  // Form-encoded: the no-JavaScript path.
  const params = new URLSearchParams(raw);
  const data = {};
  for (const key of new Set(params.keys())) {
    const values = params.getAll(key);
    data[key] = key === "interests" ? values : values[0];
  }
  return { data, wantsJson: false };
}

function rateLimited(ip) {
  if (!ip) return false;
  const now = Date.now();
  const hits = (seen.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  hits.push(now);
  seen.set(ip, hits);

  // Keep the map from growing without bound on a long-lived instance.
  if (seen.size > 500) {
    for (const [key, times] of seen) {
      if (!times.length || now - times[times.length - 1] > RATE_WINDOW_MS) seen.delete(key);
    }
  }
  return hits.length > RATE_MAX;
}

/* Netlify stops a synchronous function at 10 seconds. Nodemailer's own
   timeouts do not always fire before that, and when the function is killed
   instead the caller gets a 502 with an HTML body - which the form cannot
   parse, so the visitor sees a generic "something went wrong" with no
   explanation. Bounding each send keeps every failure inside our own error
   handling, where it has a message attached. */
const SEND_BUDGET_MS = 7000;

function withTimeout(promise, ms, label) {
  let timer;
  const limit = new Promise(function (_, reject) {
    timer = setTimeout(function () {
      reject(new Error(label + " did not finish within " + ms + "ms"));
    }, ms);
  });
  return Promise.race([promise, limit]).finally(function () { clearTimeout(timer); });
}

/* -----------------------------------------------------------------------------
   Responses
   -------------------------------------------------------------------------- */

function json(statusCode, payload) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
    body: JSON.stringify(payload)
  };
}

/* The no-JavaScript fallback page. It reuses the site stylesheets so the
   confirmation still looks like the rest of the site. */
function htmlPage(statusCode, title, heading, message) {
  const body = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} — ${TEAM_NAME}</title>
<meta name="robots" content="noindex">
<link rel="icon" href="/assets/favicon/favicon.ico" sizes="32x32">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400..700;1,400..600&amp;display=swap">
<link rel="stylesheet" href="/css/variables.css">
<link rel="stylesheet" href="/css/base.css">
<link rel="stylesheet" href="/css/components.css">
</head>
<body>
<main id="main" class="section">
  <div class="wrap wrap--narrow">
    <p class="caption">${TEAM_NAME}</p>
    <h1 class="page-head__title">${escapeHtml(heading)}</h1>
    <p class="page-head__lead">${escapeHtml(message)}</p>
    <p class="mt-8"><a class="btn" href="/index.html">Back to the site</a></p>
  </div>
</main>
</body>
</html>`;

  return {
    statusCode,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
    body
  };
}

function fail(wantsJson, statusCode, message, fields) {
  if (wantsJson) return json(statusCode, { ok: false, message, fields: fields || [] });
  return htmlPage(statusCode, "Not sent", "That did not go through", message);
}

function succeed(wantsJson, email) {
  if (wantsJson) return json(200, { ok: true });
  return htmlPage(
    200,
    "Message sent",
    "Thank you — we have it",
    "A confirmation is on its way to " +
      email +
      ". Someone on the founding team will read what you wrote and reply to you directly."
  );
}

/* -----------------------------------------------------------------------------
   Email bodies
   -------------------------------------------------------------------------- */

const STUDENT_LABELS = { yes: "Yes", no: "No", soon: "Starting soon" };

function notificationEmail(entry) {
  const rows = [
    ["Name", entry.name],
    ["Email", entry.email],
    ["KDU student", STUDENT_LABELS[entry.student] || "Not answered"],
    ["Student ID", entry.studentId || "—"],
    ["Interests", entry.interests.length ? entry.interests.join(", ") : "—"],
    ["Reason", entry.intent === "question" ? "Question" : "Membership application"],
    ["Accepted rules, terms, privacy", entry.agree ? "Yes" : "No"],
    ["Consented to be contacted", entry.consent ? "Yes" : "No"],
    ["Received", entry.received]
  ];

  const text =
    rows.map(([label, value]) => `${label}: ${value}`).join("\n") +
    "\n\nMessage:\n" +
    (entry.message || "(no message)") +
    "\n\n--\nSent by the website form at " +
    SITE_URL +
    "/join.html\nReply directly to this email to answer them.";

  const html = `<div style="font-family:Helvetica,Arial,sans-serif;color:#141414;line-height:1.6;max-width:640px">
  <p style="font-family:monospace;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#6a6a6a;margin:0 0 8px">
    ${entry.intent === "question" ? "New question" : "New membership application"}
  </p>
  <h1 style="font-size:22px;margin:0 0 20px;color:#0d0d0d">${escapeHtml(entry.name)}</h1>
  <table style="border-collapse:collapse;width:100%;font-size:14px">
    ${rows
      .map(
        ([label, value]) => `<tr>
      <td style="padding:8px 16px 8px 0;border-bottom:1px solid #d4d4d4;color:#6a6a6a;white-space:nowrap;vertical-align:top">${escapeHtml(label)}</td>
      <td style="padding:8px 0;border-bottom:1px solid #d4d4d4;color:#141414">${escapeHtml(value)}</td>
    </tr>`
      )
      .join("\n    ")}
  </table>
  <p style="font-family:monospace;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#6a6a6a;margin:24px 0 8px">Message</p>
  <div style="white-space:pre-wrap;border-left:2px solid #0d0d0d;padding:4px 0 4px 16px;font-size:15px">${escapeHtml(
    entry.message || "(no message)"
  )}</div>
  <p style="font-size:13px;color:#6a6a6a;margin-top:28px;border-top:1px solid #d4d4d4;padding-top:12px">
    Sent by the form at ${SITE_URL}/join.html — reply to this email to answer them directly.
  </p>
</div>`;

  return { text, html };
}

function confirmationEmail(entry) {
  const firstName = entry.name.split(/\s+/)[0] || "there";
  const summary = [
    `Reason: ${entry.intent === "question" ? "A question" : "Membership application"}`,
    `Name: ${entry.name}`,
    `Email: ${entry.email}`,
    `KDU student: ${STUDENT_LABELS[entry.student] || "Not answered"}`,
    entry.interests.length ? `Interests: ${entry.interests.join(", ")}` : null,
    `Accepted the community rules, terms and privacy notice on ${entry.received}`
  ]
    .filter(Boolean)
    .join("\n");

  const text = `Hi ${firstName},

Thanks for your interest in the ${TEAM_NAME}. We have your message, and someone on
the founding team will read it and get back to you.

Here is what you sent us:

${summary}

${entry.message ? `Your message:\n${entry.message}\n\n` : ""}If anything above is wrong, just reply to this email and tell us.

— The ${TEAM_NAME} founding team
Kyungdong University, South Korea
${SITE_URL}

You can read what you agreed to at any time:
  Rules:   ${SITE_URL}/rules.html
  Terms:   ${SITE_URL}/terms.html
  Privacy: ${SITE_URL}/privacy.html

You are receiving this because you used the form at ${SITE_URL}/join.html. We keep
your details in our inbox only, and we do not share them outside the leadership
team. Ask us to delete them and we will.`;

  const html = `<div style="font-family:Helvetica,Arial,sans-serif;color:#141414;line-height:1.65;max-width:600px">
  <p style="font-family:monospace;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#6a6a6a;margin:0 0 8px">
    ${escapeHtml(TEAM_NAME)}
  </p>
  <h1 style="font-size:24px;margin:0 0 20px;color:#0d0d0d">Thanks, ${escapeHtml(firstName)} — we have it.</h1>
  <p style="margin:0 0 16px">
    Thanks for your interest in the ${escapeHtml(TEAM_NAME)}. Someone on the founding team
    will read what you wrote and get back to you.
  </p>
  <p style="font-family:monospace;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#6a6a6a;margin:28px 0 8px">
    What you sent us
  </p>
  <div style="white-space:pre-wrap;border-left:2px solid #0d0d0d;padding:4px 0 4px 16px;font-size:14px;color:#141414">${escapeHtml(
    summary
  )}</div>
  ${
    entry.message
      ? `<div style="white-space:pre-wrap;border-left:2px solid #d4d4d4;padding:4px 0 4px 16px;margin-top:16px;font-size:14px;color:#6a6a6a">${escapeHtml(
          entry.message
        )}</div>`
      : ""
  }
  <p style="margin:24px 0 0">If anything above is wrong, just reply to this email and tell us.</p>
  <p style="margin:24px 0 0;color:#6a6a6a">— The ${escapeHtml(TEAM_NAME)} founding team<br>Kyungdong University, South Korea</p>
  <p style="font-size:12px;color:#8a8a8a;margin-top:28px;border-top:1px solid #d4d4d4;padding-top:12px">
    You agreed to the <a href="${SITE_URL}/rules.html">community rules</a>,
    <a href="${SITE_URL}/terms.html">terms</a> and
    <a href="${SITE_URL}/privacy.html">privacy notice</a> on ${entry.received}.
    You are receiving this because you used the form at ${SITE_URL}/join.html.
    Your details stay in our inbox, are not shared outside the leadership team,
    and are deleted whenever you ask.
  </p>
</div>`;

  return { text, html };
}

/* -----------------------------------------------------------------------------
   Handler
   -------------------------------------------------------------------------- */

exports.handler = async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: { Allow: "POST, OPTIONS" }, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return json(405, { ok: false, message: "Use POST." });
  }

  const { data, wantsJson } = parseBody(event);
  if (!data) return fail(wantsJson, 400, "We could not read that submission. Please try again.");

  /* --- Spam traps -------------------------------------------------------- */

  // Honeypot. Bots fill it; people never see it. Answer with a plain success so
  // the bot has nothing to learn from, and drop the submission on the floor.
  if (clean(data.website, 200)) {
    return succeed(wantsJson, clean(data.email, LIMITS.email));
  }

  const stamp = Number(data.ts || 0);
  if (stamp > 0) {
    const elapsed = Date.now() - stamp;
    if (elapsed < MIN_FILL_MS || elapsed > MAX_FILL_MS) {
      return fail(
        wantsJson,
        400,
        "That form was open for an unusual length of time. Please reload the page and send it again."
      );
    }
  }

  const ip =
    (event.headers && (event.headers["x-nf-client-connection-ip"] || event.headers["client-ip"])) ||
    "";
  if (rateLimited(ip)) {
    return fail(wantsJson, 429, "That is a lot of messages at once. Please try again in a few minutes.");
  }

  /* --- Validation -------------------------------------------------------- */

  const entry = {
    intent: data.intent === "question" ? "question" : "join",
    name: headerSafe(data.name, LIMITS.name),
    email: headerSafe(data.email, LIMITS.email).toLowerCase(),
    student: ["yes", "no", "soon"].includes(data.student) ? data.student : "",
    studentId: headerSafe(data.studentId, LIMITS.studentId),
    interests: (Array.isArray(data.interests) ? data.interests : data.interests ? [data.interests] : [])
      .slice(0, LIMITS.interests)
      .map((value) => clean(value, 60))
      .filter(Boolean),
    message: clean(data.message, LIMITS.message),
    consent: data.consent === "yes" || data.consent === true || data.consent === "on",
    agree: data.agree === "yes" || data.agree === true || data.agree === "on",
    received: new Date().toISOString().replace("T", " ").slice(0, 16) + " UTC"
  };

  const fields = [];
  if (!entry.name) fields.push("name");
  if (!EMAIL_PATTERN.test(entry.email)) fields.push("email");
  if (!entry.agree) fields.push("agree");
  if (!entry.consent) fields.push("consent");
  if (entry.intent === "question" && !entry.message) fields.push("message");

  if (fields.length) {
    return fail(
      wantsJson,
      422,
      "Some required details are missing or do not look right. Please check the highlighted fields.",
      fields
    );
  }

  /* --- Configuration ----------------------------------------------------- */

  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  const inbox = process.env.TEAM_INBOX || user;
  const port = Number(process.env.GMAIL_SMTP_PORT || 465);

  if (!user || !pass) {
    // Names only. No value is ever logged, and none of this reaches the browser.
    const missing = [!user && "GMAIL_USER", !pass && "GMAIL_APP_PASSWORD"].filter(Boolean);
    const visible = Object.keys(process.env).filter((k) => /GMAIL|TEAM_INBOX|SMTP/i.test(k)).sort();
    console.error(
      "register: cannot send. Missing " + missing.join(" and ") + ". " +
      "Related variable names this function can see: " +
      (visible.length ? visible.join(", ") : "(none at all)") + ". " +
      "If that list is empty or incomplete, it is one of: (1) the variables were " +
      "added after the last deploy - Netlify fixes env values at deploy time, so " +
      "set them then redeploy; (2) their scope does not include Functions; " +
      "(3) they are set for a different deploy context than the one serving this " +
      "request; (4) they were declared in netlify.toml, which functions never see; " +
      "(5) a typo or trailing space in the variable name."
    );
    return fail(
      wantsJson,
      500,
      "The site cannot send email at the moment. Please try again later — we have been notified."
    );
  }

  let transporter;
  try {
    transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port,
      secure: port === 465,
      auth: { user, pass },
      // One pooled connection carries both messages, so Gmail is greeted and
      // authenticated once rather than twice. On a cold start the second
      // handshake was the difference between finishing and being killed.
      pool: true,
      maxConnections: 1,
      maxMessages: 3,
      connectionTimeout: 5000,
      greetingTimeout: 4000,
      socketTimeout: 6000
    });
  } catch (error) {
    console.error("register: could not create the mail transport:", error && error.message);
    return fail(
      wantsJson,
      500,
      "The site cannot send email at the moment. Please try again later \u2014 we have been notified."
    );
  }

  const from = `"${TEAM_NAME}" <${user}>`;
  const subjectName = entry.name || entry.email;
  const notification = notificationEmail(entry);
  const confirmation = confirmationEmail(entry);

  /* --- Send -------------------------------------------------------------- */

  // Both messages are queued at once so they share the pooled connection. The
  // team notification is the one that must not be lost; the applicant's
  // confirmation is best effort, because by the time it fails the team already
  // has the submission and telling the applicant it failed would be wrong.
  const [teamSend, applicantSend] = await Promise.allSettled([
    withTimeout(
      transporter.sendMail({
        from,
        to: inbox,
        replyTo: `"${subjectName}" <${entry.email}>`,
        subject:
          entry.intent === "question"
            ? `[KDU Dev] Question from ${subjectName}`
            : `[KDU Dev] Membership application \u2014 ${subjectName}`,
        text: notification.text,
        html: notification.html
      }),
      SEND_BUDGET_MS,
      "team notification"
    ),
    withTimeout(
      transporter.sendMail({
        from,
        to: `"${subjectName}" <${entry.email}>`,
        replyTo: inbox,
        subject: `Thanks for your interest in the ${TEAM_NAME}`,
        text: confirmation.text,
        html: confirmation.html
      }),
      SEND_BUDGET_MS,
      "confirmation"
    )
  ]);

  // Release the pooled connection so the function can exit promptly.
  try {
    if (transporter && typeof transporter.close === "function") transporter.close();
  } catch (error) {
    /* closing a pool that never opened is not a failure */
  }

  if (teamSend.status === "rejected") {
    console.error(
      "register: could not send the team notification:",
      teamSend.reason && teamSend.reason.message
    );
    return fail(
      wantsJson,
      502,
      "We could not deliver your message just now. Please try again in a few minutes."
    );
  }

  if (applicantSend.status === "rejected") {
    console.error(
      "register: the team was notified but the applicant confirmation failed:",
      applicantSend.reason && applicantSend.reason.message
    );
  }

  return succeed(wantsJson, entry.email);
};
