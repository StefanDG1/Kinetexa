/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, it, expect, vi, afterEach } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";
const modules = import.meta.glob("./**/*.ts");
describe("destructive lifecycle boundaries", () => {
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });
  it("waits for the deletion grace period, recovers stale work and removes the recipient after confirmation acceptance", async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules),
      a = t.withIdentity({ subject: "delete-with-notice" }),
      b = t.withIdentity({ subject: "keep-with-notice" });
    const athleteId = await a.mutation(api.athletes.ensure),
      otherId = await b.mutation(api.athletes.ensure);
    const id = await a.mutation(api.lifecycle.requestDeletion, {
      confirmation: "DELETE MY ACCOUNT",
    });
    expect(
      await t.mutation(internal.lifecycle.claimDeletion, { id }),
    ).toBeNull();
    vi.setSystemTime(Date.now() + 15 * 60000);
    const first = (await t.mutation(internal.lifecycle.claimDeletion, { id }))!;
    const payload = {
      from: "synthetic@example.invalid",
      to: "synthetic@example.invalid",
      subject: "Deleted",
      text: "Your account has been deleted.",
    };
    await t.mutation(internal.lifecycle.prepareNotification, {
      id,
      lease: first.job.lease,
      payload,
    });
    const notice = (await t.query(internal.lifecycle.context, { id }))!.job
      .notificationId!;
    expect(await t.mutation(internal.email.claim, { id: notice })).toBeNull();
    await t.mutation(internal.lifecycle.deletionFailed, {
      id,
      lease: first.job.lease,
    });
    const second = (await t.mutation(internal.lifecycle.claimDeletion, {
      id,
    }))!;
    await expect(
      t.mutation(internal.lifecycle.purgeBatch, {
        athleteId,
        jobId: id,
        lease: first.job.lease,
      }),
    ).rejects.toThrow("unavailable");
    await expect(
      t.mutation(internal.lifecycle.purgeBatch, {
        athleteId: otherId,
        jobId: id,
        lease: second.job.lease,
      }),
    ).rejects.toThrow("unavailable");
    while (
      !(await t.mutation(internal.lifecycle.purgeBatch, {
        athleteId,
        jobId: id,
        lease: second.job.lease,
      }))
    ) {}
    expect(await t.run((ctx) => ctx.db.get(athleteId))).toBeNull();
    expect(await t.run((ctx) => ctx.db.get(otherId))).not.toBeNull();
    const email = (await t.mutation(internal.email.claim, { id: notice }))!;
    expect(
      await t.mutation(internal.email.rememberPayload, {
        id: notice,
        attempt: email.attempt,
        payload,
      }),
    ).toEqual(payload);
    await t.mutation(internal.email.result, {
      id: notice,
      attempt: email.attempt,
      providerId: "deletion-provider",
      failed: false,
    });
    expect(await t.run((ctx) => ctx.db.get(notice))).toBeNull();
    await t.mutation(internal.email.delivery, {
      providerId: "deletion-provider",
      status: "delivered",
      occurredAt: Date.now(),
      eventId: "signed-provider-event",
    });
    const events = await t.query(internal.email.deliveryEvents, { after: 0 });
    expect(events[0]).toMatchObject({
      status: "delivered",
      template: "deletion",
    });
    expect(events[0].athleteId).toBeUndefined();
    expect(JSON.stringify(events)).not.toContain("synthetic@example.invalid");
  });
  it("requires explicit confirmation, locks immediately and purges only the requesting owner", async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules),
      a = t.withIdentity({ subject: "erase" }),
      b = t.withIdentity({ subject: "keep" });
    const aid = await a.mutation(api.athletes.ensure),
      bid = await b.mutation(api.athletes.ensure);
    const gear = await b.mutation(api.workspace.saveGear, {
      name: "Keep",
      kind: "running shoe",
      retired: false,
      servicedAt: 0,
    });
    await expect(
      a.mutation(api.lifecycle.requestDeletion, { confirmation: "yes" }),
    ).rejects.toThrow("Type DELETE");
    const id = await a.mutation(api.lifecycle.requestDeletion, {
      confirmation: "DELETE MY ACCOUNT",
    });
    await expect(a.query(api.activities.list, {})).rejects.toThrow(
      "unavailable",
    );
    await expect(a.mutation(api.athletes.ensure, {})).rejects.toThrow(
      "being deleted",
    );
    vi.setSystemTime(Date.now() + 15 * 60000);
    const claimed = (await t.mutation(internal.lifecycle.claimDeletion, {
      id,
    }))!;
    while (
      !(await t.mutation(internal.lifecycle.purgeBatch, {
        athleteId: aid,
        jobId: id,
        lease: claimed.job.lease,
      }))
    ) {}
    expect(await t.run((ctx) => ctx.db.get(aid))).toBeNull();
    expect(await t.run((ctx) => ctx.db.get(bid))).not.toBeNull();
    expect(
      (await b.query(api.workspace.overview)).gear.map((g) => g._id),
    ).toContain(gear);
  });
  it("recovers an interrupted import once and ignores stale watchdog attempts", async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules),
      a = t.withIdentity({ subject: "import" });
    await a.mutation(api.athletes.ensure);
    const id = await a.mutation(api.imports.reserve, {
      name: "run.fit",
      bytes: 100,
      nonce: "12345678-1234-1234-1234-123456789abc",
    });
    await a.mutation(api.imports.enqueue, { id });
    await t.mutation(internal.imports.claim, { id });
    await t.mutation(internal.imports.watchdog, { id, attempt: 1 });
    expect((await a.query(api.imports.owned, { id })).status).toBe("retrying");
    await t.mutation(internal.imports.claim, { id });
    await t.mutation(internal.imports.watchdog, { id, attempt: 1 });
    expect((await a.query(api.imports.owned, { id })).status).toBe("running");
  });
});
