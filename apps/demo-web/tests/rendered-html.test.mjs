import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const projectRoot = new URL("../", import.meta.url);

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the private negotiation console", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Midnight 비공개 협상 데모<\/title>/i);
  assert.match(html, /MIDNIGHT/);
  assert.match(html, /비공개 협상 데모/);
  assert.match(html, /BUYER/);
  assert.match(html, /SELLER/);
  assert.match(html, /OBSERVER/);
  assert.doesNotMatch(html, /상품 코드를 입력해 주세요/);
  assert.doesNotMatch(html, /\[SYSTEM\]|\[BUYER\]|\[SELLER\]/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/i);
  assert.doesNotMatch(html, /Powered by|Privacy reimagined|LIVE/);
});

test("connects the DApp event stream without browser-generated mock logs", async () => {
  const [types, dappSource, globalCss, packageJson] = await Promise.all([
    readFile(new URL("../app/demo-types.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/NegotiationDapp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(types, /type ServerMessage/);
  assert.match(dappSource, /new WebSocket/);
  assert.match(dappSource, /messageFor/);
  assert.match(dappSource, /semanticTokens/);
  assert.match(dappSource, /observerStatusLabel/);
  assert.match(
    dappSource,
    /const spinningMessages[\s\S]*"NEGOTIATION_START"[\s\S]*"NEGOTIATING"/,
  );
  assert.match(dappSource, /`\$\{event\.panel\}:\$\{event\.eventId\}`/);
  assert.match(dappSource, /latestEventByReplaceKey/);
  assert.doesNotMatch(dappSource, /current\.slice\(0, index\)/);
  assert.match(globalCss, /\.token-danger[\s\S]*var\(--danger\)/);
  assert.doesNotMatch(dappSource, /createDeal을 실행했습니다/);
  assert.doesNotMatch(dappSource, /joinDeal을 실행했습니다/);
  assert.match(dappSource, /LockKeyhole/);
  assert.match(dappSource, /role="buyer"/);
  assert.match(dappSource, /role="seller"/);
  assert.match(dappSource, /\/brand\/midnight-horizontal-white\.svg/);
  assert.match(globalCss, /\/fonts\/outfit-variable\.ttf/);
  assert.match(globalCss, /font-family: var\(--brand-font\)/);
  assert.doesNotMatch(dappSource, /\\[SYSTEM\\]/);
  assert.doesNotMatch(dappSource, /startMockNegotiation/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);

  await assert.rejects(access(new URL("../app/mock-demo.ts", import.meta.url)));
  await assert.rejects(
    access(
      new URL(
        "../app/_sites-preview/SkeletonPreview.tsx",
        import.meta.url,
      ),
    ),
  );
  await access(
    new URL("../public/brand/midnight-horizontal-white.svg", import.meta.url),
  );
  await access(new URL("../public/fonts/outfit-variable.ttf", import.meta.url));
  await access(new URL("../public/fonts/Outfit-OFL.txt", import.meta.url));
  await access(new URL("../.openai/hosting.json", import.meta.url));
  await access(projectRoot);
});

test("gives Safari semantic numeric input purposes instead of ambiguous autofill", async () => {
  const dappSource = await readFile(
    new URL("../app/NegotiationDapp.tsx", import.meta.url),
    "utf8",
  );

  assert.match(
    dappSource,
    /autoComplete=\{isCode \? "one-time-code" : "transaction-amount"\}/,
  );
  assert.doesNotMatch(dappSource, /autoComplete="off"/);
});

test("distinguishes only the Buyer and Seller headings with restrained role colors", async () => {
  const response = await render();
  const html = await response.text();
  const globalCss = await readFile(
    new URL("../app/globals.css", import.meta.url),
    "utf8",
  );

  assert.match(html, /terminal-panel panel-buyer/);
  assert.match(html, /terminal-panel panel-seller/);
  assert.match(html, /terminal-panel panel-observer/);
  assert.match(globalCss, /--buyer-role:\s*#a9c2e6/);
  assert.match(globalCss, /--seller-role:\s*#d6b879/);
  assert.match(
    globalCss,
    /\.panel-buyer \.panel-header h2\s*\{[^}]*color:\s*var\(--buyer-role\)/s,
  );
  assert.match(
    globalCss,
    /\.panel-seller \.panel-header h2\s*\{[^}]*color:\s*var\(--seller-role\)/s,
  );
});
