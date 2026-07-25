import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { generateRandomSeed } from '@midnight-ntwrk/wallet-sdk-hd';

const SEED_FILE = 'wallet.seed';
const SEED_PATTERN = /^[0-9a-f]{64}$/u;

const isMissingFile = (error: unknown): boolean => error instanceof Error && 'code' in error && error.code === 'ENOENT';

const validateSeed = (seed: string): string => {
  if (!SEED_PATTERN.test(seed)) {
    throw new Error('role wallet seed file is invalid');
  }
  return seed;
};

export const loadOrCreateRoleSeed = async (directory: string): Promise<string> => {
  const seedPath = path.join(directory, SEED_FILE);
  await mkdir(directory, { recursive: true, mode: 0o700 });

  try {
    return validateSeed((await readFile(seedPath, 'utf8')).trim());
  } catch (error) {
    if (!isMissingFile(error)) {
      throw error;
    }
  }

  const seed = Buffer.from(generateRandomSeed()).toString('hex');
  try {
    await writeFile(seedPath, `${seed}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    await chmod(seedPath, 0o600);
    return seed;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'EEXIST') {
      return validateSeed((await readFile(seedPath, 'utf8')).trim());
    }
    throw error;
  }
};
