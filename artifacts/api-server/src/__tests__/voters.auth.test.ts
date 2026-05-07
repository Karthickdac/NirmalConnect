// Integration test: confirm voter-roll endpoints are not reachable
// without an authenticated staff session. Run with:
//   pnpm --filter @workspace/api-server exec tsx --test src/__tests__/voters.auth.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import app from "../app.js";

const PROTECTED_GETS = [
  "/api/admin/voters/imports",
  "/api/admin/voters/imports/1",
  "/api/admin/voters/coverage",
  "/api/admin/voters/stats",
];

const PROTECTED_WRITES: Array<["post" | "delete", string]> = [
  ["post", "/api/admin/voters/import"],
  ["post", "/api/admin/voters/imports/1/commit"],
  ["delete", "/api/admin/voters/imports/1"],
];

test("voter routes reject unauthenticated GETs (no PII leaks)", async () => {
  for (const path of PROTECTED_GETS) {
    const res = await request(app).get(path);
    assert.equal(res.status, 401, `${path} expected 401 got ${res.status}`);
    assert.ok(
      !JSON.stringify(res.body).match(/epic|voter_imports|fullName/i),
      `${path} response leaked voter fields: ${JSON.stringify(res.body)}`,
    );
  }
});

test("voter routes reject unauthenticated writes", async () => {
  for (const [method, path] of PROTECTED_WRITES) {
    const res = await request(app)[method](path);
    assert.equal(res.status, 401, `${method.toUpperCase()} ${path} expected 401 got ${res.status}`);
  }
});

test("non-staff session cookie is also rejected (no role bypass)", async () => {
  // Forge a junk cookie — should still 401, not 403, because our
  // requireStaff middleware verifies the JWT signature first.
  const res = await request(app)
    .get("/api/admin/voters/imports")
    .set("Cookie", "session=not-a-real-jwt");
  assert.equal(res.status, 401);
});
