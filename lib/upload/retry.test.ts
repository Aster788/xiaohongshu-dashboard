import assert from "node:assert/strict";
import test from "node:test";

test("retry helpers retry transient failures until the operation succeeds", async () => {
  const mod = await import("./retry").catch(() => null);

  assert.ok(mod, "retry helpers should exist");
  if (!mod) return;

  const { retryAsync, isTransientUploadError } = mod;
  let attempts = 0;

  const value = await retryAsync(
    async () => {
      attempts += 1;
      if (attempts < 3) {
        const error = new Error("ECONNRESET while fetching blob");
        throw error;
      }
      return "ok";
    },
    {
      retries: 2,
      shouldRetry: isTransientUploadError,
    },
  );

  assert.equal(value, "ok");
  assert.equal(attempts, 3);
});

test("retry helpers stop immediately for non-transient failures", async () => {
  const mod = await import("./retry").catch(() => null);

  assert.ok(mod, "retry helpers should exist");
  if (!mod) return;

  const { retryAsync, isTransientUploadError } = mod;
  let attempts = 0;

  await assert.rejects(
    () =>
      retryAsync(
        async () => {
          attempts += 1;
          throw new Error("Sheet missing required columns");
        },
        {
          retries: 2,
          shouldRetry: isTransientUploadError,
        },
      ),
    /Sheet missing required columns/,
  );

  assert.equal(attempts, 1);
});
