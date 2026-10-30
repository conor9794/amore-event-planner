import test from "node:test";
import assert from "node:assert/strict";
import { scryptSync } from "node:crypto";
import login from "../netlify/functions/planner-login.mjs";
import core from "../netlify/functions/_planner-auth.js";
import credentials from "../netlify/functions/_planner-credentials.js";

const email="conor9794@gmail.com", password="test-password-very-long-2026";
const salt="00112233445566778899aabbccddeeff";
const hash=scryptSync(password,Buffer.from(salt,"hex"),32,{N:16384,r:8,p:1}).toString("hex");
process.env.PLANNER_SESSION_SECRET="very-long-dedicated-planner-test-signing-secret-2026-not-prod";
process.env.PLANNER_AUTH_USERS=JSON.stringify(Object.fromEntries(
 ["conor9794@gmail.com","melinda@amorestaffing.com","tommaguire2323@gmail.com"].map(k=>[k,{salt,hash}])
));
let saved=null;
credentials.__setProviderForTests(()=>({ get:async()=>saved }));
function post(email,password,origin="https://planner.example") {
 return new Request("https://planner.example/.netlify/functions/planner-login", {
  method:"POST", headers:{"Content-Type":"application/json","Origin":origin},
  body:JSON.stringify({email,password})
 });
}
test("modern login accepts bootstrap user and issues Secure HttpOnly session cookie",async()=>{
 const response=await login(post(email,password));
 assert.equal(response.status,200);
 assert.match(response.headers.get("set-cookie"),/Secure; HttpOnly; SameSite=Strict/);
});
test("modern login does not permit unknown users, incorrect passwords, or cross-origin posting",async()=>{
 assert.equal((await login(post("unknown@example.com",password))).status,401);
 assert.equal((await login(post(email,"wrong"))).status,401);
 assert.equal((await login(post(email,password,"https://evil.example"))).status,403);
});
test("modern login revokes bootstrap credentials when private stored password exists",async()=>{
 const newPassword="very private new operator password";
 const newSalt="0123456789abcdeffedcba9876543210";
 const newHash=scryptSync(newPassword,Buffer.from(newSalt,"hex"),32,{N:16384,r:8,p:1}).toString("hex");
 saved={salt:newSalt,hash:newHash};
 try {
  assert.equal((await login(post(email,password))).status,401);
  assert.equal((await login(post(email,newPassword))).status,200);
 } finally {saved=null;}
});
