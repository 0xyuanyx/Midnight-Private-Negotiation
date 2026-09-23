import { execFile, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { chmod, mkdir, open, readFile, stat } from "node:fs/promises";
import { join } from "node:path";

export type PartyRole = "buyer" | "seller";
export type KeyPurpose = "evidence" | "private-state";
export type KeyStoreMode = "macos-keychain" | "file";

export type KeyStore = {
  readonly mode: KeyStoreMode;
  // Shown to the user so the protection level is never implicit.
  readonly description: string;
  getOrCreateKey(role: PartyRole, purpose: KeyPurpose): Promise<Buffer>;
  readKey(role: PartyRole, purpose: KeyPurpose): Promise<Buffer | undefined>;
};

const KEY_BYTES = 32;
const DEFAULT_KEYCHAIN_SERVICE = "midnight-private-negotiation";

// The level provider requires three character classes. The fixed prefix adds
// them; all of the secrecy comes from the 32 random key bytes.
export const privateStatePassword = (key: Buffer): string =>
  `PS-Key:${key.toString("hex")}`;

const accountName = (role: PartyRole, purpose: KeyPurpose): string =>
  `${role}-${purpose}`;

const parseHexKey = (value: string): Buffer => {
  const trimmed = value.trim();
  if (!/^[0-9a-f]{64}$/u.test(trimmed)) {
    throw new Error("stored key is not a 32-byte hex value");
  }
  return Buffer.from(trimmed, "hex");
};

const runSecurity = (
  args: readonly string[],
): Promise<{ code: number; stdout: string }> =>
  new Promise((resolve, reject) => {
    execFile("security", args, { encoding: "utf8" }, (error, stdout) => {
      if (error === null) {
        resolve({ code: 0, stdout });
        return;
      }
      if (typeof error.code === "number") {
        resolve({ code: error.code, stdout });
        return;
      }
      reject(error);
    });
  });

// `security -i` reads commands from stdin, so the new key never appears in a
// process argument list.
const addKeychainItem = (
  service: string,
  account: string,
  hexKey: string,
): Promise<void> =>
  new Promise((resolve, reject) => {
    const child = spawn("security", ["-i"], { stdio: ["pipe", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0 && stderr.trim().length === 0) resolve();
      else reject(new Error(`macOS Keychain rejected the new key: ${stderr.trim()}`));
    });
    child.stdin.end(
      `add-generic-password -s ${service} -a ${account} -w ${hexKey}\n`,
    );
  });

export const createMacosKeychainKeyStore = (
  service = DEFAULT_KEYCHAIN_SERVICE,
): KeyStore => {
  if (!/^[a-z0-9.-]{1,64}$/u.test(service)) {
    throw new Error("invalid Keychain service name");
  }
  const readKey = async (
    role: PartyRole,
    purpose: KeyPurpose,
  ): Promise<Buffer | undefined> => {
    const result = await runSecurity([
      "find-generic-password",
      "-s",
      service,
      "-a",
      accountName(role, purpose),
      "-w",
    ]);
    // 44 is errSecItemNotFound.
    if (result.code === 44) return undefined;
    if (result.code !== 0) {
      throw new Error(`macOS Keychain read failed with code ${result.code}`);
    }
    return parseHexKey(result.stdout);
  };
  return {
    mode: "macos-keychain",
    description: `macOS 키체인 (서비스 ${service})`,
    readKey,
    async getOrCreateKey(role, purpose) {
      const existing = await readKey(role, purpose);
      if (existing !== undefined) return existing;
      await addKeychainItem(
        service,
        accountName(role, purpose),
        randomBytes(KEY_BYTES).toString("hex"),
      );
      const created = await readKey(role, purpose);
      if (created === undefined) {
        throw new Error("macOS Keychain did not return the new key");
      }
      return created;
    },
  };
};

// A 0600 key file only stops other OS users. Anyone who copies both the key
// file and the evidence can decrypt it, so this mode must be chosen explicitly.
export const createFileKeyStore = (directory: string): KeyStore => {
  const pathFor = (role: PartyRole, purpose: KeyPurpose): string =>
    join(directory, `${accountName(role, purpose)}.key`);
  const readKey = async (
    role: PartyRole,
    purpose: KeyPurpose,
  ): Promise<Buffer | undefined> => {
    const path = pathFor(role, purpose);
    try {
      const info = await stat(path);
      if ((info.mode & 0o077) !== 0) {
        throw new Error(`key file ${path} is readable by other users`);
      }
      return parseHexKey(await readFile(path, "utf8"));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    }
  };
  return {
    mode: "file",
    description: `로컬 키 파일 (${directory}, 권한 600, 키와 증빙을 함께 가져가면 복호화 가능)`,
    readKey,
    async getOrCreateKey(role, purpose) {
      const existing = await readKey(role, purpose);
      if (existing !== undefined) return existing;
      await mkdir(directory, { recursive: true, mode: 0o700 });
      await chmod(directory, 0o700);
      try {
        const handle = await open(pathFor(role, purpose), "wx", 0o600);
        try {
          await handle.writeFile(randomBytes(KEY_BYTES).toString("hex"));
          await handle.sync();
        } finally {
          await handle.close();
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      }
      const created = await readKey(role, purpose);
      if (created === undefined) throw new Error("key file was not created");
      return created;
    },
  };
};

// Never falls back silently: an unavailable Keychain is an error, and the
// weaker file store is used only when NEGOTIATION_KEY_STORE=file.
export const selectKeyStore = (input: {
  dataDir: string;
  environment?: Readonly<Record<string, string | undefined>>;
  platform?: NodeJS.Platform;
}): KeyStore => {
  const environment = input.environment ?? process.env;
  const platform = input.platform ?? process.platform;
  const requested = environment.NEGOTIATION_KEY_STORE?.trim();
  if (requested === "file") {
    return createFileKeyStore(join(input.dataDir, "keys"));
  }
  if (requested === "keychain" || (requested === undefined && platform === "darwin")) {
    if (platform !== "darwin") {
      throw new Error("NEGOTIATION_KEY_STORE=keychain requires macOS");
    }
    return createMacosKeychainKeyStore(
      environment.NEGOTIATION_KEYCHAIN_SERVICE?.trim() || DEFAULT_KEYCHAIN_SERVICE,
    );
  }
  if (requested === undefined) {
    throw new Error(
      "no OS key store is supported on this platform; set NEGOTIATION_KEY_STORE=file to accept a local key file",
    );
  }
  throw new Error(`unsupported NEGOTIATION_KEY_STORE: ${requested}`);
};
