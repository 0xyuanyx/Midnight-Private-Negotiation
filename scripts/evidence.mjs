// Checks and recovers each party's settlement evidence after the demo app has
// exited. It reads keys only from the configured key store and the public
// contract state only from the Indexer; it never writes to the chain.
//
//   npm run evidence -- verify    decrypt every evidence file and check it on chain
//   npm run evidence -- status    show the key store, evidence files and open sessions
//   npm run evidence -- recover   finish sessions a crash left open
import { existsSync, readFileSync } from "node:fs";
import { basename } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const evidence = await import(`${root}packages/evidence/dist/index.js`);
const adapter = await import(`${root}packages/midnight-adapter/dist/index.js`);

const chainConfig = () => {
  if (process.env.MIDNIGHT_INDEXER && process.env.MIDNIGHT_INDEXER_WS) {
    return { indexer: process.env.MIDNIGHT_INDEXER, indexerWS: process.env.MIDNIGHT_INDEXER_WS };
  }
  const file = `${root}.demo-chain.json`;
  const port = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")).indexer : 8088;
  return {
    indexer: `http://127.0.0.1:${port}/api/v3/graphql`,
    indexerWS: `ws://127.0.0.1:${port}/api/v3/graphql/ws`,
  };
};

const reasons = {
  WRONG_NETWORK: "다른 네트워크의 증빙입니다.",
  WRONG_CONTRACT_VERSION: "다른 계약 버전의 증빙입니다.",
  EVIDENCE_INCONSISTENT: "증빙 안의 가격·난수가 가격 커밋과 맞지 않습니다.",
  NOT_INDEXED: "Indexer에서 계약을 찾지 못했습니다. 같은 로컬 체인이 실행 중인지 확인하세요.",
  DEAL_MISMATCH: "온체인 거래 ID가 증빙과 다릅니다.",
  NOT_SETTLED: "온체인 상태가 SETTLED가 아닙니다.",
  COMMITMENT_MISMATCH: "온체인 가격 커밋이 증빙과 다릅니다.",
};

const formatKrw = (value) => `${BigInt(value).toLocaleString("ko-KR")} KRW`;

const main = async () => {
  const command = process.argv[2] ?? "verify";
  const dataDir = evidence.resolveDataDir();
  const keyStore = evidence.selectKeyStore({ dataDir });
  console.log(`데이터 위치: ${dataDir}`);
  console.log(`키 보관 방식: ${keyStore.description}`);
  adapter.useUndeployedNetwork();
  const config = chainConfig();

  if (command === "status") {
    const files = await evidence.listEvidenceFiles(dataDir);
    console.log(`\n보관된 합의 증빙 ${files.length}건`);
    for (const file of files) console.log(`  ${basename(file)}`);
    const open = (await evidence.readSessionRecords(dataDir)).filter((record) => record.phase !== "CLEANED");
    console.log(`\n정리되지 않은 세션 ${open.length}건`);
    for (const record of open) {
      console.log(`  ${record.role} ${record.sessionId} ${record.phase} ${record.contractAddress ?? "(계약 없음)"}`);
    }
    return 0;
  }

  if (command === "recover") {
    for (const role of ["buyer", "seller"]) {
      const storage = await adapter.prepareRoleStorage(role);
      for (const { sessionId, outcome } of await adapter.recoverRoleSessions(storage, config)) {
        console.log(`${role} ${sessionId}: ${outcome.kind}${"reason" in outcome ? ` (${outcome.reason})` : ""}`);
      }
    }
    return 0;
  }

  if (command !== "verify") {
    console.error(`알 수 없는 명령: ${command} (verify, status, recover)`);
    return 2;
  }

  const files = await evidence.listEvidenceFiles(dataDir);
  if (files.length === 0) {
    console.log("\n보관된 합의 증빙이 없습니다.");
    return 1;
  }
  let failures = 0;
  for (const file of files) {
    const role = basename(file).startsWith("buyer-") ? "buyer" : "seller";
    const label = role === "buyer" ? "BUYER" : "SELLER";
    console.log(`\n[${label}] ${basename(file)}`);
    const key = await keyStore.readKey(role, "evidence");
    if (key === undefined) {
      console.log("  실패: 이 역할의 증빙 키가 키 보관소에 없습니다.");
      failures += 1;
      continue;
    }
    let settlement;
    try {
      settlement = await evidence.loadEvidence(file, key);
    } catch {
      console.log("  실패: 복호화하지 못했습니다. 키가 다르거나 파일이 변조됐습니다.");
      failures += 1;
      continue;
    }
    console.log(`  복호화 성공 · 합의 가격 ${formatKrw(settlement.agreedPrice)} (당사자만 보관)`);
    console.log(`  계약 ${settlement.contractAddress}`);
    const check = await evidence.verifyEvidence({
      evidence: settlement,
      network: adapter.LOCAL_NETWORK_ID,
      readDealState: adapter.readDealState(config),
    });
    if (check.ok) {
      console.log("  온체인 확인: 네트워크·계약 버전·거래 ID 일치, 상태 SETTLED, 가격 커밋 일치");
    } else {
      console.log(`  온체인 확인 실패: ${reasons[check.reason]}`);
      failures += 1;
    }
  }
  return failures === 0 ? 0 : 1;
};

main().then(
  (code) => process.exit(code),
  (error) => {
    console.error(`오류: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  },
);
