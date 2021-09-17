import { BigNumber, BigNumberish } from 'ethers';

import config from '../../src/config';
import {
  LiquidityStakingV1,
  SafetyModuleV1,
} from '../../types';

type GenericStakingModule = LiquidityStakingV1 | SafetyModuleV1;

// Verbose logging for debugging.
const LOG_BALANCE_UPDATES = config.STAKING_TESTS_LOG_BALANCE_UPDATES;

export class StoredBalance {
  protected contract: GenericStakingModule;
  protected label: string;
  protected cachedEpoch: number;
  protected current: BigNumber;
  protected next: BigNumber;

  constructor(contract: GenericStakingModule, label: string) {
    this.contract = contract;
    this.label = label;
    this.cachedEpoch = 0;
    this.current = BigNumber.from(0);
    this.next = BigNumber.from(0);
  }

  async getCurrent(): Promise<BigNumber> {
    await this.load();
    return this.current;
  }

  async getNext(): Promise<BigNumber> {
    await this.load();
    return this.next;
  }

  async increaseCurrentAndNext(amount: BigNumberish): Promise<void> {
    await this.load();
    this.log(
      `${this.label}: (${this.current}, ${this.next}) -> (${this.current.add(
        amount,
      )}, ${this.next.add(amount)}})`,
    );
    this.current = this.current.add(amount);
    this.next = this.next.add(amount);
  }

  async decreaseCurrentAndNext(amount: BigNumberish): Promise<void> {
    await this.load();
    this.log(
      `${this.label}: (${this.current}, ${this.next}) -> (${this.current.sub(
        amount,
      )}, ${this.next.sub(amount)}})`,
    );
    this.current = this.current.sub(amount);
    this.next = this.next.sub(amount);
  }

  async increaseNext(amount: BigNumberish): Promise<void> {
    await this.load();
    this.log(
      `${this.label}: (${this.current}, ${this.next}) -> (${this.current}, ${this.next.add(
        amount,
      )}})`,
    );
    this.next = this.next.add(amount);
  }

  async decreaseNext(amount: BigNumberish): Promise<void> {
    await this.load();
    this.log(
      `${this.label}: (${this.current}, ${this.next}) -> (${this.current}, ${this.next.sub(
        amount,
      )}})`,
    );
    this.next = this.next.sub(amount);
  }

  forceRollover(): void {
    this.current = this.next;
  }

  clone(): StoredBalance {
    const balance = new StoredBalance(this.contract, this.label);
    balance.cachedEpoch = this.cachedEpoch;
    balance.current = this.current;
    balance.next = this.next;
    return balance;
  }

  private log(message: string): void {
    if (LOG_BALANCE_UPDATES) {
      console.log(message);
    }
  }

  private async load(): Promise<void> {
    const epoch = await this.contract.getCurrentEpoch();
    if (!epoch.eq(this.cachedEpoch)) {
      this.current = this.next;
      this.cachedEpoch = epoch.toNumber();
    }
  }
}
