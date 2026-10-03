import assert from "node:assert/strict";
import { spawn } from "node:child_process";

async function verify(port, overrides, status, body) {
  const child = spawn(process.execPath, ["dist/index.js"], {
    cwd: new URL("../", import.meta.url),
    env: { ...process.env, PORT: String(port), ...overrides },
    stdio: ["ignore", "pipe", "pipe"], windowsHide: true,
  });
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Backend startup timed out")), 15000);
      child.stdout.on("data", chunk => {
        if (chunk.toString().includes("API listening")) { clearTimeout(timer); resolve(); }
      });
      child.once("exit", () => { clearTimeout(timer); reject(new Error("Backend exited before listening")); });
    });
    const response = await fetch(`http://localhost:${port}/api/v1/health`);
    assert.equal(response.status, status);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(await response.json(), body);
    console.log(JSON.stringify({port,status,noStore:true,exactResponse:true}));
  } finally {
    if (child.exitCode === null) {
      await new Promise(resolve => { child.once("exit", resolve); child.kill(); });
    }
  }
}
await verify(Number(process.env.HEALTH_SUCCESS_PORT || 4000), {}, 200, {data:{api:"running",database:"reachable"}});
await verify(Number(process.env.HEALTH_FAILURE_PORT || 4001), { DATABASE_URL: "postgresql://unavailable:unavailable@127.0.0.1:55405/postgres" }, 503,
  {error:{code:"DATABASE_UNAVAILABLE",message:"Database is unavailable. Please try again later.",details:[]}});
