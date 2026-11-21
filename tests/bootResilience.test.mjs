import { assert, assertMatch } from "jsr:@std/assert";

const indexHtml = await Deno.readTextFile("index.html");
const serviceWorker = await Deno.readTextFile("sw.js");

Deno.test("boot retries a stalled entry module without reloading the page", () => {
  assertMatch(indexHtml, /BOOT_SCRIPT_ATTEMPTS\s*=\s*3/);
  assertMatch(indexHtml, /BOOT_SCRIPT_TIMEOUT_MS\s*=\s*15000/);
  assertMatch(indexHtml, /async function loadMainScript\(version\)/);
  assertMatch(indexHtml, /setTimeout\(\(\) => finish\(false\), timeoutMs\)/);
  assertMatch(indexHtml, /Boot timed out — tap to retry/);
  assert(!indexHtml.includes("location.reload()"), "boot should not force a reload");
});

Deno.test("service worker retries and aborts stalled module requests", () => {
  assertMatch(serviceWorker, /MODULE_FETCH_ATTEMPTS\s*=\s*3/);
  assertMatch(serviceWorker, /MODULE_FETCH_TIMEOUT_MS\s*=\s*8000/);
  assertMatch(serviceWorker, /controller\.abort\(\)/);
  assertMatch(serviceWorker, /fetchModuleWithRetry\(url, req\)/);
});
