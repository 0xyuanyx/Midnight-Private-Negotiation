import { spawnSync } from "node:child_process";

const REQUIRED_NODE = [22, 13, 0];
const COMPILER_VERSION = "0.31.1";
const INSTALLER =
  "curl --proto '=https' --tlsv1.2 -LsSf https://github.com/midnightntwrk/compact/releases/latest/download/compact-installer.sh | sh";

const problems = [];

const nodeVersion = process.versions.node.split(".").map(Number);
const nodeTooOld = REQUIRED_NODE.some((part, index) => {
  const previousEqual = REQUIRED_NODE.slice(0, index).every(
    (value, i) => nodeVersion[i] === value,
  );
  return previousEqual && nodeVersion[index] < part;
});
if (nodeTooOld) {
  problems.push(
    `Node ${REQUIRED_NODE.join(".")} 이상이 필요합니다 (현재 ${process.versions.node}).`,
  );
}

const cli = spawnSync("compact", ["--version"], { encoding: "utf8" });
if (cli.error !== undefined || cli.status !== 0) {
  problems.push(
    [
      "Compact CLI를 찾을 수 없습니다. 설치한 뒤 새 터미널을 열고 다시 실행하세요.",
      `  ${INSTALLER}`,
    ].join("\n"),
  );
} else {
  const compiler = spawnSync("compact", ["compile", `+${COMPILER_VERSION}`, "--version"], {
    encoding: "utf8",
  });
  if (compiler.status !== 0) {
    problems.push(
      [
        `Compact compiler ${COMPILER_VERSION}이 설치되어 있지 않습니다. 기본 버전을 바꾸지 않고 설치합니다.`,
        `  compact update ${COMPILER_VERSION} --no-set-default`,
      ].join("\n"),
    );
  }
}

if (problems.length > 0) {
  console.error("\n[toolchain] 실행 전 준비가 필요합니다.\n");
  for (const problem of problems) console.error(`- ${problem}\n`);
  process.exit(1);
}
