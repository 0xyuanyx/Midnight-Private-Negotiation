import {
  CompactTypeBytes,
  CompactTypeVector,
  convertFieldToBytes,
  persistentHash
} from "@midnight-ntwrk/compact-runtime";

const BYTES_32 = 32;
const bytesType = new CompactTypeBytes(BYTES_32);
const hash2Type = new CompactTypeVector(2, bytesType);
const hash4Type = new CompactTypeVector(4, bytesType);
const hash5Type = new CompactTypeVector(5, bytesType);

const pad32 = (value: string): Uint8Array => {
  if (value.length > BYTES_32) {
    throw new Error(`Domain separator exceeds ${BYTES_32} bytes`);
  }

  const result = new Uint8Array(BYTES_32);
  for (let index = 0; index < value.length; index += 1) {
    result[index] = value.charCodeAt(index);
  }
  return result;
};

const assertBytes32 = (value: Uint8Array, label: string): void => {
  if (value.length !== BYTES_32) {
    throw new Error(`${label} must be exactly ${BYTES_32} bytes`);
  }
};

const asFieldBytes = (value: bigint): Uint8Array =>
  convertFieldToBytes(BYTES_32, value, "negotiation commitment");

export const hexToBytes = (hex: string): Uint8Array => {
  if (hex.length % 2 !== 0 || !/^[0-9a-f]*$/iu.test(hex)) {
    throw new Error("Hex value must contain an even number of hex characters");
  }

  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
};

export const publicKeyForSecret = (secret: Uint8Array): Uint8Array => {
  assertBytes32(secret, "Secret key");
  return persistentHash(hash2Type, [pad32("negotiation:public-key:"), secret]);
};

export const limitCommitment = (
  dealId: Uint8Array,
  role: "negotiation:buyer:" | "negotiation:seller:",
  key: Uint8Array,
  limit: bigint,
  randomness: Uint8Array
): Uint8Array => {
  assertBytes32(dealId, "Deal ID");
  assertBytes32(key, "Public key");
  assertBytes32(randomness, "Limit randomness");

  return persistentHash(hash5Type, [
    dealId,
    pad32(role),
    key,
    asFieldBytes(limit),
    randomness
  ]);
};

export const priceCommitment = (
  dealId: Uint8Array,
  price: bigint,
  randomness: Uint8Array
): Uint8Array => {
  assertBytes32(dealId, "Deal ID");
  assertBytes32(randomness, "Price randomness");

  return persistentHash(hash4Type, [
    dealId,
    pad32("negotiation:price:"),
    asFieldBytes(price),
    randomness
  ]);
};
