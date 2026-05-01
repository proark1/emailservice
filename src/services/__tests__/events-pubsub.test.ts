import { describe, it, expect, beforeEach } from "vitest";

// The pubsub service depends on the logger, which loads config at import
// time. Tests run without a real DATABASE_URL — set a placeholder so
// loadConfig() succeeds. We never touch the DB in these tests.
process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";

const { publishEvent, subscribe, _resetForTests } = await import("../events-pubsub.service.js");

describe("events pub/sub (in-process fan-out)", () => {
  beforeEach(() => {
    _resetForTests();
  });

  it("delivers a published event to a subscribed listener", async () => {
    const received: any[] = [];
    const dispose = await subscribe("acct-1", (e) => received.push(e));
    await publishEvent("acct-1", {
      type: "email.sent",
      created_at: new Date().toISOString(),
      data: { id: "e1" },
    });
    expect(received).toHaveLength(1);
    expect(received[0].type).toBe("email.sent");
    dispose();
  });

  it("isolates accounts — events for one account don't reach another's listener", async () => {
    const received: any[] = [];
    const dispose = await subscribe("acct-A", (e) => received.push(e));
    await publishEvent("acct-B", {
      type: "email.sent",
      created_at: new Date().toISOString(),
      data: { id: "e2" },
    });
    expect(received).toHaveLength(0);
    dispose();
  });

  it("removes listeners on disposer", async () => {
    const received: any[] = [];
    const dispose = await subscribe("acct-1", (e) => received.push(e));
    dispose();
    await publishEvent("acct-1", {
      type: "email.sent",
      created_at: new Date().toISOString(),
      data: { id: "e3" },
    });
    expect(received).toHaveLength(0);
  });
});
