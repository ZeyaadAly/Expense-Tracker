// Browser verification of T07 fixtures only. No backend process or API is used.
// Run against `npm run dev` with a locally installed agent-browser executable:
// node scripts/verify-t07.mjs PATH_TO_AGENT_BROWSER [http://127.0.0.1:3000]
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const executable = process.argv[2];
if (!executable) throw new Error("Provide the path to an installed agent-browser executable.");
const baseUrl = process.argv[3] ?? "http://127.0.0.1:3000";
if (!["127.0.0.1", "localhost"].includes(new URL(baseUrl).hostname)) throw new Error("Verification is restricted to a local frontend.");
const artifactDirectory = resolve("../.tmp-t07");
mkdirSync(artifactDirectory, { recursive: true });
const results = [];
const session = "expense-t07";

function browser(...args) {
  const input = args.at(-1)?.startsWith("INPUT:") ? args.pop().slice(6) : undefined;
  const response = spawnSync(executable, ["--session", session, "--json", ...args], { encoding: "utf8", input, timeout: 30000 });
  if (response.error) throw response.error;
  if (response.status !== 0) throw new Error(`${args[0]} failed: ${response.stderr || response.stdout}`);
  const output = JSON.parse(response.stdout);
  if (!output.success) throw new Error(JSON.stringify(output.error));
  return output.data;
}
function evaluate(code) { return browser("eval", "--stdin", `INPUT:${code}`).result; }
function check(name, code) {
  const result = evaluate(code);
  if (result !== true) throw new Error(`${name}: ${JSON.stringify(result)}`);
  results.push({ name, passed: true });
  console.log(`PASS ${name}`);
}
function capture(name) { browser("screenshot", resolve(artifactDirectory, `${name}.png`), "--full"); }
function open(scene = "") { browser("open", `${baseUrl}/${scene ? `?preview=${scene}` : ""}`); }

browser("set", "media", "light", "reduced-motion");
for (const width of [360, 768, 1440]) {
  browser("set", "viewport", String(width), "900");
  open();
  check(`${width}px page and summary`, `document.documentElement.scrollWidth === innerWidth && document.querySelectorAll('[aria-labelledby="summary-heading"] h3').length === 3 && getComputedStyle(document.body).fontFamily === 'Arial, Helvetica, sans-serif'`);
  check(`${width}px table/cards`, `getComputedStyle(document.querySelector('.transaction-table').parentElement).display ${width < 768 ? "===" : "!=="} 'none'`);
  check(`${width}px all actions visible`, `Array.from(document.querySelectorAll('button')).filter(b => /^(Edit|Delete) /.test(b.getAttribute('aria-label') || '') && b.getClientRects().length).length === 4`);
  capture(`dashboard-${width}`);
  const audit = browser("a11y");
  if (audit.counts.violations) throw new Error(`Dashboard accessibility: ${JSON.stringify(audit.violations)}`);
  results.push({ name: `${width}px dashboard accessibility`, passed: true, violations: 0 });
  browser("click", "header button");
  check(`${width}px dialog fits`, `(() => { const d = document.querySelector('dialog'); const r = d.getBoundingClientRect(); return r.width <= innerWidth && r.height <= innerHeight && d.scrollWidth <= d.clientWidth && ${width < 768 ? "r.width === innerWidth && r.height === innerHeight" : "r.width === 560"}; })()`);
  check(`${width}px initial radio focus`, `document.activeElement.name === 'type' && document.activeElement.checked`);
  browser("click", "dialog button[type=submit]");
  check(`${width}px validation preserves form`, `document.activeElement.name === 'amount' && document.querySelectorAll('dialog [aria-invalid="true"]').length >= 3 && document.querySelector('dialog [name=amount]').value === ''`);
  const dialogAudit = browser("a11y");
  if (dialogAudit.counts.violations) throw new Error(`Dialog accessibility: ${JSON.stringify(dialogAudit.violations)}`);
  results.push({ name: `${width}px validation accessibility`, passed: true, violations: 0 });
  capture(`validation-${width}`);
  browser("focus", "dialog form > div:last-child button:last-child");
  browser("press", "Tab");
  check(`${width}px focus wraps inside dialog`, `document.activeElement === document.querySelector('dialog button')`);
  browser("press", "Escape");
  check(`${width}px escape and focus return`, `!document.querySelector('dialog') && document.activeElement === document.querySelector('header button')`);
  open("stress");
  check(`${width}px long content wraps`, `document.documentElement.scrollWidth === innerWidth && document.body.innerText.includes('X'.repeat(200)) && document.body.innerText.includes('<script>') && !document.querySelector('[data-nextjs-dialog]')`);
  capture(`stress-${width}`);
}

browser("set", "viewport", "360", "800");
open();
browser("select", "#filter-type", "expense");
browser("select", "#filter-category", "bills");
check("No matches and unchanged overall summary", `document.body.innerText.includes('No transactions match these filters') && document.body.innerText.includes('749.50')`);
browser("select", "#filter-type", "income");
check("Incompatible filter category resets", `document.querySelector('#filter-category').value === 'all' && !Array.from(document.querySelector('#filter-category').options).some(o => o.value === 'food')`);
browser("select", "#filter-category", "other");
browser("select", "#filter-type", "expense");
check("Other survives type change", `document.querySelector('#filter-category').value === 'other'`);
browser("click", ".md\\:items-end button");
browser("click", "header button");
browser("fill", "dialog [name=amount]", "0.10");
browser("select", "dialog [name=category]", "other");
browser("fill", "dialog [name=description]", "  Local preview entry  ");
evaluate(`(() => { const input = document.querySelector('dialog [name=date]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '2026-09-30'); input.dispatchEvent(new Event('input', {bubbles:true})); input.dispatchEvent(new Event('change', {bubbles:true})); })()`);
check("Date-only input retains supplied calendar date", `document.querySelector('dialog [name=date]').value === '2026-09-30'`);
browser("click", "dialog button[type=submit]");
browser("wait", "500");
check("Local add and exact minor-unit totals", `!document.querySelector('dialog') && document.body.innerText.includes('Local preview entry') && document.body.innerText.includes('749.40') && document.body.innerText.includes('250.60')`);
browser("click", "ul button[aria-label='Edit Local preview entry']");
check("Edit prefilled with shared form", `document.querySelector('dialog h2').textContent === 'Edit transaction' && document.querySelector('dialog [name=amount]').value === '0.10' && document.querySelector('dialog button[type=submit]').textContent === 'Save changes'`);
browser("select", "dialog [name=category]", "food");
browser("click", "dialog [name=type][value=income]");
check("Edit clears invalid category", `document.querySelector('dialog [name=category]').value === ''`);
browser("select", "dialog [name=category]", "other");
browser("fill", "dialog [name=amount]", "0.20");
browser("click", "dialog button[type=submit]");
browser("wait", "500");
check("Local edit changes same row and totals", `document.body.innerText.includes('749.70') && document.body.innerText.includes('1,000.20') && document.querySelectorAll('ul[aria-label=Transactions] > li').length === 3`);
browser("click", "ul button[aria-label='Delete Local preview entry']");
check("Delete context and safe initial focus", `document.querySelector('dialog').textContent.includes('Local preview entry') && document.querySelector('dialog').textContent.includes('30/09/2026') && document.activeElement.textContent === 'Cancel'`);
capture("delete-mobile");
browser("click", "dialog [data-cancel]");
check("Cancel preserves row", `document.querySelectorAll('ul[aria-label=Transactions] > li').length === 3`);
browser("click", "ul button[aria-label='Delete Local preview entry']");
browser("click", "dialog > div:last-child button:last-child");
browser("wait", "500");
check("Local delete updates totals and focus fallback", `document.querySelectorAll('ul[aria-label=Transactions] > li').length === 2 && document.body.innerText.includes('749.50') && document.activeElement.id === 'transactions-heading'`);
browser("reload");
check("Fixtures reset on reload", `document.querySelectorAll('ul[aria-label=Transactions] > li').length === 2 && document.body.innerText.includes('749.50')`);

const scenes = {
  loading: "Loading transactions…", empty: "No transactions yet", "no-results": "No transactions match these filters",
  error: "Transactions could not load", "summary-error": "Summary unavailable", "list-error": "Transactions could not load",
  success: "Transaction added.", stale: "Previously loaded totals; could not refresh.", negative: "−150.50",
  submitting: "Saving…", validation: "Check the highlighted fields.", "save-error": "Your entries are kept",
  uncertain: "Refresh and check your transactions", "edit-missing": "This transaction is no longer available",
  "delete-pending": "Deleting…", "delete-error": "could not be deleted",
};
for (const [scene, expected] of Object.entries(scenes)) {
  open(scene);
  check(`Fixture scene ${scene}`, `document.body.innerText.includes(${JSON.stringify(expected)}) && document.documentElement.scrollWidth === innerWidth`);
  if (["submitting", "delete-pending"].includes(scene)) {
    check(`${scene} duplicate writes disabled`, `Array.from(document.querySelectorAll('dialog button,dialog input,dialog select,dialog textarea')).every(e => e.matches(':disabled'))`);
    browser("press", "Escape");
    check(`${scene} escape blocked`, `!!document.querySelector('dialog[open]')`);
  }
  if (scene === "error") {
    check("Error never fabricates zero totals", `!document.body.innerText.includes('0.00')`);
    browser("click", "section button:last-child");
    check("Read retry returns fixture content", `!document.body.innerText.includes('Transactions could not load') && document.body.innerText.includes('Grocery shopping')`);
  }
  capture(`state-${scene}`);
}
open();
browser("press", "Tab");
browser("focus", "header button");
check("Visible focus ring", `getComputedStyle(document.activeElement).outlineWidth === '2px' && getComputedStyle(document.activeElement).outlineColor === 'rgb(37, 99, 235)'`);
check("No backend or Supabase resources", `!performance.getEntriesByType('resource').some(r => r.name.includes(':4000') || r.name.includes('supabase') || r.name.includes('/api/v1'))`);
const errors = browser("errors");
if (errors.errors?.length) throw new Error(JSON.stringify(errors));
writeFileSync(resolve(artifactDirectory, "verification.json"), JSON.stringify({ baseUrl, results, browserErrors: errors }, null, 2));
console.log(`Verified ${results.length} checks. Evidence: ${artifactDirectory}`);
