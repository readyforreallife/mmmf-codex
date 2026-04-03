# MMMF Agreement Admin Worker

This Cloudflare Worker is the shared backend for the MMMF certification admin page.

## What it does

- accepts admin login with the MMMF teacher code
- creates short-lived admin sessions
- returns the shared agreement registry
- issues one agreement number at a time
- blocks duplicate agreement numbers
- blocks issuing a second number to the same person/email pair

## Required Cloudflare setup

### 1. Create a Worker

Create a new Cloudflare Worker and paste in:

- `ops/mmmf-agreement-admin-worker.js`

### 2. Add a KV binding

Create a KV namespace and bind it to the Worker as:

- `AGREEMENT_REGISTRY`

### 3. Add Worker secrets / vars

Add these:

- `ADMIN_CODE`
  - set this to `4429`
- `ALLOWED_ORIGIN`
  - set this to `https://readyforreallife.github.io`

### 4. Deploy

Deploy the Worker and copy the Worker URL.

It will look like:

- `https://your-worker-name.your-subdomain.workers.dev`

### 5. Connect the admin page

Open:

- `https://readyforreallife.github.io/mmmf-codex/web/agreement-tracker.html`

Paste the Worker URL into the endpoint field, enter `4429`, and click `Enter Teacher Mode`.

## Notes

- The registry is stored in KV, so it is shared across devices.
- The public certification viewer should stay copy-only.
- The admin page can still fall back to local safe mode if no Worker URL is entered.
