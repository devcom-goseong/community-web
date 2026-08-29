# Applications service

A small Django app that receives the join / contact form, stores each
submission so the leadership team can review them in one place, and sends the
two emails the applicant and the team expect.

**It does not serve the public website.** That stays on Netlify as static
files, exactly as it is. This service only owns the form.

```
Netlify (dev-comm.netlify.app)          this service (your VPS)
  22 static pages, unchanged     ──▶    POST /api/register
  js/form.js posts the form             stores the application
                                        sends both emails
                                        /admin/ to review them
```

---

## Read this before you switch the form over

The published privacy notice currently says, in section 2:

> There is no database. This website does not have one, and your details are
> not written anywhere except those two emails.

**That stops being true the moment this service goes live**, because the whole
point of it is a database. Publishing a privacy notice that misdescribes what
you do with people's data is not a small thing, and it is the one part of this
change that cannot be left until later.

Section 2 of `privacy.html` has to be rewritten in the same commit that points
the form at this service. Suggested replacement:

> **2. What happens to it**
>
> Your submission is sent to the community's own server, where it is stored so
> the leadership team can review it, and turned into two emails: a confirmation
> to you, so you know it arrived, and a notification to the community inbox.
>
> The server is run by the community and is not shared with anyone else. Your
> IP address is still not stored — it is used only, and briefly, to stop one
> source flooding the form.

Section 6, on how long things are kept, is already accurate. Section 4 needs
"our host, Netlify" widened to mention the community server as well.

---

## Running it locally

```bash
cp .env.example .env          # fill in at least DJANGO_SECRET_KEY
docker compose up --build
docker compose exec web python manage.py createsuperuser
```

Then <http://localhost:8000/admin/>. Email is written to the console in
development, so nothing is sent while you work.

Without Docker:

```bash
python -m venv .venv && . .venv/bin/activate    # .venv\Scripts\activate on Windows
pip install -r requirements-dev.txt
export DJANGO_DEBUG=1
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver
```

SQLite is used when `DATABASE_URL` is unset, so it starts with no services
running.

## Tests

```bash
python manage.py test
ruff check .
python manage.py check --deploy --fail-level WARNING
```

Sixteen tests cover the endpoint: validation, the required agreement, the
honeypot, the timing trap, rate limiting, CR/LF stripping from mail headers,
HTML escaping, the no-JavaScript path, and that an application survives an
email outage. One test asserts the submitter's IP is never written to the
database, because the privacy notice says so and a promise in prose is worth
less than a test.

---

## Deploying to a VPS

### Once, on the server

1. Install Docker and the compose plugin.
2. Point a DNS A record at the box, for example `apply.your-domain`.
3. Create a directory, and put three things in it:
   - `docker-compose.prod.yml`
   - `nginx/templates/default.conf.template`
   - `.env` (from `.env.example`, filled in — `APP_HOST` must match the DNS name)
4. Issue the certificate **before** starting nginx, because the config
   references files that do not exist yet:

   ```bash
   docker compose -f docker-compose.prod.yml up -d web db
   docker run --rm \
     -v certbot-conf:/etc/letsencrypt -v certbot-www:/var/www/certbot \
     -p 80:80 certbot/certbot certonly --standalone \
     -d apply.your-domain --agree-tos -m you@example.com --no-eff-email
   docker compose -f docker-compose.prod.yml up -d
   ```

5. Reload nginx after each renewal. Certbot renews in its own container but
   cannot reload nginx, so add a cron entry:

   ```
   0 4 * * * cd /path/to/app && docker compose -f docker-compose.prod.yml exec -T nginx nginx -s reload
   ```

6. Create the first admin user:

   ```bash
   docker compose -f docker-compose.prod.yml exec web python manage.py createsuperuser
   ```

### Continuous deployment

`.github/workflows/applications.yml` runs on any change under `server/`:

1. **Lint and test** against a real Postgres, including `check --deploy` and a
   check that no model change is missing a migration.
2. **Build and publish** the image to GHCR, tagged `latest` and by commit SHA.
3. **Deploy** over SSH: pull, `up -d`, prune, then poll `/healthz` ten times
   and fail the run if the service does not come back.

The deploy job **skips cleanly until the secrets exist**, so the workflow is
green from the first push rather than red until somebody buys a server. Set
these in Settings → Secrets and variables → Actions:

| Secret | What it is |
| --- | --- |
| `VPS_HOST` | Hostname or IP of the server |
| `VPS_USER` | SSH user |
| `VPS_SSH_KEY` | Private key for that user. Use a key made for this, not a personal one |
| `VPS_APP_DIR` | Directory on the server holding `docker-compose.prod.yml` |
| `VPS_PORT` | Optional, defaults to 22 |
| `APP_HOST` | Public hostname, used for the post-deploy health check |

The image is public on GHCR by default. If you make it private, the server
needs its own read token for `docker login`.

---

## Pointing the form at this service

Do this **last**, after a real submission has worked through the admin, and in
the same commit as the privacy notice change above.

The tidiest option keeps the browser on one origin, so no CORS and no change to
the site's content security policy. In the root `netlify.toml`, replace the
function redirect with a proxy:

```toml
[[redirects]]
  from = "/api/register"
  to = "https://apply.your-domain/api/register"
  status = 200
  force = true
```

The form keeps posting to `/api/register` and never knows. Once that is live
and proven, `netlify/functions/register.js` can be deleted.

If you would rather post directly to this service instead, the app already
allows the Netlify origin through `PUBLIC_SITE_ORIGINS`, but you must then also
add that origin to `connect-src` in the site's content security policy or the
browser will block the request.

---

## How it is put together

| Path | What it does |
| --- | --- |
| `config/settings.py` | All configuration, from environment variables |
| `applications/models.py` | The `Application` record, and the review workflow |
| `applications/views.py` | `POST /api/register`, answering in the shape the existing front end already expects |
| `applications/emails.py` | Both messages, over a single SMTP connection |
| `applications/admin.py` | The review screen: filters, search, bulk accept/decline |

Two decisions worth knowing about:

- **The IP address is never stored.** The rate limiter hashes it into the cache
  and nothing else touches it, because the privacy notice makes that promise.
- **The application is saved before the emails are attempted.** A mail outage
  costs you a notification, never an applicant — and the admin shows which of
  the two messages actually went out.

The response shape is deliberately identical to the Netlify function's, so the
front end needed no changes at all: `{"ok": true}` on success, and
`{"ok": false, "message": ..., "fields": [...]}` on a rejection.
