import type { Config } from '../config';
import { parseIsolationMessage, type IsolationMessage, type RelayAudit } from './protocol';

export type RuntimeRole = 'buyer' | 'seller';
export type RuntimeFailureCode = 'RUNTIME_FAILED';

export type RuntimeMetadata = {
  role: RuntimeRole;
  pid: number;
  walletAddress: string;
  privateStateStore: string;
  proofServer: string;
  localFields: string[];
  absentFields: string[];
  nightReady: boolean;
  dustReady: boolean;
};

export type ObserverMetadata = {
  pid: number;
  configKeys: string[];
  absentFields: string[];
  forbiddenEnvironmentKeys: string[];
};

export type ObserverInput = {
  contractAddress: string;
  indexer: string;
  indexerWS: string;
};

export type ParentToObserverMessage = { type: 'OBSERVE'; expectedStatus: number };

export type ObserverState = {
  status: number;
  finalPrice: string;
  buyerCommitmentPrefix: string;
  sellerCommitmentPrefix: string;
  priceCommitmentPrefix: string;
};

export type ObserverEvent =
  | { type: 'OBSERVER_READY'; metadata: ObserverMetadata }
  | { type: 'OBSERVER_STATE'; state: ObserverState }
  | { type: 'ERROR'; role: 'observer'; code: RuntimeFailureCode };

export type ParentToRoleMessage =
  | { type: 'FUNDED' }
  | { type: 'START' }
  | { type: 'SELLER_JOINED' }
  | { type: 'RELAY'; message: IsolationMessage };

export type RoleToParentMessage =
  | { type: 'WALLET_ADDRESS'; role: RuntimeRole; walletAddress: string }
  | { type: 'ROLE_READY'; metadata: RuntimeMetadata }
  | { type: 'RELAY'; message: IsolationMessage }
  | { type: 'CHAIN_STATE'; status: number; finalPrice: string }
  | { type: 'SELLER_JOINED' }
  | { type: 'SETTLED' }
  | { type: 'ERROR'; role: RuntimeRole; code: RuntimeFailureCode };

export type FunderInput = {
  config: Config;
  recipients: string[];
  amount: string;
};

export type FunderEvent = { type: 'FUNDER_DONE' } | { type: 'ERROR'; role: 'funder'; code: RuntimeFailureCode };

export type IsolatedRunResult = {
  buyer: RuntimeMetadata;
  seller: RuntimeMetadata;
  observer: ObserverMetadata;
  observerStates: ObserverState[];
  relayAudit: RelayAudit[];
  statuses: number[];
  finalPrice: bigint;
};

type RecordValue = Record<string, unknown>;

const isRecord = (value: unknown): value is RecordValue =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const requireRecord = (value: unknown, label: string): RecordValue => {
  if (!isRecord(value)) throw new Error(`${label} must be an object`);
  return value;
};

const requireExactKeys = (value: RecordValue, keys: readonly string[], label: string): void => {
  const actual = Object.keys(value);
  for (const key of actual) {
    if (!keys.includes(key)) throw new Error(`unexpected ${label} field: ${key}`);
  }
  for (const key of keys) {
    if (!Object.hasOwn(value, key)) throw new Error(`missing ${label} field: ${key}`);
  }
};

const requireString = (value: unknown, label: string): string => {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`${label} must be a non-empty string`);
  return value;
};

const requireDecimal = (value: unknown, label: string): string => {
  const result = requireString(value, label);
  if (!/^[0-9]+$/u.test(result)) throw new Error(`${label} must be an unsigned decimal integer`);
  return result;
};

const requireInteger = (value: unknown, label: string, min = 0, max = Number.MAX_SAFE_INTEGER): number => {
  if (!Number.isInteger(value) || (value as number) < min || (value as number) > max) {
    throw new Error(`${label} must be an integer`);
  }
  return value as number;
};

const requireBoolean = (value: unknown, label: string): boolean => {
  if (typeof value !== 'boolean') throw new Error(`${label} must be a boolean`);
  return value;
};

const requireStrings = (value: unknown, label: string): string[] => {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be a string array`);
  }
  const items = value as unknown[];
  if (items.some((item) => typeof item !== 'string')) {
    throw new Error(`${label} must be a string array`);
  }
  return items.map((item) => item as string);
};

const requireFailureCode = (value: unknown): RuntimeFailureCode => {
  if (value !== 'RUNTIME_FAILED') throw new Error('invalid runtime failure code');
  return value;
};

const requireRole = (value: unknown, source: RuntimeRole): RuntimeRole => {
  if (value !== source) throw new Error('child event role does not match source');
  return source;
};

const expectedFields = {
  buyer: {
    local: ['agreedPrice', 'buyerLimitRandomness', 'buyerMaxPrice', 'buyerSecretKey', 'priceRandomness', 'role'],
    absent: ['sellerLimitRandomness', 'sellerMinPrice', 'sellerSecretKey'],
  },
  seller: {
    local: ['role', 'sellerLimitRandomness', 'sellerMinPrice', 'sellerSecretKey'],
    absent: ['buyerLimitRandomness', 'buyerMaxPrice', 'buyerSecretKey'],
  },
} as const;

const requireExpectedStrings = (value: unknown, expected: readonly string[], label: string): string[] => {
  const actual = requireStrings(value, label);
  if (actual.length !== expected.length || actual.some((item, index) => item !== expected[index])) {
    throw new Error(`${label} does not match role state`);
  }
  return actual;
};

const parseRuntimeMetadata = (
  source: RuntimeRole,
  value: unknown,
  expected?: { pid?: number; walletAddress?: string; privateStateStore?: string; proofServer?: string },
): RuntimeMetadata => {
  const metadata = requireRecord(value, 'child metadata');
  requireExactKeys(
    metadata,
    [
      'role',
      'pid',
      'walletAddress',
      'privateStateStore',
      'proofServer',
      'localFields',
      'absentFields',
      'nightReady',
      'dustReady',
    ],
    'child metadata',
  );
  const pid = requireInteger(metadata.pid, 'child metadata pid', 1);
  const walletAddress = requireString(metadata.walletAddress, 'wallet address');
  const privateStateStore = requireString(metadata.privateStateStore, 'private-state store');
  const proofServer = requireString(metadata.proofServer, 'proof server');
  if (expected?.pid !== undefined && pid !== expected.pid) {
    throw new Error('child metadata pid does not match process');
  }
  if (expected?.walletAddress !== undefined && walletAddress !== expected.walletAddress) {
    throw new Error('child metadata wallet address does not match funded address');
  }
  if (expected?.privateStateStore !== undefined && privateStateStore !== expected.privateStateStore) {
    throw new Error('child metadata private-state store does not match spawn configuration');
  }
  if (expected?.proofServer !== undefined && proofServer !== expected.proofServer) {
    throw new Error('child metadata proof server does not match spawn configuration');
  }
  return {
    role: requireRole(metadata.role, source),
    pid,
    walletAddress,
    privateStateStore,
    proofServer,
    localFields: requireExpectedStrings(metadata.localFields, expectedFields[source].local, 'local fields'),
    absentFields: requireExpectedStrings(metadata.absentFields, expectedFields[source].absent, 'absent fields'),
    nightReady: requireBoolean(metadata.nightReady, 'NIGHT readiness'),
    dustReady: requireBoolean(metadata.dustReady, 'DUST readiness'),
  };
};

export const parseRoleToParentMessage = (
  source: RuntimeRole,
  value: unknown,
  expected?: { pid?: number; walletAddress?: string; privateStateStore?: string; proofServer?: string },
): RoleToParentMessage => {
  const event = requireRecord(value, 'child event');
  const type = requireString(event.type, 'child event type');
  switch (type) {
    case 'WALLET_ADDRESS':
      requireExactKeys(event, ['type', 'role', 'walletAddress'], 'child event');
      return {
        type,
        role: requireRole(event.role, source),
        walletAddress: requireString(event.walletAddress, 'wallet address'),
      };
    case 'ROLE_READY':
      requireExactKeys(event, ['type', 'metadata'], 'child event');
      return { type, metadata: parseRuntimeMetadata(source, event.metadata, expected) };
    case 'RELAY':
      requireExactKeys(event, ['type', 'message'], 'child event');
      return { type, message: parseIsolationMessage(event.message) };
    case 'CHAIN_STATE':
      requireExactKeys(event, ['type', 'status', 'finalPrice'], 'child event');
      return {
        type,
        status: requireInteger(event.status, 'chain status', 0, 3),
        finalPrice: requireDecimal(event.finalPrice, 'final price'),
      };
    case 'SELLER_JOINED':
    case 'SETTLED':
      requireExactKeys(event, ['type'], 'child event');
      return { type };
    case 'ERROR':
      requireExactKeys(event, ['type', 'role', 'code'], 'child event');
      return {
        type,
        role: requireRole(event.role, source),
        code: requireFailureCode(event.code),
      };
    default:
      throw new Error(`unknown child event type: ${type}`);
  }
};

export const parseParentToRoleMessage = (value: unknown): ParentToRoleMessage => {
  const message = requireRecord(value, 'parent message');
  const type = requireString(message.type, 'parent message type');
  switch (type) {
    case 'FUNDED':
    case 'START':
    case 'SELLER_JOINED':
      requireExactKeys(message, ['type'], 'parent message');
      return { type };
    case 'RELAY':
      requireExactKeys(message, ['type', 'message'], 'parent message');
      return { type, message: parseIsolationMessage(message.message) };
    default:
      throw new Error(`unknown parent message type: ${type}`);
  }
};

export const parseParentToObserverMessage = (value: unknown): ParentToObserverMessage => {
  const message = requireRecord(value, 'parent observer message');
  requireExactKeys(message, ['type', 'expectedStatus'], 'parent observer message');
  if (message.type !== 'OBSERVE') throw new Error('unknown parent observer message type');
  return {
    type: 'OBSERVE',
    expectedStatus: requireInteger(message.expectedStatus, 'observer expected status', 0, 3),
  };
};

const parseObserverMetadata = (value: unknown): ObserverMetadata => {
  const metadata = requireRecord(value, 'observer metadata');
  requireExactKeys(metadata, ['pid', 'configKeys', 'absentFields', 'forbiddenEnvironmentKeys'], 'observer metadata');
  return {
    pid: requireInteger(metadata.pid, 'observer pid', 1),
    configKeys: requireStrings(metadata.configKeys, 'observer config keys'),
    absentFields: requireStrings(metadata.absentFields, 'observer absent fields'),
    forbiddenEnvironmentKeys: requireStrings(metadata.forbiddenEnvironmentKeys, 'observer forbidden environment keys'),
  };
};

const parseObserverState = (value: unknown): ObserverState => {
  const state = requireRecord(value, 'observer state');
  requireExactKeys(
    state,
    ['status', 'finalPrice', 'buyerCommitmentPrefix', 'sellerCommitmentPrefix', 'priceCommitmentPrefix'],
    'observer state',
  );
  return {
    status: requireInteger(state.status, 'observer status', 0, 3),
    finalPrice: requireDecimal(state.finalPrice, 'observer final price'),
    buyerCommitmentPrefix: requireString(state.buyerCommitmentPrefix, 'buyer commitment prefix'),
    sellerCommitmentPrefix: requireString(state.sellerCommitmentPrefix, 'seller commitment prefix'),
    priceCommitmentPrefix: requireString(state.priceCommitmentPrefix, 'price commitment prefix'),
  };
};

export const parseObserverEvent = (value: unknown): ObserverEvent => {
  const event = requireRecord(value, 'observer event');
  const type = requireString(event.type, 'observer event type');
  switch (type) {
    case 'OBSERVER_READY':
      requireExactKeys(event, ['type', 'metadata'], 'observer event');
      return { type, metadata: parseObserverMetadata(event.metadata) };
    case 'OBSERVER_STATE':
      requireExactKeys(event, ['type', 'state'], 'observer event');
      return { type, state: parseObserverState(event.state) };
    case 'ERROR':
      requireExactKeys(event, ['type', 'role', 'code'], 'observer event');
      if (event.role !== 'observer') throw new Error('observer error role is invalid');
      return { type, role: 'observer', code: requireFailureCode(event.code) };
    default:
      throw new Error(`unknown observer event type: ${type}`);
  }
};

export const parseFunderEvent = (value: unknown): FunderEvent => {
  const event = requireRecord(value, 'funder event');
  const type = requireString(event.type, 'funder event type');
  switch (type) {
    case 'FUNDER_DONE':
      requireExactKeys(event, ['type'], 'funder event');
      return { type };
    case 'ERROR':
      requireExactKeys(event, ['type', 'role', 'code'], 'funder event');
      if (event.role !== 'funder') throw new Error('funder error role is invalid');
      return { type, role: 'funder', code: requireFailureCode(event.code) };
    default:
      throw new Error(`unknown funder event type: ${type}`);
  }
};
