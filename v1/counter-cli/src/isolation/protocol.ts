export type IsolationMessage =
  | { type: 'CONTRACT_READY'; contractAddress: string }
  | { type: 'PROPOSAL'; dealId: string; price: string }
  | {
      type: 'PRICE_OPENING';
      dealId: string;
      price: string;
      priceRandomness: string;
    };

export type RelayAudit = {
  type: IsolationMessage['type'];
  keys: string[];
  forbiddenFieldCount: number;
};

const FORBIDDEN_FIELDS = new Set([
  'buyerMax',
  'sellerMin',
  'buyerLimitRandomness',
  'sellerLimitRandomness',
  'buyerSecretKey',
  'sellerSecretKey',
  'walletSeed',
  'privateState',
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const requireExactKeys = (value: Record<string, unknown>, allowed: readonly string[]): void => {
  for (const key of Object.keys(value)) {
    if (FORBIDDEN_FIELDS.has(key)) {
      throw new Error(`forbidden relay field: ${key}`);
    }
    if (!allowed.includes(key)) {
      throw new Error(`unexpected relay field: ${key}`);
    }
  }
  for (const key of allowed) {
    if (!Object.hasOwn(value, key)) {
      throw new Error(`missing relay field: ${key}`);
    }
  }
};

const requireString = (value: unknown, field: string): string => {
  if (typeof value !== 'string') {
    throw new Error(`${field} must be a string`);
  }
  return value;
};

const requireHex32 = (value: unknown, field: string): string => {
  const hex = requireString(value, field);
  if (!/^[0-9a-f]{64}$/iu.test(hex)) {
    throw new Error(`${field} must be 32-byte hex`);
  }
  return hex;
};

const requirePrice = (value: unknown): string => {
  const price = requireString(value, 'price');
  if (!/^[0-9]+$/u.test(price)) {
    throw new Error('price must be an unsigned decimal integer');
  }
  return price;
};

export const parseIsolationMessage = (value: unknown): IsolationMessage => {
  if (!isRecord(value)) {
    throw new Error('relay message must be an object');
  }

  for (const key of Object.keys(value)) {
    if (FORBIDDEN_FIELDS.has(key)) {
      throw new Error(`forbidden relay field: ${key}`);
    }
  }

  const type = requireString(value.type, 'type');
  switch (type) {
    case 'CONTRACT_READY':
      requireExactKeys(value, ['type', 'contractAddress']);
      return {
        type,
        contractAddress: requireHex32(value.contractAddress, 'contractAddress'),
      };
    case 'PROPOSAL':
      requireExactKeys(value, ['type', 'dealId', 'price']);
      return {
        type,
        dealId: requireHex32(value.dealId, 'dealId'),
        price: requirePrice(value.price),
      };
    case 'PRICE_OPENING':
      requireExactKeys(value, ['type', 'dealId', 'price', 'priceRandomness']);
      return {
        type,
        dealId: requireHex32(value.dealId, 'dealId'),
        price: requirePrice(value.price),
        priceRandomness: requireHex32(value.priceRandomness, 'priceRandomness'),
      };
    default:
      throw new Error(`unknown relay message type: ${type}`);
  }
};

export const relayAudit = (message: IsolationMessage): RelayAudit => ({
  type: message.type,
  keys: Object.keys(message).sort(),
  forbiddenFieldCount: Object.keys(message).filter((key) => FORBIDDEN_FIELDS.has(key)).length,
});
