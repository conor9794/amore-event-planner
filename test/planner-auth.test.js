const test = require("node:test");
const assert = require("node:assert/strict");
const { scryptSync } = require("node:crypto");
const email = "conor9794@gmail.com", password = "test-password-very-long-2026", salt = "00112233445566778899aabbccddeeff";
const hash = scryptSync(password, Buffer.from(salt, "hex"), 32, { N:16384, r:8, p:1 }).toString("hex");
const data = Object.fromEntries(["conor9794@gmail.com","melinda@amorestaffing.com","tommaguire2323@gmail.com"].map(key => [key,{salt,hash}]));
process.env.PLANNER_AUTH_USERS = JSON.stringify(data);
process.env.PLANNER_SESSION_SECRET = "very-long-dedicated-planner-test-signing-secret-2026-not-prod";
require("../netlify/functions/_planner-credentials").__setProviderForTests(() => ({ get: async () => null }));
const core = require("../netlify/functions/_planner-auth");
const { handler } = require("../netlify/functions/planner-auth");
test("only three allowlisted operators can sign in, never a fourth", async () => {
  assert.equal(await core.authenticate(email,password),email);
  assert.equal(await core.authenticate("unknown@example.com",password),null);
  assert.equal(await core.authenticate(email,"wrong"),null);
});
test("session is signed, expires and rejects tampering", () => {
  const token = core.issue(email);
  assert.equal(core.verify({cookie:"amore_planner_session="+token}).email,email);
  assert.equal(core.verify({cookie:"amore_planner_session="+token+"corrupted"}),null);
  const before=Date.now;
  try {Date.now=()=>before()+9*60*60*1000;assert.equal(core.verify({cookie:"amore_planner_session="+token}),null);}
  finally { Date.now=before; }
});
test("sign-in sets secure HttpOnly, Strict cookie and rejects bad credentials",async () => {
  const good = await handler({httpMethod:"POST",body:JSON.stringify({email,password})});
  assert.equal(good.statusCode,200);
  assert.match(good.headers["Set-Cookie"],/HttpOnly; SameSite=Strict/);
  const bad = await handler({httpMethod:"POST",body:JSON.stringify({email,password:"wrong"})});
  assert.equal(bad.statusCode,401);
  assert.equal((await handler({httpMethod:"DELETE"})).statusCode,200);
});
test("login refuses to work without secrets", () => {
  const original=process.env.PLANNER_SESSION_SECRET;
  try {delete process.env.PLANNER_SESSION_SECRET;assert.equal(core.configured(),false);}
  finally {process.env.PLANNER_SESSION_SECRET=original;}
});
