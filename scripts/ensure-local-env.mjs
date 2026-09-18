// infra/midnight-local.env holds the local indexer container's internal passwords and
// secret, so it is gitignored. A fresh clone does not have it and docker compose would
// fail; this creates it once with random values of the same shape.
import { randomBytes } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";

const path = new URL("../infra/midnight-local.env", import.meta.url);
if (!existsSync(path)) {
  const password = () => randomBytes(12).toString("hex");
  writeFileSync(
    path,
    [
      "APP__INFRA__NODE__URL=ws://midnight-node:9944",
      `APP__INFRA__STORAGE__PASSWORD=${password()}`,
      `APP__INFRA__PUB_SUB__PASSWORD=${password()}`,
      `APP__INFRA__LEDGER_STATE_STORAGE__PASSWORD=${password()}`,
      `APP__INFRA__SECRET=${randomBytes(33).toString("hex")}`,
      "",
    ].join("\n"),
    { mode: 0o600 },
  );
  console.log("[local-env] infra/midnight-local.env를 새로 만들었습니다 (로컬 인덱서 전용 임의 값).");
}
