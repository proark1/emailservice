import { FastifyInstance } from "fastify";
import { z } from "zod";
import * as prefsService from "../services/preferences.service.js";
import { assertNotCompanyScoped } from "../plugins/auth.js";
import { ValidationError } from "../lib/errors.js";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const createTopicSchema = z.object({
  key: z.string().min(1).max(64),
  label: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  default_subscribed: z.boolean().optional(),
});

const updatePreferencesSchema = z.object({
  topics: z
    .array(z.object({ key: z.string().min(1).max(64), subscribed: z.boolean() }))
    .optional(),
  master_unsubscribe: z.boolean().optional(),
});

/**
 * Authenticated CRUD: list/create/delete topics on an audience, and inspect
 * a contact's effective preferences. Mounted under /v1/audiences/:audienceId/topics
 * and /v1/audiences/:audienceId/contacts/:email/preferences.
 */
export async function audienceTopicRoutes(app: FastifyInstance) {
  app.addHook("onRequest", async (request) => {
    await app.authenticate(request);
    assertNotCompanyScoped(request);
  });

  app.get<{ Params: { id: string } }>("/:id/topics", async (request) => {
    const topics = await prefsService.listTopics(request.account.id, request.params.id);
    return {
      data: topics.map((t) => ({
        id: t.id,
        key: t.key,
        label: t.label,
        description: t.description,
        default_subscribed: t.defaultSubscribed,
        created_at: t.createdAt.toISOString(),
      })),
    };
  });

  app.post<{ Params: { id: string } }>("/:id/topics", async (request, reply) => {
    const body = createTopicSchema.parse(request.body);
    const topic = await prefsService.createTopic(request.account.id, request.params.id, body);
    return reply.status(201).send({
      data: {
        id: topic.id,
        key: topic.key,
        label: topic.label,
        description: topic.description,
        default_subscribed: topic.defaultSubscribed,
        created_at: topic.createdAt.toISOString(),
      },
    });
  });

  app.delete<{ Params: { id: string; topicId: string } }>(
    "/:id/topics/:topicId",
    async (request) => {
      const deleted = await prefsService.deleteTopic(
        request.account.id,
        request.params.id,
        request.params.topicId,
      );
      return { data: { id: deleted.id, key: deleted.key } };
    },
  );

  // GET /v1/audiences/:id/contacts/:email/preferences — inspect
  app.get<{ Params: { id: string; email: string } }>(
    "/:id/contacts/:email/preferences",
    async (request) => {
      const result = await prefsService.getContactPreferences(
        request.account.id,
        request.params.id,
        decodeURIComponent(request.params.email),
      );
      return { data: result };
    },
  );

  // PATCH /v1/audiences/:id/contacts/:email/preferences — update
  app.patch<{ Params: { id: string; email: string } }>(
    "/:id/contacts/:email/preferences",
    async (request) => {
      const body = updatePreferencesSchema.parse(request.body);
      const result = await prefsService.updateContactPreferences(
        request.account.id,
        request.params.id,
        decodeURIComponent(request.params.email),
        body,
      );
      return { data: result };
    },
  );

  // POST /v1/audiences/:id/contacts/:email/preferences/url — generate a
  // signed link the operator can email to the recipient.
  app.post<{ Params: { id: string; email: string } }>(
    "/:id/contacts/:email/preferences/url",
    async (request) => {
      const email = decodeURIComponent(request.params.email);
      // Sanity-check the contact exists before issuing a token.
      await prefsService.getContactPreferences(
        request.account.id,
        request.params.id,
        email,
      );
      const url = prefsService.preferenceCenterUrl(
        request.account.id,
        request.params.id,
        email,
      );
      return { data: { url } };
    },
  );
}

/**
 * Public preference center, no auth — token-only. Mounted at /preferences.
 * Renders an HTML page on GET and accepts a JSON PATCH from the page's
 * fetch() call. Token is AES-256-GCM, so even forging a request to update
 * preferences requires the encryption key.
 */
export async function publicPreferenceRoutes(app: FastifyInstance) {
  app.get<{ Params: { token: string } }>("/:token", async (request, reply) => {
    const payload = prefsService.decodePreferenceToken(request.params.token);
    if (!payload) {
      return reply
        .status(400)
        .header("Content-Type", "text/html")
        .send("<html><body><h1>Invalid preference link</h1></body></html>");
    }
    let prefs;
    try {
      prefs = await prefsService.getContactPreferences(payload.a, payload.au, payload.e);
    } catch {
      return reply
        .status(404)
        .header("Content-Type", "text/html")
        .send("<html><body><h1>Contact not found</h1></body></html>");
    }
    // Escape `<`, U+2028 and U+2029 when embedding JSON in a <script> block.
    // Without this, a topic label containing "</script>…" could break out of
    // the script and execute arbitrary code on the preference-center page.
    const safeJson = (v: unknown) =>
      JSON.stringify(v).replace(/</g, "\\u003c").replace(new RegExp(String.fromCharCode(0x2028), "g"), "\\u2028").replace(new RegExp(String.fromCharCode(0x2029), "g"), "\\u2029");
    const topicsJson = safeJson(prefs.topics);
    const tokenJson = safeJson(request.params.token);
    const html = `<!doctype html><html lang="en"><head>
<meta charset="utf-8"><title>Email preferences</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body { font-family: -apple-system, system-ui, sans-serif; max-width: 540px; margin: 60px auto; padding: 0 20px; color: #1f2937; }
  h1 { font-size: 1.5rem; margin-bottom: 0.5rem; }
  p { color: #4b5563; }
  label { display: flex; align-items: flex-start; gap: 12px; padding: 12px 0; border-bottom: 1px solid #e5e7eb; cursor: pointer; }
  label input { margin-top: 4px; }
  .desc { font-size: 0.875rem; color: #6b7280; }
  button { background: #111827; color: white; padding: 10px 18px; border: none; border-radius: 6px; cursor: pointer; font-size: 1rem; margin-top: 16px; }
  button:disabled { background: #9ca3af; }
  .secondary { background: transparent; color: #b91c1c; padding-left: 0; }
  .status { margin-top: 12px; color: #059669; }
  .err { color: #b91c1c; }
</style>
</head><body>
<h1>Email preferences</h1>
<p>Manage what ${escapeHtml(prefs.contact.email)} receives.</p>
<form id="prefs"></form>
<button id="save">Save preferences</button>
<button id="unsuball" class="secondary">Unsubscribe from everything</button>
<div id="status" class="status"></div>
<script>
  const topics = ${topicsJson};
  const token = ${tokenJson};
  const form = document.getElementById('prefs');
  for (const t of topics) {
    const id = 'topic-' + t.key;
    const wrap = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'checkbox'; input.checked = t.subscribed; input.id = id; input.dataset.key = t.key;
    // Build the label DOM with textContent so operator-supplied topic
    // labels and descriptions can never inject HTML/JS.
    const span = document.createElement('span');
    const strong = document.createElement('strong');
    strong.textContent = t.label;
    span.appendChild(strong);
    if (t.description) {
      const desc = document.createElement('div');
      desc.className = 'desc';
      desc.textContent = t.description;
      span.appendChild(desc);
    }
    wrap.appendChild(input); wrap.appendChild(span);
    form.appendChild(wrap);
  }
  async function patch(body) {
    const status = document.getElementById('status');
    status.className = 'status'; status.textContent = '';
    try {
      const res = await fetch('/preferences/' + encodeURIComponent(token), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('save failed');
      status.textContent = 'Preferences saved.';
    } catch (e) {
      status.className = 'status err'; status.textContent = 'Could not save — please try again.';
    }
  }
  document.getElementById('save').addEventListener('click', () => {
    const updates = Array.from(form.querySelectorAll('input[type=checkbox]')).map((el) => ({
      key: el.dataset.key, subscribed: el.checked,
    }));
    patch({ topics: updates });
  });
  document.getElementById('unsuball').addEventListener('click', () => {
    if (!confirm('Unsubscribe from all email?')) return;
    patch({ master_unsubscribe: true });
  });
</script>
</body></html>`;
    return reply.header("Content-Type", "text/html").send(html);
  });

  app.patch<{ Params: { token: string } }>("/:token", async (request, reply) => {
    const payload = prefsService.decodePreferenceToken(request.params.token);
    if (!payload) throw new ValidationError("Invalid preference link");
    const body = updatePreferencesSchema.parse(request.body);
    const result = await prefsService.updateContactPreferences(
      payload.a,
      payload.au,
      payload.e,
      body,
    );
    return reply.status(200).send({ data: result });
  });
}
