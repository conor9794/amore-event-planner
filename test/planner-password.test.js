"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const email = "conor9794@gmail.com";
const temporary = "long-bootstrap-secret-for-unit-test";
const salt = "00112233445566778899aabbccddeeff";
const hash = crypto.scryptSync(temporary, Buffer.from(salt,"hex"),32,{N:16384,r:8,p:1}).toString("hex");
process.env.PLANNER_SESSION_SECRET = "safe-testing-signing-secret-at-least-48-characters-long";
process.env.PLANNER_AUTH_USERS = JSON.stringify(Object.fromEntries(
  [email,"melinda@amorestaffing.com","tommaguire2323@gmail.com"].map(e=>[e,{salt,hash}])
));
const storeData = new Map(), resetData = new Map();
let sequence = 0;
function mockStore(map) {
  return {
    get: async k => map.has(k) ? structuredClone(map.get(k).data) : null,
    getWithMetadata: async k => map.has(k) ? { data: structuredClone(map.get(k).data), etag: map.get(k).etag } : null,
    setJSON: async (k,v,options={}) => {
      if (options.onlyIfMatch && map.get(k)?.etag !== options.onlyIfMatch) return {modified:false};
      map.set(k,{data:structuredClone(v),etag:"v"+(++sequence)});
      return {modified:true};
    },
    delete: async k => { map.delete(k); }
  };
}
require("../netlify/functions/_planner-credentials").__setProviderForTests(()=>mockStore(storeData));
const auth=require("../netlify/functions/_planner-auth");
const password=require("../netlify/functions/planner-password");
const handler = password.__test.createHandler(() => {});
password.__test.__setResetStoreProvider(()=>mockStore(resetData));
function call(data,cookie="") { return {
  httpMethod:"POST",headers:{host:"deploy-preview-12--amore-event-planner.netlify.app", ...(cookie?{cookie}:{}), origin:"https://deploy-preview-12--amore-event-planner.netlify.app"},
  body:JSON.stringify(data)
}; }
const output=r=>JSON.parse(r.body);
test("only authenticated operator with current password can change password, and temporary password stops working", async()=>{
  const session="amore_planner_session="+auth.issue(email);
  assert.equal((await handler(call({action:"change",currentPassword:"wrong",newPassword:"A new very strong passphrase 2026"},session))).statusCode,401);
  assert.equal((await handler(call({action:"change",currentPassword:temporary,newPassword:"short"},session))).statusCode,400);
  assert.equal((await handler(call({action:"change",currentPassword:temporary,newPassword:"A new very strong passphrase 2026"}))).statusCode,401);
  const good=await handler(call({action:"change",currentPassword:temporary,newPassword:"A new very strong passphrase 2026"},session));
  assert.equal(good.statusCode,200);
  assert.match(good.headers["Set-Cookie"],/Max-Age=0/);
  assert.equal(await auth.authenticate(email,temporary),null);
  assert.equal(await auth.authenticate(email,"A new very strong passphrase 2026"),email);
});
test("email reset is unavailable without a configured delivery provider",async()=>{
  const saved=process.env.RESEND_API_KEY;
  delete process.env.RESEND_API_KEY;
  const response=await handler(call({action:"request",email}));
  assert.equal(response.statusCode,503);
  process.env.RESEND_API_KEY=saved;
});
test("only one-use emailed tokens can reset passwords",async()=>{
  process.env.RESEND_API_KEY="test-only-not-a-real-key";
  process.env.PLANNER_RESET_FROM_EMAIL="support@example.com";
  const originalFetch=global.fetch;
  let sent=null;
  global.fetch=async(url,params)=>{
    assert.equal(url,"https://api.resend.com/emails");
    sent=JSON.parse(params.body);
    return {ok:true,json:async()=>({id:"example"})};
  };
  try{
    const unknown=await handler(call({action:"request",email:"unapproved@example.com"}));
    assert.equal(unknown.statusCode,200);
    assert.equal(sent,null);
    const requested=await handler(call({action:"request",email}));
    assert.equal(requested.statusCode,200);
    assert.equal(sent.to[0],email);
    const resetLink=sent.text.match(/https:\/\/\S+/)[0];
    const url=new URL(resetLink), token=url.searchParams.get("token");
    assert.equal(token.length,64);
    const outcome=await handler(call({action:"reset",email,token,newPassword:"My third secure passphrase 2026"}));
    assert.equal(outcome.statusCode,200);
    assert.equal(await auth.authenticate(email,"My third secure passphrase 2026"),email);
    assert.equal((await handler(call({action:"reset",email,token,newPassword:"Another secure passphrase 2026"}))).statusCode,401);
  }finally{global.fetch=originalFetch;}
});
test("rejects cross-origin password submissions",async()=>{
  const req=call({action:"request",email});
  req.headers.origin="https://attacker.example";
  assert.equal((await handler(req)).statusCode,403);
});
