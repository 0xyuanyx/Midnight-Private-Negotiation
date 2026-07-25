import type { IsolationMessage } from './protocol';

type Role = 'buyer' | 'seller';
type Signal = 'SELLER_JOINED' | 'SETTLED';

const relayPlan: Array<{ source: Role; type: IsolationMessage['type'] }> = [
  { source: 'buyer', type: 'CONTRACT_READY' },
  { source: 'buyer', type: 'PROPOSAL' },
  { source: 'buyer', type: 'PRICE_OPENING' },
];

const chainPlan: Array<{ source: Role; status: number }> = [
  { source: 'buyer', status: 0 },
  { source: 'seller', status: 1 },
  { source: 'buyer', status: 2 },
  { source: 'seller', status: 3 },
];

export class RoleProtocolSequence {
  readonly #wallets = new Set<Role>();
  readonly #ready = new Set<Role>();
  #relayIndex = 0;
  #chainIndex = 0;
  #sellerJoined = false;
  #settled = false;

  acceptWallet(source: Role): void {
    if (this.#wallets.has(source)) throw new Error('duplicate wallet address event');
    this.#wallets.add(source);
  }

  acceptReady(source: Role): void {
    if (!this.#wallets.has(source) || this.#ready.has(source)) {
      throw new Error('role readiness source or phase is invalid');
    }
    this.#ready.add(source);
  }

  rolesReady(): boolean {
    return this.#ready.size === 2;
  }

  acceptRelay(source: Role, message: IsolationMessage): void {
    const expected = relayPlan[this.#relayIndex];
    const expectedChainIndex = message.type === 'PRICE_OPENING' ? 3 : 1;
    if (
      expected === undefined ||
      expected.source !== source ||
      expected.type !== message.type ||
      this.#chainIndex !== expectedChainIndex
    ) {
      throw new Error('relay source or phase is invalid');
    }
    this.#relayIndex += 1;
  }

  acceptChainState(source: Role, status: number): void {
    const expected = chainPlan[this.#chainIndex];
    if (expected === undefined || expected.source !== source || expected.status !== status) {
      throw new Error('chain state source or phase is invalid');
    }
    this.#chainIndex += 1;
  }

  acceptSignal(source: Role, signal: Signal): void {
    if (source !== 'seller') throw new Error('role signal source is invalid');
    if (signal === 'SELLER_JOINED') {
      if (this.#chainIndex < 2 || this.#sellerJoined) throw new Error('seller joined signal is out of order');
      this.#sellerJoined = true;
      return;
    }
    if (this.#chainIndex < 4 || this.#settled) throw new Error('settlement signal is out of order');
    this.#settled = true;
  }

  isComplete(): boolean {
    return this.#relayIndex === relayPlan.length && this.#chainIndex === chainPlan.length && this.#settled;
  }
}
