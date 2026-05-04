# @mailnowapi/sdk

Official TypeScript SDK for [MailNowAPI](https://mailnowapi.com).

## Install

```bash
pnpm add @mailnowapi/sdk
# or: npm install @mailnowapi/sdk / yarn add @mailnowapi/sdk
```

Requires Node 20+ (uses the built-in `fetch` and `crypto.subtle`). Works in
Cloudflare Workers, Bun, Deno, and modern browsers.

## Quickstart

```ts
import { MailNowApiClient } from "@mailnowapi/sdk";

const client = new MailNowApiClient({
  apiKey: process.env.MAILNOWAPI_API_KEY!,
  // baseUrl defaults to https://mailnowapi.com
});

const { data: email } = await client.emails.create({
  from: "Acme <hello@yourdomain.com>",
  to: ["customer@example.com"],
  subject: "Welcome to Acme",
  html: "<h1>Welcome!</h1>",
  idempotency_key: "welcome-customer-1234",
});

console.log("queued", email.id);
```

## Resources

The client groups endpoints by resource:

| Namespace | Methods |
|-----------|---------|
| `client.emails` | `create`, `list`, `get`, `cancel`, `sendBatch` |
| `client.domains` | `create`, `list`, `get`, `update`, `delete`, `verify` |
| `client.apiKeys` | `create`, `list`, `revoke` |
| `client.webhooks` | `create`, `list`, `get`, `update`, `delete` |

For endpoints not yet wrapped, use the typed escape hatch:

```ts
const result = await client.raw<{ data: unknown }>("POST", "/v1/audiences", {
  name: "Newsletter",
});
```

The full request and response types are exported from `types.gen.ts` (generated
from the OpenAPI spec) — import `paths` and `components` to type any
hand-rolled call.

## Errors

Failed requests throw `MailNowApiError`:

```ts
import { MailNowApiError } from "@mailnowapi/sdk";

try {
  await client.emails.create(payload);
} catch (err) {
  if (err instanceof MailNowApiError) {
    console.error(err.status, err.type, err.message, err.details);
    if (err.requestId) console.error("trace:", err.requestId);
  }
  throw err;
}
```

## Verifying webhook signatures

Every webhook delivery is signed with HMAC-SHA256 over the raw body using
the webhook's `signing_secret`, and sent in the `X-Webhook-Signature` header
as `sha256=<hex>`. Verify before trusting the payload:

```ts
import { verifyWebhookSignature } from "@mailnowapi/sdk";

app.post("/webhooks/email", async (req, res) => {
  const ok = await verifyWebhookSignature({
    rawBody: req.rawBody,                       // un-parsed Buffer / string
    signature: req.headers["x-webhook-signature"] as string,
    signingSecret: process.env.WEBHOOK_SECRET!,
  });
  if (!ok) return res.status(401).end();

  const event = JSON.parse(req.rawBody.toString());
  switch (event.type) {
    case "email.bounced":
      // event.data.recipient, event.data.status, ...
      break;
    case "email.complained":
      break;
    case "email.opened":
      break;
  }
  res.status(200).end();
});
```

The full list of event types and their payload shapes is documented in the
OpenAPI spec (`webhooks` section) and surfaced as the `WebhookEventName` type.

## Regenerating types

The `src/types.gen.ts` file is generated from `openapi.json` at the repo root:

```bash
pnpm run regenerate-types
```

CI runs `pnpm openapi:check` at the repo level, which regenerates the spec
and fails if it has drifted from the committed snapshot. Re-run
`regenerate-types` here whenever the spec changes.

## License

ISC
