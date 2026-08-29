# KDU Developer Community — website

The public site for the KDU Developer Community at Kyungdong University, South Korea.

Plain HTML, CSS and vanilla JavaScript. No framework, no build step, no bundler.
The only server-side code is one Netlify Function that emails the join / contact
form. Everything else is static files that can be opened straight from disk.

---

## 1. What is where

```
.
├── index.html                 Home
├── about.html                 Origin, mission, values, roles, membership
├── activities.html            The seven activities, each linking to its own page
├── join.html                  Join / contact form
│
├── activity-meeting.html      ├── activity-study-groups.html  |
├── activity-ideas.html         |
├── activity-projects.html      >  one page per activity
├── activity-hackathons.html    |
├── activity-demo-day.html      |
├── activity-meetups.html      /
│
├── start.html                 Your first month, for new members
├── interests.html             The areas people work across
├── resources.html             A short list of good starting points
├── faq.html                   Questions people actually ask
│
├── rules.html                 Community rules - applicants must accept these
├── terms.html                 Terms of membership and of using the site
├── privacy.html               What the form collects and what happens to it
├── accessibility.html         What the site does, and what it does not do yet
├── contribute.html            How to work on this site
├── contents.html              Human-readable index of every page
├── 404.html                   Not-found page (Netlify serves it automatically)
│
├── css/
│   ├── variables.css          ← ALL colours, fonts and spacing tokens live here
│   ├── base.css               Reset, typography, layout primitives, utilities
│   ├── components.css         Header, hero, plates, cards, bands, footer
│   └── form.css               Join form only (loaded by join.html)
│
├── js/
│   ├── site.js                Mobile menu + copyright year (every page)
│   └── form.js                Form validation and submission (join.html only)
│
├── netlify/functions/
│   └── register.js            Receives the form, sends the two emails
│
├── server/                    Django applications service - deployed separately,
│                              not part of the Netlify site. See server/README.md
│
├── scripts/
│   └── check-smtp.js          `npm run check:smtp` - proves the Gmail login works
│
├── assets/
│   ├── images/                Logo, hand, chevron, wordmark, OG card
│   └── favicon/               Favicons, app icons, .ico
│
├── netlify.toml               Routing, headers, caching, function config
├── site.webmanifest           PWA / home-screen icons
├── robots.txt, sitemap.xml    SEO
├── package.json               One dependency: nodemailer
└── .env.example               The environment variables you need to set
```

There is no `/pages` directory: all 22 pages sit at the root so links work
identically from disk, from any static server and from Netlify.

**Adding a page.** There is no template engine, so the head, header and footer
are duplicated in each file. Copy the nearest existing page, change the
`<title>`, the meta description, the canonical URL and the `og:`/`twitter:`
tags, then add it to `sitemap.xml`, to `contents.html`, and to the footer if it
belongs there. The scripts that generated the current pages are not kept in the
repository, because a generator nobody runs is worse than honest duplication.

---

## 2. Running it locally

**The quickest look** — open `index.html` in a browser. Everything works except
the form, which needs the function.

**With the form working** (recommended):

```bash
npm install
npx netlify-cli dev
```

That serves the site and the function together on <http://localhost:8888>, and
loads your local `.env`. Create it first:

```bash
cp .env.example .env
```

**Any other static server** also works for everything except the form:

```bash
npx --yes serve . --listen 3000
```

---

## 3. Environment variables and the Gmail App Password

The function never contains a password. It reads four variables:

| Variable | Required | What it is |
| --- | --- | --- |
| `GMAIL_USER` | yes | The Gmail address the site sends mail **from** |
| `GMAIL_APP_PASSWORD` | yes | A 16-character Google App Password — **not** the account password |
| `TEAM_INBOX` | no | Where new submissions are delivered. Defaults to `GMAIL_USER` |
| `GMAIL_SMTP_PORT` | no | `465` (default, implicit TLS) or `587` (STARTTLS) |

### Generating the App Password

An App Password is a 16-character credential that lets a program sign in to
Gmail without doing a full OAuth flow. It is not your account password, it only
works for mail, and it can be revoked on its own without touching anything else.

1. Sign in to the account the site will send mail **from**. Use a dedicated
   community Gmail account, not anyone's personal one — whoever holds it can
   read every application that comes in, and the account should outlive any one
   member of the team.
2. Turn on **2-Step Verification** at <https://myaccount.google.com/security>.
   This is a hard prerequisite: Google does not offer App Passwords at all until
   2SV is on, and the page below will simply not appear.
3. Go straight to <https://myaccount.google.com/apppasswords>.

   **Do not use the search box in Google Account settings.** Searching "app"
   returns Web & App Activity, Your linked apps and some help articles, and no
   App Passwords row — even on accounts where App Passwords works perfectly.
   The Security page hides the row too. Loading the URL directly is the only
   reliable route; sign in again if it asks.
4. Type a name — `KDU website` is fine. The name is only a label for you, it
   changes nothing about how the password works. Click **Create**.
5. Copy the 16 characters from the dialog. **You cannot get them back**: once
   you close it, the list only shows the name and the creation date, never the
   password. If you lose it, delete that entry and make a new one.
   Google displays it as four groups of four for readability — the spaces are
   not part of the password, so paste it either way.

### If the App Passwords page will not open

Google hides the option entirely in these cases, rather than showing an error
that explains why:

| What you see | Why | What to do |
| --- | --- | --- |
| Nothing in search, nothing under Security, but the URL above loads fine | Nothing. The search box and the Security page both hide the row | Use the URL. This is the usual case |
| The URL says the setting is not available | 2-Step Verification is off | Turn on 2SV at <https://myaccount.google.com/signinoptions/twosv>, then reload |
| The URL says the setting is not available, and 2SV **is** on | 2SV uses **security keys or passkeys only** | Add an authenticator app or phone prompt as a second method |
| The URL says the setting is not available on a university account | It is a **work, school or Workspace** account and the admin has turned App Passwords off | Do not fight this. Use a separate Gmail account for the community — which is the right answer anyway |
| Option missing on an otherwise correct account | The account is enrolled in **Advanced Protection** | Advanced Protection blocks App Passwords by design. Use a different sending account |

### Keeping it safe

- Never commit it. `.env` is already in `.gitignore`; the only file in the repo
  that mentions these variables is `.env.example`, which holds names, not values.
- It grants send-and-read access to that Gmail account's mail. Treat it like a
  password, because it is one.
- **Changing the account's main password revokes every App Password on it.** If
  the form suddenly stops sending, check that first — it is the most common
  cause and it looks like a code failure when it is not.
- To revoke: go back to <https://myaccount.google.com/apppasswords>, find the
  entry and click **Remove**. The site stops sending within seconds. Generate a
  replacement and update the Netlify variable.
- If it ever lands in a commit, revoking is not optional — Git history is public
  on this repo, so rotate it immediately rather than deleting the file.

### Sending limits

A free Gmail account can send roughly 500 messages a day; a Workspace account
roughly 2000. Each form submission sends **two** messages (the applicant's
confirmation and the team notification), so a free account covers about 250
submissions a day. That is far beyond anything this site will see, but it is
worth knowing the ceiling exists before a hackathon signup rush.

### Setting them on Netlify

Site configuration → Environment variables → **Add a variable**, once for each
name in the table above. Then trigger a redeploy — functions only pick up new
variables on a fresh deploy.

### Setting them locally

Put them in `.env` (already listed in `.gitignore`). `netlify dev` loads that
file automatically.

```
GMAIL_USER=kdu.dev.community@gmail.com
GMAIL_APP_PASSWORD=abcdefghijklmnop
TEAM_INBOX=kdu.dev.community@gmail.com
```

No quotes and no spaces around the `=`. Quotes become part of the value, which
is a surprisingly common reason for a login failure that looks like a wrong
password.

### Checking the SMTP connection

Before wiring anything to the live form, prove the credentials work:

```bash
npm run check:smtp
```

It reads the same variables the function reads, connects to `smtp.gmail.com`,
authenticates, and stops. It never prints the App Password — only whether one is
set and how many characters it has. To also put a real message in the inbox:

```bash
npm run check:smtp -- --send
```

When it fails it says *why*, not just that it failed. The three failures worth
recognising:

| What it reports | What it means |
| --- | --- |
| `535 Username and Password not accepted` | Wrong App Password, a revoked one, or `GMAIL_USER` is a different account from the one the password was made on |
| `534 Application-specific password required` | The value is the account password, not an App Password |
| `ETIMEDOUT` / `ECONNREFUSED` | Nothing wrong with the credentials — the network is blocking outbound SMTP. Common on university and office WiFi. Try `GMAIL_SMTP_PORT=587`, or another network. Netlify is not restricted, so this can fail locally and still work in production |

### How the connection is configured

The function builds the transport itself; there is nothing to configure beyond
the variables above.

| Setting | Value | Why |
| --- | --- | --- |
| Host | `smtp.gmail.com` | Fixed |
| Port | `465` by default | Implicit TLS: the connection is encrypted from the first byte |
| `secure` | `true` when the port is 465 | Derived from the port, so setting `GMAIL_SMTP_PORT=587` switches to STARTTLS correctly |
| Auth | `GMAIL_USER` + `GMAIL_APP_PASSWORD` | Plain SMTP auth over TLS |

Use 465 unless something blocks it. Both are encrypted — 587 negotiates the
encryption after connecting, 465 starts encrypted.

---

## 4. Deploying to Netlify

**From the Netlify dashboard**

1. Push this folder to <https://github.com/devcom-goseong/community-web>.
2. Netlify → Add new site → Import an existing project → pick
   `devcom-goseong/community-web`.
3. Leave the build settings alone. `netlify.toml` already declares them:
   publish directory `.`, functions directory `netlify/functions`, no build
   command.
4. Add the environment variables from section 3.
5. Deploy.

**From the command line**

```bash
npx netlify-cli deploy --prod
```

After the first deploy, check:

- `/join.html` — submit the form and confirm both emails arrive.
- `/api/register` in the browser — should answer `405`, not `404`. A `404`
  means the function did not deploy.
- Functions → `register` in the Netlify dashboard for the logs if anything
  fails.

---

## 5. Changing the look

### Colours

Every colour in the site is a CSS custom property in
[`css/variables.css`](css/variables.css). Nothing in the HTML or the other
stylesheets hard-codes a colour.

The values shipped today are **placeholders** — a working greyscale so the site
looks finished. To replace the palette, edit the ten values under
`1. GREY RAMP` and stop. The semantic tokens in section 2 (`--color-bg`,
`--color-text`, `--color-border`, `--color-ink`, `--color-primary` …) are
derived from the ramp and the whole site follows.

The design is deliberately greyscale: black, white and greys only, no accent
colour anywhere including buttons and hover states. Contrast and typography do
the work. If a colour is ever introduced, it should be a decision made in that
one file.

Also in `variables.css`:

- `--font` — the one typeface
- `--fs-*` — the fluid type scale
- `--space-*`, `--section-gap`, `--gutter`, `--wrap` — spacing and layout
- `--grain-opacity` — the paper texture. Set it to `0` to remove the grain
  everywhere.
- `--radius` — `0` by design (vintage print has sharp corners)

### The typeface

The site is set in **one** face: EB Garamond, a revival of the 16th-century
French book types, loaded from Google Fonts in roman and italic only — two
files. Headings, body copy, form labels, buttons and captions are all the same
family. Hierarchy comes from size, weight and italic, never from switching
face.

There is a single token, `--font`. If you swap it, change the Google Fonts
`<link>` too — it appears in the four pages, `404.html`, and the fallback page
inside `netlify/functions/register.js`.

Two things to know if you do swap it:

- Garamond has a small x-height, so `--fs-body` is set to 19px. A face with a
  larger x-height (most sans-serifs) will look oversized at that value; drop it
  back to 16–17px.
- Small letterspaced capitals do the work that a second, monospaced face used to
  do — the `.caption` class and the form labels. Check they still read at
  `--fs-caption` in whatever you replace it with.

### What was deliberately left out

Worth knowing, so nobody adds them back thinking they were an oversight:

- **No numbered section labels.** Sections open with their heading and nothing
  else. Numbering every section is a systematising habit that makes a site feel
  generated rather than written.
- **No marquee in the hero band.** The black ground under the hero is solid and
  silent. It is the ground the drawing rises out of, not a place to put
  scrolling text.
- **No second or third typeface**, and no icon set beyond the four small line
  drawings on the home page.

### Logo and favicon

Both are already built from `Dev.png` and are in place:

| File | Used for |
| --- | --- |
| `assets/images/logo-mark.png` / `.webp` | The three-ellipse mark in the header |
| `assets/images/logo-mark-inverse.png` | The same mark on the dark footer and bands |
| `assets/images/hand.png` / `.webp` | The hand in the hero and on the 404 page |
| `assets/images/logo-full.png` | The complete lockup, for print and social profiles |
| `assets/images/wordmark.png` | The "Dev Community" wordmark on its own |
| `assets/images/chevron.png` | The drawn chevron, spare |
| `assets/images/og-image.png` | The 1200×630 social sharing card |
| `assets/favicon/*` | Browser tab, iOS home screen, web manifest |

To replace any of them, drop a file with the same name into the same folder.
Keep the `width` and `height` attributes in the HTML in step with the new
dimensions, or the page will shift as images load. See
[`assets/images/README.md`](assets/images/README.md) for exact sizes and for
the script that regenerated them.

---

## 6. How the form works

`join.html` → `js/form.js` → `POST /api/register` →
`netlify/functions/register.js` → Gmail SMTP.

The one form covers both jobs. A radio at the top sets the intent, which
changes the subject line of the notification and what counts as required.

1. `form.js` validates name, email and consent in the browser, marks bad fields
   and moves focus to the first one.
2. It posts JSON and reports the result inline. There is no page reload and no
   redirect.
3. `register.js` re-validates everything server-side — the browser check is a
   convenience, not a control — then sends:
   - a **confirmation** to the applicant, with `Reply-To` set to the team inbox;
   - a **notification** to the team, with `Reply-To` set to the applicant, so
     replying from the inbox reaches them directly.
4. If the notification fails the whole request fails and the person is told. If
   only the confirmation fails, the team still has the submission, so the
   request still succeeds and the failure is logged.

**Without JavaScript** the form posts normally to the same endpoint and the
function answers with a small confirmation page that reuses the site
stylesheets. Nothing is lost.

### What an applicant agrees to

The form has two required checkboxes, and both are checked again on the server -
the browser check is a convenience, not a control:

- **Agreement.** They confirm they have read `rules.html`, `terms.html` and
  `privacy.html`. The three are also linked in the panel beside the form, so they
  are visible before anyone starts filling it in, not just at the point of
  signing.
- **Contact consent.** Separate on purpose: agreeing to the rules is not the same
  as agreeing to be emailed.

Both are recorded. The team notification lists whether each was given, alongside
the timestamp, so there is a record of what was accepted and when. The applicant's
confirmation email repeats it and links the three documents, so they have their
own copy.

If the documents change materially, the date at the top of each page is the
version members agreed to, and anything significant should be announced on the
community platform.

### Spam protection

No captcha, no third-party service. Three cheap layers instead:

- **Honeypot** — a `website` field that is off-screen and not focusable. If it
  is filled, the function returns a normal-looking success and silently drops
  the submission, so a bot learns nothing.
- **Timing** — the page records when it loaded. Anything submitted in under
  1.5 seconds is rejected. Skipped when the timestamp is absent, so the
  no-JavaScript path still works.
- **Rate limiting** — five submissions per IP per ten minutes. This is
  best-effort: Netlify functions are stateless between cold starts, so it
  catches bursts against a warm instance rather than a determined attacker.

Also: every submitted value is length-capped, CR/LF is stripped from anything
that reaches a mail header, and everything is HTML-escaped before it goes into
the email bodies.

If spam ever becomes a real problem, the next step is Netlify's built-in form
spam filtering or hCaptcha — but do not add one before it is needed.

---

## 7. Before launch

- [x] **Site domain set.** `https://dev-comm.netlify.app` is wired into the
      four HTML files (canonical + Open Graph), `sitemap.xml`, `robots.txt` and
      `SITE_URL` in `netlify/functions/register.js`. If the domain ever changes,
      those are the only places to update.
- [ ] **Set the environment variables** on Netlify and redeploy.
- [ ] **Send a test submission** and check that both emails arrive and are not
      in Spam. Gmail sometimes files the first one there.
- [ ] **Add the remaining platform links.** GitHub already points at
      <https://github.com/devcom-goseong>. Discord, WhatsApp and Instagram still
      carry a "Soon" tag — there is an HTML comment above the list showing how to
      turn each one into a real link. The footer is repeated in all four pages.
- [x] **No personal names on the site.** The About page describes four areas of
      responsibility rather than individuals, so it does not need updating every
      time somebody joins, leaves or swaps areas.
- [ ] **Update `lastmod`** in `sitemap.xml` when the content next changes.
- [ ] **Submit the sitemap** to Google Search Console.
- [ ] **Publish the rules** once they are finished. The About page summarises
      what they cover and says the full text is coming.

---

## 8. Accessibility and performance notes

Worth knowing before making changes:

- Semantic landmarks throughout, one `<h1>` per page, no skipped heading
  levels, a skip link, and visible focus outlines on every interactive element.
- The mobile menu is a real disclosure: `aria-expanded`, Escape closes it and
  returns focus to the button, and the body scroll is locked while it is open.
- Form fields use real labels, `aria-describedby` for hints and errors, and
  `aria-invalid` when a field fails. Error states are shown with a border, an
  icon and text — never by colour alone.
- All animation is inside `@media (prefers-reduced-motion: reduce)` guards. The
  hero ticker stops completely.
- Images carry `width` and `height` so nothing shifts as the page loads.
  Decorative images have empty `alt` and `aria-hidden`.
- WebP with a PNG fallback via `<picture>` for the two large images.
- Three font files, one CSS request, preconnected. Total page weight is well
  under 400 KB.
- Security headers and a content security policy are set in `netlify.toml`.

The CSS and JS are shipped unminified on purpose — this is a teaching codebase
as much as a website, and Netlify can minify on the fly if it is ever needed
(Site configuration → Build & deploy → Post processing).

---

## 9. The applications service

`server/` holds a Django app that can take over the form: it stores every
submission in a database so the leadership team can review applications in one
place instead of digging through an inbox, and still sends the same two emails.
It runs on its own server with Docker, Postgres and nginx, and has its own CI
pipeline in `.github/workflows/applications.yml`.

**It is not live, and the public site is unchanged.** Nothing in this README
applies to it; `server/README.md` covers running, testing and deploying it.

One thing to carry across if it is ever switched on: the privacy notice on this
site says there is no database. That statement has to be rewritten in the same
commit that points the form at the Django service. `server/README.md` opens
with the replacement wording.

---

## 10. Credits

Built by the founding team of the KDU Developer Community. The site describes
the community's work by area of responsibility rather than by person, and the
same applies here.

Source: <https://github.com/devcom-goseong/community-web>
Organisation: <https://github.com/devcom-goseong>
