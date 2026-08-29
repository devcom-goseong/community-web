#!/usr/bin/env node
/* =============================================================================
   Check the Gmail SMTP connection.

       npm run check:smtp          connect and authenticate only
       npm run check:smtp -- --send  also send one real test email

   Reads the same variables the Netlify function reads, from your local .env.
   It never prints the App Password, only whether one is set and how long it is.
   ========================================================================== */

"use strict";

const fs = require("fs");
const path = require("path");
const nodemailer = require("nodemailer");

const ROOT = path.join(__dirname, "..");

/* --- Load .env without adding a dependency ------------------------------- */
function loadEnv() {
  const file = path.join(ROOT, ".env");
  if (!fs.existsSync(file)) return false;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/);
    if (!match || line.trim().startsWith("#")) continue;
    let value = match[2].trim();
    if (/^".*"$/.test(value) || /^'.*'$/.test(value)) value = value.slice(1, -1);
    if (!(match[1] in process.env)) process.env[match[1]] = value;
  }
  return true;
}

const ok = (m) => console.log("  PASS  " + m);
const bad = (m) => console.log("  FAIL  " + m);
const note = (m) => console.log("        " + m);

/* --- Turn an SMTP failure into something actionable ---------------------- */
function explain(error) {
  const text = [error.message, error.response, error.code].filter(Boolean).join(" ");

  if (/535|Username and Password not accepted|BadCredentials/i.test(text)) {
    return [
      "Gmail rejected the credentials.",
      "The usual causes, in the order worth checking:",
      "  1. GMAIL_APP_PASSWORD holds the normal account password, not an App Password.",
      "  2. The App Password was revoked - changing the account's main password",
      "     revokes every App Password on it.",
      "  3. GMAIL_USER is not the account the App Password was created on.",
      "  4. A stray space or quote crept into the value in .env."
    ];
  }
  if (/534|Application-specific password required/i.test(text)) {
    return [
      "Gmail is asking for an App Password specifically.",
      "The value in GMAIL_APP_PASSWORD is the account password. Generate an App",
      "Password at https://myaccount.google.com/apppasswords and use that instead."
    ];
  }
  if (/ETIMEDOUT|ECONNREFUSED|ENOTFOUND|ECONNRESET/i.test(text)) {
    return [
      "Could not reach smtp.gmail.com at all - this is the network, not the credentials.",
      "University and office networks often block outbound SMTP.",
      "Try GMAIL_SMTP_PORT=587 in .env, or run the check from another network.",
      "Netlify's own network is not restricted, so this can fail locally and still",
      "work in production."
    ];
  }
  if (/self signed|unable to verify|certificate/i.test(text)) {
    return [
      "TLS certificate could not be verified.",
      "Usually a corporate proxy intercepting the connection. Try another network.",
      "Do not disable certificate checking to get around this."
    ];
  }
  return ["Unrecognised failure. The raw error is above."];
}

/* --- Run ------------------------------------------------------------------ */
(async () => {
  console.log("\nGmail SMTP check\n");

  const hasEnvFile = loadEnv();
  console.log("1. Configuration");
  if (hasEnvFile) ok(".env found");
  else note("no .env file - reading variables from the shell environment instead");

  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  const inbox = process.env.TEAM_INBOX || user;
  const port = Number(process.env.GMAIL_SMTP_PORT || 465);

  let fatal = false;

  if (user) ok("GMAIL_USER            " + user);
  else { bad("GMAIL_USER            not set"); fatal = true; }

  if (pass) {
    const stripped = pass.replace(/\s/g, "");
    ok("GMAIL_APP_PASSWORD    set, " + stripped.length + " characters (value not shown)");
    if (stripped.length !== 16) {
      note("An App Password is 16 characters. " + stripped.length + " suggests this is the");
      note("account password, or that something was truncated when it was pasted.");
    }
    if (/^["']|["']$/.test(pass)) {
      note("The value starts or ends with a quote. .env does not need quotes -");
      note("they become part of the password.");
    }
  } else { bad("GMAIL_APP_PASSWORD    not set"); fatal = true; }

  ok("TEAM_INBOX            " + (inbox || "(none)"));
  ok("GMAIL_SMTP_PORT       " + port + (port === 465 ? "  (implicit TLS)" : port === 587 ? "  (STARTTLS)" : "  (unusual for Gmail)"));

  if (fatal) {
    console.log("\nStopping: set the missing variables in .env first. See README section 3.\n");
    process.exit(1);
  }

  console.log("\n2. Connection and authentication");
  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port,
    secure: port === 465,
    auth: { user, pass }
  });

  try {
    await transporter.verify();
    ok("connected to smtp.gmail.com:" + port + " and authenticated");
  } catch (error) {
    bad("could not authenticate");
    console.log("\n        " + (error.message || error));
    console.log();
    explain(error).forEach((line) => console.log("        " + line));
    console.log();
    process.exit(1);
  }

  if (!process.argv.includes("--send")) {
    console.log("\nSMTP is working. Run with --send to put a real test email in the inbox:");
    console.log("    npm run check:smtp -- --send\n");
    return;
  }

  console.log("\n3. Test message");
  try {
    const info = await transporter.sendMail({
      from: '"KDU Developer Community" <' + user + ">",
      to: inbox,
      subject: "[KDU Dev] SMTP test",
      text:
        "If you are reading this, the website form can send mail.\n\n" +
        "Sent by scripts/check-smtp.js at " + new Date().toISOString() + ".\n" +
        "Nothing was submitted through the website - this is a manual test."
    });
    ok("sent to " + inbox);
    note("message id " + info.messageId);
    note("If it is not in the inbox within a minute, check Spam. Gmail often files");
    note("the very first message from a new sender there; mark it Not Spam once.");
  } catch (error) {
    bad("connected, but sending failed");
    console.log("\n        " + (error.message || error) + "\n");
    process.exit(1);
  }
  console.log();
})();
