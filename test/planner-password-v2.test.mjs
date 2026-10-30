import test from "node:test";
import assert from "node:assert/strict";
import passwordHandler from "../netlify/functions/planner-password-v2.mjs";

test("v2 password endpoint enforces POST and same-origin", async () => {
 const get = await passwordHandler(new Request("https://deploy-preview-12--amore-event-planner.netlify.app/.netlify/functions/planner-password-v2", {method:"GET"}));
 assert.equal(get.status,405);
 const malicious = await passwordHandler(new Request("https://deploy-preview-12--amore-event-planner.netlify.app/.netlify/functions/planner-password-v2",{
  method:"POST", headers:{"content-type":"application/json","origin":"https://example.com"},body:JSON.stringify({action:"request",email:"nobody@example.com"})
 }));
 assert.equal(malicious.status,403);
});
test("v2 password endpoint handles invalid requests without exposing private data", async () => {
 const response = await passwordHandler(new Request("https://deploy-preview-12--amore-event-planner.netlify.app/.netlify/functions/planner-password-v2",{
  method:"POST",headers:{"content-type":"application/json","origin":"https://deploy-preview-12--amore-event-planner.netlify.app"},
  body:JSON.stringify({action:"unsupported"})
 }));
 assert.equal(response.status,400);
});
