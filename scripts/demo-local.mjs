// One command for the full local demo: Midnight node, indexer and proof servers
// (Docker), the Demo Controller, and the web console. Busy ports are skipped so
// the demo can run next to other local Midnight projects. Ctrl+C stops everything
// this script started, including only this project's containers.
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import net from "node:net";

const root = new URL("..", import.meta.url).pathname;
const useOpenAI = process.argv.includes("--openai");
const children = [];
let stopping = false;

const log = (message) => console.log(`[demo] ${message}`);
const fail = (message) => {
  console.error(`\n[demo] ${message}\n`);
  return shutdown(1);
};

const portIsFree = (port, host) =>
  new Promise((resolve) => {
    const server = net.createServer();
    // Only EADDRINUSE means taken; hosts without IPv6 report other errors for ::1.
    server.once("error", (error) => resolve(error.code !== "EADDRINUSE"));
    server.once("listening", () => server.close(() => resolve(true)));
    server.listen(port, host);
  });
const freePort = async (preferred, taken) => {
  for (let port = preferred; port < preferred + 50; port += 1) {
    if (taken.has(port)) continue;
    if ((await portIsFree(port, "127.0.0.1")) && (await portIsFree(port, "::1"))) {
      taken.add(port);
      return port;
    }
  }
  throw new Error(`no free port near ${preferred}`);
};

const compose = (args, env) =>
  spawnSync("docker", ["compose", "-f", "infra/midnight-local.yml", ...args], {
    cwd: root,
    env: { ...process.env, ...env },
    stdio: "inherit",
  });

const start = (name, command, args, env, onLine) => {
  const child = spawn(command, args, {
    cwd: root,
    env: { ...process.env, ...env },
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.push({ name, child });
  for (const stream of [child.stdout, child.stderr]) {
    let buffer = "";
    stream.on("data", (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop();
      for (const line of lines) {
        if (line.includes("subscribeRuntimeVersion")) continue;
        console.log(`[${name}] ${line}`);
        onLine?.(line);
      }
    });
  }
  child.on("exit", (code) => {
    if (!stopping) void fail(`${name} 프로세스가 종료됐습니다 (코드 ${code}). 위 로그를 확인하세요.`);
  });
  return child;
};

let composeEnv;
async function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  log("종료합니다.");
  for (const { child } of children.reverse()) {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {}
  }
  if (composeEnv !== undefined) compose(["down"], composeEnv);
  process.exit(code);
}
process.on("SIGINT", () => void shutdown(0));
process.on("SIGTERM", () => void shutdown(0));

const waitFor = (predicate, timeoutMs, what) =>
  new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const tick = async () => {
      if (await predicate()) return resolve();
      if (Date.now() > deadline) return reject(new Error(`${what} 준비 시간이 초과됐습니다.`));
      setTimeout(tick, 500);
    };
    void tick();
  });

try {
  if (!existsSync(`${root}packages/demo-controller/dist/server.js`) || !existsSync(`${root}packages/negotiation-contract/src/managed/negotiation`)) {
    await fail("먼저 `npm run bootstrap`을 실행하세요.");
  }
  if (!existsSync(`${root}apps/demo-web/node_modules`)) {
    await fail("먼저 `npm --prefix apps/demo-web ci`를 실행하세요.");
  }
  if (spawnSync("docker", ["info"], { stdio: "ignore" }).status !== 0) {
    await fail("Docker가 실행 중이 아닙니다. Docker Desktop을 켠 뒤 다시 실행하세요.");
  }
  if (useOpenAI && !process.env.OPENAI_API_KEY && !process.env.MEMO_OPENAI_API_KEY) {
    await fail("--openai에는 OPENAI_API_KEY 환경 변수가 필요합니다. API 키 없이 보려면 옵션 없이 실행하세요.");
  }

  const taken = new Set();
  const ports = {
    node: await freePort(9944, taken),
    indexer: await freePort(8088, taken),
    buyerProof: await freePort(6301, taken),
    sellerProof: await freePort(6302, taken),
    controller: await freePort(8787, taken),
    web: await freePort(3001, taken),
  };
  log(`포트: node ${ports.node}, indexer ${ports.indexer}, proof ${ports.buyerProof}/${ports.sellerProof}, controller ${ports.controller}, web ${ports.web}`);

  composeEnv = {
    MIDNIGHT_NODE_HOST_PORT: String(ports.node),
    MIDNIGHT_INDEXER_HOST_PORT: String(ports.indexer),
    MIDNIGHT_BUYER_PROOF_HOST_PORT: String(ports.buyerProof),
    MIDNIGHT_SELLER_PROOF_HOST_PORT: String(ports.sellerProof),
  };
  // The web console only shows "연결 대기" until the Controller is up, so it starts
  // first: its first Vite dependency optimisation stalled when it competed with the
  // chain and wallet start-up.
  start("web", "npm", ["--prefix", "apps/demo-web", "run", "dev", "--", "--port", String(ports.web)], {
    NEXT_PUBLIC_DEMO_WS_URL: `ws://127.0.0.1:${ports.controller}`,
  });
  const webReady = waitFor(async () => {
    for (const host of ["127.0.0.1", "[::1]"]) {
      try {
        if ((await fetch(`http://${host}:${ports.web}/`, { signal: AbortSignal.timeout(60_000) })).ok) return true;
      } catch {}
    }
    return false;
  }, 300_000, "웹");
  webReady.catch(() => {});

  log("로컬 Midnight 체인을 시작합니다 (처음에는 이미지 다운로드로 몇 분 걸릴 수 있습니다).");
  if (compose(["up", "-d", "--wait"], composeEnv).status !== 0) {
    await fail("로컬 체인을 시작하지 못했습니다. 위 Docker 로그를 확인하세요.");
  }

  let controllerReady = false;
  start("controller", "npm", ["run", useOpenAI ? "demo:midnight" : "demo:midnight:mock"], {
    MIDNIGHT_NODE: `http://127.0.0.1:${ports.node}`,
    MIDNIGHT_INDEXER: `http://127.0.0.1:${ports.indexer}/api/v3/graphql`,
    MIDNIGHT_INDEXER_WS: `ws://127.0.0.1:${ports.indexer}/api/v3/graphql/ws`,
    MIDNIGHT_BUYER_PROOF: `http://127.0.0.1:${ports.buyerProof}`,
    MIDNIGHT_SELLER_PROOF: `http://127.0.0.1:${ports.sellerProof}`,
    DEMO_WS_PORT: String(ports.controller),
    NEGOTIATION_REFERENCE_PRICE_KRW: process.env.NEGOTIATION_REFERENCE_PRICE_KRW ?? "100000000",
  }, (line) => {
    if (line.includes("WebSocket ready")) controllerReady = true;
  });
  await waitFor(() => controllerReady, 180_000, "Controller");

  await webReady;

  console.log(`
[demo] 준비됐습니다. 브라우저에서 여세요:  http://localhost:${ports.web}

  1. Buyer와 Seller에 각각 상품 코드 4821을 입력합니다.
  2. 성사: Buyer 110000000, Seller 95000000
  3. 결렬: 화면 오른쪽 위 '초기화' 뒤 Buyer 90000000, Seller 95000000
  - 협상 후보는 ${useOpenAI ? "OpenAI" : "API 키가 필요 없는 mock 생성기"}로 만듭니다.
  - 첫 시연은 지갑 자금 준비·DUST 등록·증명 생성 때문에 결과까지 약 7분, 이후 시연은 2~4분 걸립니다.
  - 끝내려면 Ctrl+C. 이 데모가 띄운 컨테이너만 내립니다.
`);
} catch (error) {
  await fail(error instanceof Error ? error.message : String(error));
}
