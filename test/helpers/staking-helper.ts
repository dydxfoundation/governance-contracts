import { LogDescription } from '@ethersproject/abi';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import BNJS from 'bignumber.js';
import { expect } from 'chai';
import { BigNumber, BigNumberish, ContractTransaction, Signer } from 'ethers';
import _ from 'lodash';

import config from '../../src/config';
import {
  ZERO_ADDRESS,
} from '../../src/constants';
import { Role } from '../../src/types';
import { getRole } from '../../src/util';
import {
  ERC20,
  LiquidityStakingV1,
  SafetyModuleV1,
  StarkProxyV1,
} from '../../types';
import { TestContext } from './describe-contract';
import { increaseTimeAndMine, latestBlockTimestamp } from './evm';
import { StoredBalance } from './staking-helper-balance';

type GenericStakingModule = LiquidityStakingV1 | SafetyModuleV1;

// When iterating on tests or debugging, this can be disabled to run the tests faster.
const CHECK_INVARIANTS = config.STAKING_TESTS_CHECK_INVARIANTS;

const BORROWING_TOTAL_ALLOCATION = 10_000;
const SHORTFALL_INDEX_BASE = new BNJS(1e36);

const SNAPSHOTS: Record<string, StakingState> = {};

export interface InvariantCheckOptions {
  roundingTolerance?: BigNumberish;
  skipStakerVsBorrowerDebtComparison?: boolean;
  skipInvariantChecks?: boolean;
}

export interface StakingState {
  lastCurrentEpoch: BigNumber;
  netDeposits: BigNumber;
  netDebtDeposits: BigNumber;
  netBorrowed: BigNumber;
  netBorrowedByBorrower: Record<string, BigNumber>;
  debtBalanceByBorrower: Record<string, BigNumber>;
  debtBalanceByStaker: Record<string, BigNumber>;
  madeInitialAllocation: boolean;
  activeBalanceByStaker: Record<string, StoredBalance>;
  inactiveBalanceByStaker: Record<string, StoredBalance>;
}

function defaultAddrMapping<T>(
  defaultMaker: (name: string) => T,
  baseObj: Record<string, T> = {},
): Record<string, T> {
  const handler = {
    get: function (target: Record<string, T>, name: string) {
      // Only create default when accessing an Ethereum address key.
      if (typeof name === 'string' && name.slice(0, 2) == '0x') {
        /* eslint-disable-next-line no-prototype-builtins */
        if (!target.hasOwnProperty(name)) {
          target[name] = defaultMaker(name);
        }
      }
      return target[name];
    },
  };
  // Allow the proxied object to clone itself by creating a new proxy around a shallow clone of
  // itself.
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  (baseObj as any).clone = () => {
    return defaultAddrMapping(
      defaultMaker,
      // Use the custom cloner for the values, but not for the object iself, because that would
      // cause the clone() function to call itself circularly.
      _.mapValues(baseObj, (val) => _.cloneWith(val, customCloner)),
    );
  };
  return new Proxy(baseObj, handler);
}

function customCloner(
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  value: any,
) {
  if (typeof value.clone === 'function') {
    return value.clone();
  }
}

function asLS(
  contract: GenericStakingModule,
): LiquidityStakingV1 {
  return contract as LiquidityStakingV1;
}

function asSM(
  contract: GenericStakingModule,
): SafetyModuleV1 {
  return contract as SafetyModuleV1;
}

export class StakingHelper {
  private ctx: TestContext;
  private contract: GenericStakingModule;
  private token: ERC20;
  private vaultAddress: string;
  private tokenSource: SignerWithAddress;
  private admin: GenericStakingModule;
  private users: Record<string, GenericStakingModule>;
  private signers: Record<string, Signer>;
  private roles: Record<string, string>;
  private isSafetyModule: boolean;

  // Contract state.
  state: StakingState;

  constructor(
    ctx: TestContext,
    contract: GenericStakingModule,
    token: ERC20,
    vaultAddress: string,
    tokenSource: SignerWithAddress,
    admin: SignerWithAddress,
    users: SignerWithAddress[],
    isSafetyModule: boolean,
  ) {
    this.ctx = ctx;
    this.contract = contract;
    this.token = token;
    this.vaultAddress = vaultAddress;
    this.tokenSource = tokenSource;
    this.admin = contract.connect(admin);
    this.users = {};
    this.signers = {};
    this.roles = {};
    for (const signer of users) {
      this.users[signer.address] = contract.connect(signer);
      this.signers[signer.address] = signer;
    }
    this.isSafetyModule = isSafetyModule;
    this.state = this.makeInitialState();
  }

  // ============ Snapshots ============

  saveSnapshot(label: string): void {
    SNAPSHOTS[label] = _.cloneDeepWith(this.state, customCloner);
  }

  loadSnapshot(label: string): void {
    this.state = _.cloneDeepWith(SNAPSHOTS[label], customCloner);
  }

  // ============ Staked Token ============

  async mintAndApprove(account: string | SignerWithAddress, amount: BigNumberish): Promise<void> {
    const address = asAddress(account);
    const signer = this.signers[address];
    await this.token.connect(this.tokenSource).transfer(address, amount);
    await this.token.connect(signer).approve(this.contract.address, amount);
  }

  async approveContract(account: string | SignerWithAddress, amount: BigNumberish): Promise<void> {
    const address = asAddress(account);
    const signer = this.signers[address];
    await this.token.connect(signer).approve(this.contract.address, amount);
  }

  // ============ LS1Admin ============

  async setEpochParameters(interval: BigNumberish, offset: BigNumberish): Promise<void> {
    const shouldVerifyEpoch = await this.contract.hasEpochZeroStarted();

    // Get current epoch.
    let currentEpoch = -1;
    if (shouldVerifyEpoch) {
      currentEpoch = (await this.getCurrentEpoch()).toNumber();
    }

    await expect(this.admin.setEpochParameters(interval, offset))
      .to.emit(this.contract, 'EpochParametersChanged')
      .withArgs([interval, offset]);

    // Verify current epoch unchanged.
    if (shouldVerifyEpoch) {
      const newEpoch = (await this.getCurrentEpoch()).toNumber();
      expectEq(currentEpoch, newEpoch, 'setEpochParameters: epoch number changed');
    }

    // Check getters.
    const epochParameters = await this.contract.getEpochParameters();
    expectEq(epochParameters.interval, interval, 'setEpochParameters: interval');
    expectEq(epochParameters.offset, offset, 'setEpochParameters: offset');
  }

  async setBlackoutWindow(blackoutWindow: BigNumberish): Promise<void> {
    await expect(this.admin.setBlackoutWindow(blackoutWindow))
      .to.emit(this.contract, 'BlackoutWindowChanged')
      .withArgs(blackoutWindow);

    // Check getters.
    expectEq(await this.contract.getBlackoutWindow(), blackoutWindow, 'setBlackoutWindow');
  }

  async setRewardsPerSecond(emissionRate: BigNumberish): Promise<void> {
    await expect(this.admin.setRewardsPerSecond(emissionRate))
      .to.emit(this.contract, 'RewardsPerSecondUpdated')
      .withArgs(emissionRate);

    // Check getters.
    expectEq(await this.contract.getRewardsPerSecond(), emissionRate, 'setRewardsPerSecond');
  }

  async setBorrowerAllocations(allocations: Record<string, number>): Promise<void> {
    const addresses = Object.keys(allocations);
    const points = addresses.map((a) => {
      const pointAllocation = allocations[a] * BORROWING_TOTAL_ALLOCATION;
      if (pointAllocation !== Math.floor(pointAllocation)) {
        throw new Error('Borrower allocation can have at most 4 decimals of precision');
      }
      if (pointAllocation > BORROWING_TOTAL_ALLOCATION) {
        throw new Error('setBorrowerAllocations should be called with allocations as fractions');
      }
      return pointAllocation;
    });

    // Automatically set address(0) allocation to zero, if this is the first time setting allocations.
    if (!this.state.madeInitialAllocation && !addresses.includes(ZERO_ADDRESS)) {
      addresses.push(ZERO_ADDRESS);
      points.push(0);
    }

    await asLS(this.admin).setBorrowerAllocations(addresses, points);

    // Update state.
    this.state.madeInitialAllocation = true;

    // Verify borrower next allocations.
    for (let i = 0; i < addresses.length; i++) {
      const allocationNext = await asLS(this.contract).getAllocationFractionNextEpoch(addresses[i]);
      expectEq(allocationNext, points[i], `setBorrowerAllocations: allocationNext[${i}]`);
    }

    // If before epoch zero, verify borrower current allocations.
    if (!(await this.contract.hasEpochZeroStarted())) {
      for (let i = 0; i < addresses.length; i++) {
        const allocationCurrent = await asLS(this.contract).getAllocationFractionCurrentEpoch(
          addresses[i],
        );
        expectEq(allocationCurrent, points[i], `setBorrowerAllocations: allocationCurrent[${i}]`);
      }
    }

    // Verify total current and next allocations.
    const curZero = await asLS(this.contract).getAllocationFractionCurrentEpoch(ZERO_ADDRESS);
    const curSum = curZero.add(
      await this.sumByAddr((addr) => asLS(this.contract).getAllocationFractionCurrentEpoch(addr)),
    );
    expectEq(curSum, BORROWING_TOTAL_ALLOCATION, 'setBorrowerAllocations: curSum');
    const nextZero = await asLS(this.contract).getAllocationFractionNextEpoch(ZERO_ADDRESS);
    const nextSum = nextZero.add(
      await this.sumByAddr((addr) => asLS(this.contract).getAllocationFractionNextEpoch(addr)),
    );
    expectEq(nextSum, BORROWING_TOTAL_ALLOCATION, 'setBorrowerAllocations: nextSum');
  }

  async setBorrowingRestriction(
    borrower: string | SignerWithAddress,
    isRestricted: boolean,
  ): Promise<void> {
    const borrowerAddress = asAddress(borrower);
    const tx = await asLS(this.contract).setBorrowingRestriction(borrowerAddress, isRestricted);

    // Get previous status.
    const wasRestricted = await asLS(this.contract).isBorrowingRestrictedForBorrower(borrowerAddress);

    // If status changed, expect event.
    if (wasRestricted !== isRestricted) {
      await expect(tx)
        .to.emit(this.contract, 'BorrowingRestrictionChanged')
        .withArgs(borrowerAddress, isRestricted);
    }

    // Check new status.
    expect(await asLS(this.contract).isBorrowingRestrictedForBorrower(borrowerAddress)).to.be.equal(
      isRestricted,
      'setBorrowingRestriction',
    );
  }

  async addOperator(
    operator: string | SignerWithAddress,
    role: Role,
  ): Promise<void> {
    const address = asAddress(operator);
    const roleHash = getRole(role);
    await expect(this.contract.grantRole(roleHash, address))
      .to.emit(this.contract, 'RoleGranted')
      .withArgs(roleHash, address, await this.contract.signer.getAddress());

    expect(await this.contract.hasRole(roleHash, address)).to.be.true();
  }

  async removeOperator(
    operator: string | SignerWithAddress,
    role: Role,
  ): Promise<void> {
    const address = asAddress(operator);
    const roleHash = getRole(role);
    await expect(this.contract.revokeRole(roleHash, address))
      .to.emit(this.contract, 'RoleRevoked')
      .withArgs(roleHash, address, await this.contract.signer.getAddress());

    expect(await this.contract.hasRole(roleHash, address)).to.be.false();
  }

  // ============ LS1Staking ============

  async stake(
    account: string | SignerWithAddress,
    amount: BigNumberish,
    options: InvariantCheckOptions = {},
  ): Promise<void> {
    const address = asAddress(account);
    const signer = this.users[address];

    // Get new active balance.
    // const newActiveBalance = this.state.activeBalanceByStaker[address].current.add(amount);

    // Query ERC20 balance before.
    const stakerBalanceBefore = await this.token.balanceOf(address);
    const contractBalanceBefore = await this.token.balanceOf(this.contract.address);
    let stakeAmount = BigNumber.from(amount);

    if (this.isSafetyModule) {
      // Get amount after converting by exchange rate (if this is the safety module).
      const exchangeRate = await asSM(this.contract).getExchangeRate();
      const exchangeRateBase = await asSM(this.contract).EXCHANGE_RATE_BASE();

      stakeAmount = stakeAmount.mul(exchangeRate).div(exchangeRateBase);

      await expect(signer.stake(amount))
        .to.emit(this.contract, 'Staked')
        .withArgs(address, address, amount, stakeAmount);
    } else {
      await expect(signer.stake(amount))
        .to.emit(this.contract, 'Staked')
        .withArgs(address, address, amount);
    }

    // Update state.
    this.state.netDeposits = this.state.netDeposits.add(amount);
    await this.state.activeBalanceByStaker[address].increaseCurrentAndNext(stakeAmount);

    // Expect token transfer.
    const borrowerBalanceAfter = await this.token.balanceOf(address);
    const contractBalanceAfter = await this.token.balanceOf(this.contract.address);
    expectEq(
      contractBalanceAfter.sub(contractBalanceBefore),
      amount,
      'stake: Increase contract underlying staked token balance',
    );
    expectEq(
      stakerBalanceBefore.sub(borrowerBalanceAfter),
      amount,
      'stake: Decrease staker underlying staked token balance',
    );

    // Check getters.
    if (!options.skipInvariantChecks) {
      expectEq(
        await this.contract.getActiveBalanceCurrentEpoch(address),
        await this.state.activeBalanceByStaker[address].getCurrent(),
        `stake: current active balance ${address}`,
      );
    }

    // Check invariants.
    await this.checkInvariants(options);
  }

  async requestWithdrawal(
    account: string | SignerWithAddress,
    amount: BigNumberish,
    options: InvariantCheckOptions = {},
  ): Promise<void> {
    const address = asAddress(account);
    const signer = this.users[address];

    // Get new balances.
    // const newActiveBalance = this.state.activeBalanceByStaker[address].sub(amount);
    // const newInactiveBalance = this.state.inactiveBalanceByStaker[address].add(amount);

    await expect(signer.requestWithdrawal(amount))
      .to.emit(this.contract, 'WithdrawalRequested')
      .withArgs(address, amount);

    // Update state.
    await this.state.activeBalanceByStaker[address].decreaseNext(amount);
    await this.state.inactiveBalanceByStaker[address].increaseNext(amount);

    // Check getters.
    if (!options.skipInvariantChecks) {
      expectEq(
        await this.contract.getActiveBalanceNextEpoch(address),
        await this.state.activeBalanceByStaker[address].getNext(),
        `requestWithdrawal: next active balance ${address}`,
      );
      expectEqualExceptRounding(
        await this.contract.getInactiveBalanceNextEpoch(address),
        await this.state.inactiveBalanceByStaker[address].getNext(),
        options,
        `requestWithdrawal: next inactive balance ${address}`,
      );
    }

    // Update state and check invariants.
    await this.checkInvariants(options);
  }

  async withdrawStake(
    account: string | SignerWithAddress,
    recipient: string | SignerWithAddress,
    amount: BigNumberish,
    options: InvariantCheckOptions = {},
  ): Promise<void> {
    const address = asAddress(account);
    const recipientAddress = asAddress(recipient);
    const signer = this.users[address];

    // Get new balances.
    // const newInactiveBalance = this.state.inactiveBalanceByStaker[address].add(amount);

    // Query ERC20 balance before.
    const recipientBalanceBefore = await this.token.balanceOf(recipientAddress);
    const contractBalanceBefore = await this.token.balanceOf(this.contract.address);

    if (this.isSafetyModule) {
      await expect(signer.withdrawStake(recipientAddress, amount))
        .to.emit(this.contract, 'WithdrewStake')
        .withArgs(address, recipientAddress, amount, amount);
    } else {
      await expect(signer.withdrawStake(recipientAddress, amount))
        .to.emit(this.contract, 'WithdrewStake')
        .withArgs(address, recipientAddress, amount);
    }

    // Update state.
    this.state.netDeposits = this.state.netDeposits.sub(amount);
    await this.state.inactiveBalanceByStaker[address].decreaseCurrentAndNext(amount);

    // Expect token transfer.
    const recipientBalanceAfter = await this.token.balanceOf(recipientAddress);
    const contractBalanceAfter = await this.token.balanceOf(this.contract.address);
    expectEq(
      contractBalanceBefore.sub(contractBalanceAfter),
      amount,
      'withdrawStake: Decrease contract underlying staked token balance',
    );
    expectEq(
      recipientBalanceAfter.sub(recipientBalanceBefore),
      amount,
      'withdrawStake: Increase recipient underlying staked token balance',
    );

    // Check getters.
    if (!options.skipInvariantChecks) {
      expectEqualExceptRounding(
        await this.contract.getInactiveBalanceCurrentEpoch(address),
        await this.state.inactiveBalanceByStaker[address].getCurrent(),
        options,
        `withdrawStake: current inactive balance ${address}`,
      );
    }

    // Check invariants.
    await this.checkInvariants(options);
  }

  async withdrawMaxStake(
    account: string | SignerWithAddress,
    recipient: string | SignerWithAddress,
    options: InvariantCheckOptions = {},
  ): Promise<BigNumber> {
    const address = asAddress(account);
    const recipientAddress = asAddress(recipient);
    const signer = this.users[address];

    // Query ERC20 balance before.
    const recipientBalanceBefore = await this.token.balanceOf(recipientAddress);
    const contractBalanceBefore = await this.token.balanceOf(this.contract.address);

    // Get current stake user has available to withdraw.
    const amount = await this.contract.getStakeAvailableToWithdraw(address);
    let underlyingAmount = amount;

    if (this.isSafetyModule) {
      // Get underlyingAmount after converting by exchange rate (if this is the safety module).
      const exchangeRate = await asSM(this.contract).getExchangeRate();
      const exchangeRateBase = await asSM(this.contract).EXCHANGE_RATE_BASE();
      underlyingAmount = underlyingAmount.mul(exchangeRateBase).div(exchangeRate);

      await expect(signer.withdrawMaxStake(recipientAddress))
        .to.emit(this.contract, 'WithdrewStake')
        .withArgs(address, recipientAddress, underlyingAmount, amount);
    } else {
      await expect(signer.withdrawMaxStake(recipientAddress))
        .to.emit(this.contract, 'WithdrewStake')
        .withArgs(address, recipientAddress, underlyingAmount);
    }

    // Update state.
    this.state.netDeposits = this.state.netDeposits.sub(underlyingAmount);
    await this.state.inactiveBalanceByStaker[address].decreaseCurrentAndNext(amount);

    // Expect token transfer.
    const recipientBalanceAfter = await this.token.balanceOf(recipientAddress);
    const contractBalanceAfter = await this.token.balanceOf(this.contract.address);
    expectEq(
      contractBalanceBefore.sub(contractBalanceAfter),
      underlyingAmount,
      'withdrawStake: Decrease contract underlying staked token balance',
    );
    expectEq(
      recipientBalanceAfter.sub(recipientBalanceBefore),
      underlyingAmount,
      'withdrawStake: Increase recipient underlying staked token balance',
    );

    // Check getters.
    expectEq(
      await this.contract.getInactiveBalanceCurrentEpoch(address),
      await this.state.inactiveBalanceByStaker[address].getCurrent(),
      `withdrawStake: current inactive balance ${address}`,
    );

    // Check invariants.
    await this.checkInvariants(options);

    return amount;
  }

  async withdrawDebt(
    account: string | SignerWithAddress,
    recipient: string | SignerWithAddress,
    amount: BigNumberish,
    options: InvariantCheckOptions = {},
  ): Promise<void> {
    const address = asAddress(account);
    const recipientAddress = asAddress(recipient);
    const signer = this.users[address];

    // Get new balance.
    const newDebtBalance = this.state.debtBalanceByStaker[address].sub(amount);

    // Query ERC20 balance before.
    const recipientBalanceBefore = await this.token.balanceOf(recipientAddress);
    const contractBalanceBefore = await this.token.balanceOf(this.contract.address);

    await expect(asLS(signer).withdrawDebt(recipientAddress, amount))
      .to.emit(this.contract, 'WithdrewDebt')
      .withArgs(address, recipientAddress, amount, newDebtBalance);

    // Update state.
    this.state.netDebtDeposits = this.state.netDebtDeposits.sub(amount);
    this.state.debtBalanceByStaker[address] = newDebtBalance;

    // Expect token transfer.
    const recipientBalanceAfter = await this.token.balanceOf(recipientAddress);
    const contractBalanceAfter = await this.token.balanceOf(this.contract.address);
    expectEq(
      contractBalanceBefore.sub(contractBalanceAfter),
      amount,
      'withdrawStake: Decrease contract underlying staked token balance',
    );
    expectEq(
      recipientBalanceAfter.sub(recipientBalanceBefore),
      amount,
      'withdrawStake: Increase recipient underlying staked token balance',
    );

    // Check getters.
    expectEq(
      await asLS(this.contract).getStakerDebtBalance(address),
      this.state.debtBalanceByStaker[address],
      `withdrawStake: debt balance ${address}`,
    );

    // Update state and check invariants.
    await this.checkInvariants(options);
  }

  async withdrawMaxDebt(
    account: string | SignerWithAddress,
    recipient: string | SignerWithAddress,
    options: InvariantCheckOptions = {},
  ): Promise<void> {
    const address = asAddress(account);
    const recipientAddress = asAddress(recipient);
    const signer = this.users[address];

    // Get current debt staker has available to withdraw.
    const amount = await asLS(this.contract).getDebtAvailableToWithdraw(address);

    // Get new balance.
    const newDebtBalance = this.state.debtBalanceByStaker[address].sub(amount);

    // Query ERC20 balance before.
    const recipientBalanceBefore = await this.token.balanceOf(recipientAddress);
    const contractBalanceBefore = await this.token.balanceOf(this.contract.address);

    await expect(asLS(signer).withdrawMaxDebt(recipientAddress))
      .to.emit(this.contract, 'WithdrewDebt')
      .withArgs(address, recipientAddress, amount, newDebtBalance);

    // Update state.
    this.state.netDebtDeposits = this.state.netDebtDeposits.sub(amount);
    this.state.debtBalanceByStaker[address] = newDebtBalance;

    // Expect token transfer.
    const recipientBalanceAfter = await this.token.balanceOf(recipientAddress);
    const contractBalanceAfter = await this.token.balanceOf(this.contract.address);
    expectEq(
      contractBalanceBefore.sub(contractBalanceAfter),
      amount,
      'withdrawStake: Decrease contract underlying staked token balance',
    );
    expectEq(
      recipientBalanceAfter.sub(recipientBalanceBefore),
      amount,
      'withdrawStake: Increase recipient underlying staked token balance',
    );

    // Check getters.
    expectEq(
      await asLS(this.contract).getStakerDebtBalance(address),
      this.state.debtBalanceByStaker[address],
      `withdrawStake: debt balance ${address}`,
    );

    // Update state and check invariants.
    await this.checkInvariants(options);
  }

  // ============ Rewards ============

  async claimRewards(
    staker: string | SignerWithAddress,
    recipient: string | SignerWithAddress,
    startTimestamp: BigNumberish,
    endTimestamp: BigNumberish | null = null,
    stakerShare: number = 1,
    options: InvariantCheckOptions = {},
  ): Promise<BigNumber> {
    const stakerAddress = asAddress(staker);
    const recipientAddress = asAddress(recipient);
    const signer = this.users[stakerAddress];

    // Get initial ERC20 token balances.
    // const vaultBalanceBefore = await this.token.balanceOf(this.vault);
    // const recipientBalanceBefore = await this.token.balanceOf(recipientAddress);

    // Calculate the expected rewards.
    const rewardsRate = await this.contract.getRewardsPerSecond();
    const end = BigNumber.from(endTimestamp || await latestBlockTimestamp());
    const expectedRewards = new BNJS(end.sub(startTimestamp).mul(rewardsRate).toString()).times(stakerShare).toFixed(0);

    // Preview rewards.
    const claimable = await signer.callStatic.claimRewards(recipientAddress);
    expectEqualExceptRounding(
      claimable,
      expectedRewards,
      {
        ...options,
        roundingTolerance: rewardsRate.mul(2),
      },
      'claimRewards: callStatic claimable',
    );

    // Send transaction.
    const parsedLogs = await this.parseLogs(signer.claimRewards(recipientAddress));

    // Check logs.
    const logs = _.filter(parsedLogs, { name: 'ClaimedRewards' });
    expect(logs).to.have.length(1);
    const log = logs[0];
    expect(log.args[0]).to.be.equal(stakerAddress);
    expect(log.args[1]).to.be.equal(recipientAddress);
    expectEqualExceptRounding(
      log.args[2],
      expectedRewards,
      {
        ...options,
        roundingTolerance: rewardsRate.mul(2),
      },
      'claimRewards: logged rewards',
    );

    // Check changes in ERC20 token balances.
    // const vaultBalanceAfter = await this.token.balanceOf(this.vault);
    // const recipientBalanceAfter = await this.token.balanceOf(recipientAddress);
    // expectEq(vaultBalanceBefore.sub(vaultBalanceAfter), expectedRewards);
    // expectEq(recipientBalanceAfter.sub(recipientBalanceBefore), expectedRewards);

    return claimable;
  }

  // ============ LS1ERC20 ============

  async transfer(
    account: string | SignerWithAddress,
    recipient: string | SignerWithAddress,
    amount: BigNumberish,
    options: InvariantCheckOptions = {},
  ): Promise<void> {
    const address = asAddress(account);
    const recipientAddress = asAddress(recipient);
    const signer = this.users[address];

    await expect(signer.transfer(recipientAddress, amount))
      .to.emit(this.contract, 'Transfer')
      .withArgs(address, recipientAddress, amount);

    // check invariants.
    await this.checkInvariants(options);
  }

  async transferFrom(
    account: string | SignerWithAddress,
    sender: string | SignerWithAddress,
    recipient: string | SignerWithAddress,
    amount: BigNumberish,
    options: InvariantCheckOptions = {},
  ): Promise<void> {
    const address = asAddress(account);
    const senderAddress = asAddress(sender);
    const recipientAddress = asAddress(recipient);
    const signer = this.users[address];

    await expect(signer.transferFrom(senderAddress, recipientAddress, amount))
      .to.emit(this.contract, 'Transfer')
      .withArgs(senderAddress, recipientAddress, amount);

    // check invariants.
    await this.checkInvariants(options);
  }

  async approve(
    account: string | SignerWithAddress,
    spender: string | SignerWithAddress,
    amount: BigNumberish,
    options: InvariantCheckOptions = {},
  ): Promise<void> {
    const address = asAddress(account);
    const spenderAddress = asAddress(spender);
    const signer = this.users[address];

    await expect(signer.approve(spenderAddress, amount))
      .to.emit(this.contract, 'Approval')
      .withArgs(address, spenderAddress, amount);

    // check invariants.
    await this.checkInvariants(options);
  }

  // ============ LS1Borrowing ============

  async borrowViaProxy(
    borrower: StarkProxyV1,
    amount: BigNumberish,
    options: InvariantCheckOptions = {},
  ): Promise<void> {
    const address = asAddress(borrower.address);
    const sendTx = async (newBorrowedBalance: BigNumberish) => {
      await expect(borrower.borrow(amount))
        .to.emit(this.contract, 'Borrowed')
        .withArgs(address, amount, newBorrowedBalance);
    };
    return this._borrow(sendTx, address, amount, options);
  }

  async borrow(
    account: string | SignerWithAddress,
    amount: BigNumberish,
    options: InvariantCheckOptions = {},
  ): Promise<void> {
    const address = asAddress(account);
    const signer = this.users[address];
    const sendTx = async (newBorrowedBalance: BigNumberish) => {
      await expect(asLS(signer).borrow(amount))
        .to.emit(this.contract, 'Borrowed')
        .withArgs(address, amount, newBorrowedBalance);
    };
    return this._borrow(sendTx, address, amount, options);
  }

  async _borrow(
    sendTx: (newBorrowedBalance: BigNumberish) => Promise<void>,
    address: string,
    amount: BigNumberish,
    options: InvariantCheckOptions = {},
  ): Promise<void> {
    // Get new borrowed balance.
    const newBorrowedBalance = this.state.netBorrowedByBorrower[address].add(amount);

    // Query ERC20 balance before.
    const borrowerBalanceBefore = await this.token.balanceOf(address);
    const contractBalanceBefore = await this.token.balanceOf(this.contract.address);

    await sendTx(newBorrowedBalance);

    // Update state.
    this.state.netBorrowed = this.state.netBorrowed.add(amount);
    this.state.netBorrowedByBorrower[address] = newBorrowedBalance;

    // Expect token transfer.
    const borrowerBalanceAfter = await this.token.balanceOf(address);
    const contractBalanceAfter = await this.token.balanceOf(this.contract.address);
    expectEq(
      contractBalanceBefore.sub(contractBalanceAfter),
      amount,
      'borrow: Decrease contract underlying staked token balance',
    );
    expectEq(
      borrowerBalanceAfter.sub(borrowerBalanceBefore),
      amount,
      'borrow: Increase borrower underlying staked token balance',
    );

    // Check getters.
    expectEq(
      await asLS(this.contract).getBorrowedBalance(address),
      this.state.netBorrowedByBorrower[address],
      `borrow: net borrowed balance ${address}`,
    );

    // Check invariants.
    await this.checkInvariants(options);
  }

  async repayBorrowViaProxy(
    borrower: StarkProxyV1,
    amount: BigNumberish,
    options: InvariantCheckOptions = {},
  ): Promise<void> {
    const address = borrower.address;
    const sendTx = async (newBorrowerBalance: BigNumberish) => {
      await expect(borrower.repayBorrow(amount))
        .to.emit(this.contract, 'RepaidBorrow')
        .withArgs(address, address, amount, newBorrowerBalance);
    };
    return this._repayBorrow(sendTx, address, borrower.address, amount, options);
  }

  async repayBorrow(
    account: string | SignerWithAddress,
    borrower: string | SignerWithAddress,
    amount: BigNumberish,
    options: InvariantCheckOptions = {},
  ): Promise<void> {
    const address = asAddress(account);
    const borrowerAddress = asAddress(borrower);
    const signer = this.users[address];
    const sendTx = async (newBorrowerBalance: BigNumberish) => {
      await expect(asLS(signer).repayBorrow(borrowerAddress, amount))
        .to.emit(this.contract, 'RepaidBorrow')
        .withArgs(borrowerAddress, address, amount, newBorrowerBalance);
    };
    return this._repayBorrow(sendTx, address, borrower, amount, options);
  }

  async _repayBorrow(
    sendTx: (newBorrowedBalance: BigNumberish) => Promise<void>,
    address: string,
    borrower: string | SignerWithAddress,
    amount: BigNumberish,
    options: InvariantCheckOptions = {},
  ): Promise<void> {
    const borrowerAddress = asAddress(borrower);

    // Get new borrowed balance.
    const newBorrowedBalance = this.state.netBorrowedByBorrower[borrowerAddress].sub(amount);

    // Query balance before.
    const borrowerBalanceBefore = await this.token.balanceOf(address);
    const contractBalanceBefore = await this.token.balanceOf(this.contract.address);

    await sendTx(newBorrowedBalance);

    // Update state.
    this.state.netBorrowed = this.state.netDeposits.sub(amount);
    this.state.netBorrowedByBorrower[borrowerAddress] = newBorrowedBalance;

    // Expect token transfer.
    const borrowerBalanceAfter = await this.token.balanceOf(address);
    const contractBalanceAfter = await this.token.balanceOf(this.contract.address);
    expectEq(
      contractBalanceAfter.sub(contractBalanceBefore),
      amount,
      'repayBorrow: Increase contract balance',
    );
    expectEq(
      borrowerBalanceBefore.sub(borrowerBalanceAfter),
      amount,
      'repayBorrow: Decrease borrower balance',
    );

    // Check invariants.
    await this.checkInvariants(options);
  }

  async repayDebt(
    account: string | SignerWithAddress,
    borrower: string | SignerWithAddress,
    amount: BigNumberish,
    options: InvariantCheckOptions = {},
  ): Promise<void> {
    const address = asAddress(account);
    const borrowerAddress = asAddress(borrower);
    const signer = this.users[address];

    // Get new debt balance.
    const newDebtBalance = this.state.debtBalanceByBorrower[borrowerAddress].sub(amount);

    // Query balance before.
    const borrowerBalanceBefore = await this.token.balanceOf(address);
    const contractBalanceBefore = await this.token.balanceOf(this.contract.address);

    await expect(asLS(signer).repayDebt(borrowerAddress, amount))
      .to.emit(this.contract, 'RepaidDebt')
      .withArgs(borrowerAddress, address, amount, newDebtBalance);

    // Update state.
    this.state.netDebtDeposits = this.state.netDebtDeposits.add(amount);
    this.state.debtBalanceByBorrower[borrowerAddress] = newDebtBalance;

    // Expect token transfer.
    const borrowerBalanceAfter = await this.token.balanceOf(address);
    const contractBalanceAfter = await this.token.balanceOf(this.contract.address);
    expectEq(
      contractBalanceAfter.sub(contractBalanceBefore),
      amount,
      'repayDebt: Increase contract balance',
    );
    expectEq(
      borrowerBalanceBefore.sub(borrowerBalanceAfter),
      amount,
      'repayDebt: Decrease borrower balance',
    );

    // Check getters.
    expectEq(
      await asLS(this.contract).getTotalDebtAvailableToWithdraw(),
      this.state.netDebtDeposits,
      'repayDebt: netDebtDeposits',
    );

    // Check invariants.
    await this.checkInvariants(options);
  }

  // ============ StarkProxy ============

  async autoPay(
    borrower: StarkProxyV1,
    options: InvariantCheckOptions = {},
  ): Promise<[BigNumber, BigNumber, BigNumber]> {
    const [borrowed, repay, debt] = ((await borrower.callStatic.autoPayOrBorrow()) as unknown) as [
      BigNumber,
      BigNumber,
      BigNumber,
    ];
    const tx = await borrower.autoPayOrBorrow();
    const borrowedBalance = await asLS(this.contract).getBorrowedBalance(borrower.address);
    const debtBalance = await asLS(this.contract).getBorrowerDebtBalance(borrower.address);
    if (!borrowed.eq(0)) {
      await expect(tx).to.emit(borrower, 'Borrowed').withArgs(borrowed, borrowedBalance);
    }
    if (!repay.eq(0)) {
      await expect(tx).to.emit(borrower, 'RepaidBorrow').withArgs(repay, borrowedBalance, false);
    }
    if (!debt.eq(0)) {
      await expect(tx).to.emit(borrower, 'RepaidDebt').withArgs(debt, debtBalance, false);
    }

    // Update state.
    const address = borrower.address;
    const borrowDelta = borrowed.sub(repay);
    this.state.netBorrowed = this.state.netBorrowed.add(borrowDelta);
    this.state.netBorrowedByBorrower[address] = this.state.netBorrowedByBorrower[address].add(
      borrowDelta,
    );
    this.state.netDebtDeposits = this.state.netDebtDeposits.add(debt);
    this.state.debtBalanceByBorrower[address] = this.state.debtBalanceByBorrower[address].sub(debt);

    // Expect a second call to always return zeroes.
    const [
      borrowedAfter,
      repayAfter,
      debtAfter,
    ] = ((await borrower.callStatic.autoPayOrBorrow()) as unknown) as [
      BigNumber,
      BigNumber,
      BigNumber,
    ];
    expectEq(borrowedAfter, 0, 'autoPay: borrowedAfter');
    expectEq(repayAfter, 0, 'autoPay: repayAfter');
    expectEq(debtAfter, 0, 'autoPay: debtAfter');

    // Check invariants.
    await this.checkInvariants(options);

    return [borrowed, repay, debt];
  }

  // ============ LS1DebtAccounting ============

  async markDebt(
    borrowersWithExpectedDebts: Record<string, BigNumberish>,
    newlyRestrictedBorrowers: (string | SignerWithAddress)[],
    expectedIndex: number,
    options: InvariantCheckOptions = {},
  ): Promise<void> {
    const borrowers = Object.keys(borrowersWithExpectedDebts);
    const tx = await asLS(this.contract).markDebt(borrowers);
    const parsedLogs = await this.parseLogs(tx);

    // Check debt marked logs.
    const debtMarked = _.filter(parsedLogs, { name: 'DebtMarked' });
    const newDebtByBorrower = _.chain(debtMarked)
      .map('args')
      .mapKeys(0) // borrower
      .mapValues(1) // amount
      .value();
    for (let i = 0; i < borrowers.length; i++) {
      const borrower = borrowers[i];
      const expectedDebt = borrowersWithExpectedDebts[borrower];

      if (BigNumber.from(expectedDebt).isZero()) {
        expect(borrower in newDebtByBorrower, 'markDebt: Expected no debt').to.be.false();
      } else {
        const loggedDebt = newDebtByBorrower[borrower];
        expectEq(loggedDebt, expectedDebt, `markDebt: ${borrower} loggedDebt ≠ expectedDebt`);
      }
    }

    // Check slashed inactive balances log.
    const slashedInactive = _.filter(parsedLogs, { name: 'ConvertedInactiveBalancesToDebt' });
    expect(slashedInactive).to.have.length(1, 'markDebt: Converted inactive balances log');
    const newDebtSum = _.sumBy(_.values(newDebtByBorrower), (x) => x.toNumber());
    const slashedLogArgs: [BigNumber, BigNumber, BigNumber] = slashedInactive[0].args as [
      BigNumber,
      BigNumber,
      BigNumber,
    ];
    const slashedAmount = slashedLogArgs[0];
    expectEq(slashedAmount, newDebtSum, 'markDebt: slashedAmount ≠ newDebtSum');
    const expectedIndexInt = SHORTFALL_INDEX_BASE.times(expectedIndex).toFixed(0, BNJS.ROUND_FLOOR);
    expectEq(slashedLogArgs[1], expectedIndexInt, 'markDebt: expectedIndex');

    // Check borrower restricted logs.
    const restricted = _.filter(parsedLogs, { name: 'BorrowingRestrictionChanged' });
    expect(restricted).to.have.length(
      newlyRestrictedBorrowers.length,
      'markDebt: Number of restricted borrowers',
    );
    const newlyRestrictedBorrowersAddresses = newlyRestrictedBorrowers.map(asAddress);
    for (const restrictedLog of restricted) {
      const [restrictedBorrower, isRestricted] = restrictedLog.args;
      expect(newlyRestrictedBorrowersAddresses).to.contain(
        restrictedBorrower,
        `markDebt: Unexpected restricted borrower ${restrictedBorrower}`,
      );
      expect(isRestricted, 'markDebt: isRestricted').to.be.true();

      // Check getters.
      expect(await asLS(this.contract).isBorrowingRestrictedForBorrower(restrictedBorrower)).to.be.true();
    }

    // Update state and check invariants.
    this.state.netDeposits = this.state.netDeposits.sub(newDebtSum);
    _.forEach(borrowersWithExpectedDebts, (newDebt, borrower) => {
      this.state.debtBalanceByBorrower[borrower] = this.state.debtBalanceByBorrower[borrower].add(
        newDebt,
      );
      this.state.netBorrowedByBorrower[borrower] = this.state.netBorrowedByBorrower[borrower].sub(
        newDebt,
      );
    });
    await Promise.all(
      _.map(this.state.inactiveBalanceByStaker, async (balance, address) => {
        // Hacky...
        if (typeof address !== 'string' || address.slice(0, 2) != '0x') {
          return;
        }

        const oldBalance = await balance.getCurrent();
        const newBalance = BigNumber.from(Math.floor(oldBalance.toNumber() * expectedIndex));
        const debtAmount = oldBalance.sub(newBalance);
        await balance.decreaseCurrentAndNext(debtAmount);

        if (!debtAmount.isZero()) {
          this.state.debtBalanceByStaker[address] = this.state.debtBalanceByStaker[address].add(
            debtAmount,
          );
        }
      }),
    );
    await this.checkInvariants(options);

    // Verify that markDebt can't be called again.
    await this.expectNoShortfall();
  }

  async expectNoShortfall(): Promise<void> {
    await expect(asLS(this.contract).markDebt([])).to.be.revertedWith('LS1DebtAccounting: No shortfall');
  }

  // ============ LS1Operators ============

  async decreaseStakerDebt(
    debtOperator: string | SignerWithAddress,
    staker: string | SignerWithAddress,
    amount: BigNumberish,
    options: InvariantCheckOptions = {},
  ): Promise<void> {
    const debtOperatorAddress = asAddress(debtOperator);
    const signer = this.users[debtOperatorAddress];
    const stakerAddress = asAddress(staker);

    // Get new balance.
    const newDebtBalance = this.state.debtBalanceByStaker[stakerAddress].sub(amount);

    await expect(asLS(signer).decreaseStakerDebt(stakerAddress, amount))
      .to.emit(this.contract, 'OperatorDecreasedStakerDebt')
      .withArgs(stakerAddress, amount, newDebtBalance, debtOperatorAddress);

    // Update state.
    this.state.debtBalanceByStaker[stakerAddress] = newDebtBalance;

    // Check getters.
    expectEq(
      await asLS(this.contract).getStakerDebtBalance(stakerAddress),
      this.state.debtBalanceByStaker[stakerAddress],
      `repayDebt: debtBalanceByStaker ${stakerAddress}`,
    );

    // Check invariants.
    await this.checkInvariants(options);
  }

  async decreaseBorrowerDebt(
    debtOperator: string | SignerWithAddress,
    borrower: string | SignerWithAddress,
    amount: BigNumberish,
    options: InvariantCheckOptions = {},
  ): Promise<void> {
    const debtOperatorAddress = asAddress(debtOperator);
    const signer = this.users[debtOperatorAddress];
    const borrowerAddress = asAddress(borrower);

    // Get new balance.
    const newDebtBalance = this.state.debtBalanceByBorrower[borrowerAddress].sub(amount);

    await expect(asLS(signer).decreaseBorrowerDebt(borrowerAddress, amount))
      .to.emit(this.contract, 'OperatorDecreasedBorrowerDebt')
      .withArgs(borrowerAddress, amount, newDebtBalance, debtOperatorAddress);

    // Update state.
    this.state.debtBalanceByBorrower[borrowerAddress] = newDebtBalance;

    // Check getters.
    expectEq(
      await asLS(this.contract).getBorrowerDebtBalance(borrowerAddress),
      this.state.debtBalanceByBorrower[borrowerAddress],
      `repayDebt: debtBalanceByBorrower ${borrowerAddress}`,
    );

    // Check invariants.
    await this.checkInvariants(options);
  }

  // ============ State-Changing Helpers ============

  /**
   * Borrow an amount and expect it to be the max borrowable amount.
   */
  async fullBorrowViaProxy(
    borrower: StarkProxyV1,
    amount: BigNumberish,
    options: InvariantCheckOptions = {},
  ): Promise<void> {
    expect(await asLS(this.contract).getBorrowableAmount(borrower.address)).to.equal(amount);
    await this.borrowViaProxy(borrower, amount, options);
    // Could be either of the following:
    // - LS1Staking: Borrow amount exceeds stake amount available in the contract
    // - LS1Borrowing: Amount > allocated
    await expect(this.borrow(borrower.address, 1)).to.be.revertedWith('LS1');
  }

  /**
   * Borrow an amount and expect it to be the max borrowable amount.
   */
  async fullBorrow(
    borrower: SignerWithAddress,
    amount: BigNumberish,
    options: InvariantCheckOptions = {},
  ): Promise<void> {
    expect(await asLS(this.contract).getBorrowableAmount(borrower.address)).to.equal(amount);

    if (BigNumber.from(amount).isZero()) {
      await expect(this.borrow(borrower, amount, options)).to.be.revertedWith('LS1Borrowing: Cannot borrow zero');
    } else {
      await this.borrow(borrower, amount, options);
    }

    // Could be either of the following:
    // - LS1Staking: Borrow amount exceeds stake amount available in the contract
    // - LS1Borrowing: Amount > allocated
    await expect(this.borrow(borrower, 1)).to.be.revertedWith('LS1');
  }

  /**
   * Repay a borrower debt and expect it to be the full amount.
   */
  async fullRepayDebt(
    borrower: SignerWithAddress,
    amount: BigNumberish,
    options: InvariantCheckOptions = {},
  ): Promise<void> {
    expect(await asLS(this.contract).getBorrowerDebtBalance(borrower.address)).to.equal(amount);
    await this.repayDebt(borrower, borrower, amount, options);
    await expect(this.repayDebt(borrower, borrower, 1)).to.be.revertedWith(
      'LS1Borrowing: Repay > debt',
    );
  }

  /**
   * Withdraw a staker and expect it to be the full withdrawable amount.
   */
  async fullWithdrawStake(
    staker: SignerWithAddress,
    amount: BigNumberish,
    options: InvariantCheckOptions = {},
  ): Promise<void> {
    expectEq(
      await this.contract.getStakeAvailableToWithdraw(staker.address),
      amount,
      'fullWithdrawStake: actual available vs. expected available',
    );
    await this.withdrawStake(staker, staker, amount, options);
    // Note: Withdrawing `1` will still sometimes succeed, depending on rounding.
    await expect(this.withdrawStake(staker, staker, 2)).to.be.reverted;
  }

  /**
   * Withdraw a staker debt and expect it to be the full withdrawable amount.
   */
  async fullWithdrawDebt(
    staker: SignerWithAddress,
    amount: BigNumberish,
    options: InvariantCheckOptions = {},
  ): Promise<void> {
    // Calculate available amount ourselves.
    const contractAvailable = await asLS(this.contract).getTotalDebtAvailableToWithdraw();
    const stakerAvailable = await asLS(this.contract).getStakerDebtBalance(staker.address);
    const available = contractAvailable.lt(stakerAvailable) ? contractAvailable : stakerAvailable;

    // Compare with smart contract calculation.
    expectEq(
      await asLS(this.contract).getDebtAvailableToWithdraw(staker.address),
      available,
      'fullWithdrawalDebt: actual available vs. expected available',
    );

    // Compare with amount, and expect exactly that amount to be withdrawable.
    expectEq(available, amount, 'fullWithdrawDebt: available vs. amount');
    await this.withdrawDebt(staker, staker, amount, options);
    await expect(this.withdrawDebt(staker, staker, 1)).to.be.revertedWith('LS1Staking');
  }

  // ============ Other ============

  async getCurrentEpoch(): Promise<BigNumber> {
    const currentEpoch = await this.contract.getCurrentEpoch();
    expectGte(currentEpoch, this.state.lastCurrentEpoch, 'Current epoch went backwards');
    this.state.lastCurrentEpoch = currentEpoch;
    return currentEpoch;
  }

  async checkInvariants(options: InvariantCheckOptions = {}): Promise<void> {
    if (options.skipInvariantChecks || !CHECK_INVARIANTS) {
      return;
    }

    // Skip this check if testing safety module.
    let availableDebt: BigNumber;
    if (!this.isSafetyModule) {
      // Staked balance accounting; let X = Deposits - Stake Withdrawals - Debt Conversions; then...
      //
      // X = Total Borrowed + Contract Balance – Debt Available to Withdraw – Naked ERC20 Transfers In
      const borrowed = await asLS(this.contract).getTotalBorrowedBalance();
      const balance = await this.token.balanceOf(this.contract.address);
      availableDebt = await asLS(this.contract).getTotalDebtAvailableToWithdraw();
      expectEq(
        borrowed.add(balance).sub(availableDebt),
        this.state.netDeposits,
        'Invariant: netDeposits',
      );
    }

    // X = Next Total Active + Next Total Inactive
    const totalActiveNext = await this.contract.getTotalActiveBalanceNextEpoch();
    const totalInactiveNext = await this.contract.getTotalInactiveBalanceNextEpoch();
    const activePlusInactiveNext = totalActiveNext.add(totalInactiveNext);
    expectEq(activePlusInactiveNext, this.state.netDeposits, 'Invariant: activePlusInactiveNext');
    //
    // X = Current Total Active + Current Total Inactive
    const totalActiveCur = await this.contract.getTotalActiveBalanceCurrentEpoch();
    const totalInactiveCur = await this.contract.getTotalInactiveBalanceCurrentEpoch();
    const activePlusInactiveCur = totalActiveCur.add(totalInactiveCur);
    expectEq(activePlusInactiveCur, this.state.netDeposits, 'Invariant: activePlusInactiveCur');

    // Active balance accounting
    //
    // Total Current Active = ∑ User Current Active
    const userActiveCur = await this.sumByAddr((addr) =>
      this.contract.getActiveBalanceCurrentEpoch(addr),
    );
    const userActiveLocalCur = await this.sumByAddr((addr) => {
      return this.state.activeBalanceByStaker[addr].getCurrent();
    });
    expectEq(userActiveCur, totalActiveCur, 'Invariant: userActiveCur');
    expectEq(userActiveLocalCur, totalActiveCur, 'Invariant: userActiveLocalCur');
    //
    // Total Next Active = ∑ User Next Active
    const userActiveNext = await this.sumByAddr((addr) =>
      this.contract.getActiveBalanceNextEpoch(addr),
    );
    const userActiveLocalNext = await this.sumByAddr((addr) => {
      return this.state.activeBalanceByStaker[addr].getNext();
    });
    expectEq(userActiveNext, totalActiveNext, 'Invariant: userActiveNext');
    expectEq(userActiveLocalNext, totalActiveNext, 'Invariant: userActiveLocalNext');

    // Inactive balance accounting
    //
    // Total Current Inactive ≈ ∑ User Current Inactive
    // Total Current Inactive ≥ ∑ User Current Inactive
    const userInactiveCur = await this.sumByAddr((addr) => {
      return this.contract.getInactiveBalanceCurrentEpoch(addr);
    });
    const userInactiveLocalCur = await this.sumByAddr((addr) => {
      return this.state.inactiveBalanceByStaker[addr].getCurrent();
    });
    expectGte(totalInactiveCur, userInactiveCur, 'Invariant: userInactiveCur');
    expectEqualExceptRounding(
      totalInactiveCur,
      userInactiveCur,
      options,
      'Invariant: userInactiveCur',
    );
    expectEq(userInactiveLocalCur, userInactiveCur, 'Invariant: userInactiveLocalCur');

    // Exit early if testing the safety module.
    if (this.isSafetyModule) {
      return;
    }

    // Debt accounting
    //
    // Total Borrower Debt = ∑ Borrower Debt
    // Total Borrower Debt ≈ (∑ Staker Debt) - Debt Available to Withdraw
    const totalBorrowerDebt = await asLS(this.contract).getTotalBorrowerDebtBalance();
    const borrowerDebt = await this.sumByAddr((addr) => asLS(this.contract).getBorrowerDebtBalance(addr));
    expectEq(totalBorrowerDebt, borrowerDebt, 'Invariant: borrowerDebt');
    // This invariant is violated if the debt operator was used to adjust balances unequally.
    if (!options.skipStakerVsBorrowerDebtComparison) {
      const stakerDebt = await this.sumByAddr((addr) => {
        return asLS(this.contract).getStakerDebtBalance(addr);
      });
      const totalBorrowerDebtAndAvailableToWithdraw = totalBorrowerDebt.add(availableDebt!);
      expectEqualExceptRounding(
        totalBorrowerDebtAndAvailableToWithdraw,
        stakerDebt,
        options,
        'Invariant: stakerDebt',
      );
    }

    // Debt available to withdraw.
    const availableToWithdraw = await asLS(this.contract).getTotalDebtAvailableToWithdraw();
    expectEq(this.state.netDebtDeposits, availableToWithdraw, 'Invariant: availableToWithdraw');
  }

  async elapseEpochWithExpectedBalanceUpdates(
    checkActiveBalanceUpdates: Record<string, [BigNumberish, BigNumberish]>,
    checkInactiveBalanceUpdates: Record<string, [BigNumberish, BigNumberish]>,
    options: InvariantCheckOptions = {},
  ): Promise<void> {
    // Get current epoch.
    const currentEpoch = (await this.getCurrentEpoch()).toNumber();

    // Check current balances before.
    await Promise.all(
      _.map(checkActiveBalanceUpdates, async (values, address) => {
        expectEq(
          await this.contract.getActiveBalanceCurrentEpoch(address),
          values[0],
          `elapseEpoch(${currentEpoch} -> ${
            currentEpoch + 1
          }): Current active balance before ${address}`,
        );
      }),
    );
    await Promise.all(
      _.map(checkInactiveBalanceUpdates, async (values, address) => {
        expectEq(
          await this.contract.getInactiveBalanceCurrentEpoch(address),
          values[0],
          `elapseEpoch(${currentEpoch} -> ${
            currentEpoch + 1
          }): Current inactive balance before ${address}`,
        );
      }),
    );
    const sumCurrentActiveBefore = _.chain(checkActiveBalanceUpdates)
      .values()
      .sumBy((x) => BigNumber.from(x[0]).toNumber()) // Before.
      .value();
    const sumCurrentInactiveBefore = _.chain(checkInactiveBalanceUpdates)
      .values()
      .sumBy((x) => BigNumber.from(x[0]).toNumber()) // Before.
      .value();
    expectEq(
      await this.contract.getTotalActiveBalanceCurrentEpoch(),
      sumCurrentActiveBefore,
      `elapseEpoch(${currentEpoch} -> ${currentEpoch + 1}): Total current active balance before`,
    );
    expectEqualExceptRounding(
      await this.contract.getTotalInactiveBalanceCurrentEpoch(),
      sumCurrentInactiveBefore,
      options,
      `elapseEpoch(${currentEpoch} -> ${currentEpoch + 1}): Total current inactive balance before`,
    );

    // Check next balances before.
    await Promise.all(
      _.map(checkActiveBalanceUpdates, async (values, address) => {
        expectEq(
          await this.contract.getActiveBalanceNextEpoch(address),
          values[1],
          `elapseEpoch(${currentEpoch} -> ${
            currentEpoch + 1
          }): Next active balance before ${address}`,
        );
      }),
    );
    await Promise.all(
      _.map(checkInactiveBalanceUpdates, async (values, address) => {
        expectEq(
          await this.contract.getInactiveBalanceNextEpoch(address),
          values[1],
          `elapseEpoch(${currentEpoch} -> ${
            currentEpoch + 1
          }): Next inactive balance before ${address}`,
        );
      }),
    );
    const sumNextActiveBefore = _.chain(checkActiveBalanceUpdates)
      .values()
      .sumBy((x) => BigNumber.from(x[1]).toNumber()) // Before.
      .value();
    const sumNextInactiveBefore = _.chain(checkInactiveBalanceUpdates)
      .values()
      .sumBy((x) => BigNumber.from(x[1]).toNumber()) // Before.
      .value();
    expectEq(
      await this.contract.getTotalActiveBalanceNextEpoch(),
      sumNextActiveBefore,
      `elapseEpoch(${currentEpoch} -> ${currentEpoch + 1}): Total next active balance before`,
    );
    expectEqualExceptRounding(
      await this.contract.getTotalInactiveBalanceNextEpoch(),
      sumNextInactiveBefore,
      options,
      `elapseEpoch(${currentEpoch} -> ${currentEpoch + 1}): Total next inactive balance before`,
    );

    await this.elapseEpoch();
    expectEq(await this.getCurrentEpoch(), currentEpoch + 1, 'elaspeEpoch: next epoch number');

    // Check current and next balances after.
    await Promise.all(
      _.map(checkActiveBalanceUpdates, async (values, address) => {
        expectEq(
          await this.contract.getActiveBalanceCurrentEpoch(address),
          values[1],
          `elapseEpoch(${currentEpoch} -> ${
            currentEpoch + 1
          }): Current active balance after ${address}`,
        );
        expectEq(
          await this.contract.getActiveBalanceNextEpoch(address),
          values[1],
          `elapseEpoch(${currentEpoch} -> ${
            currentEpoch + 1
          }): Next active balance after ${address}`,
        );
      }),
    );
    await Promise.all(
      _.map(checkInactiveBalanceUpdates, async (values, address) => {
        expectEq(
          await this.contract.getInactiveBalanceCurrentEpoch(address),
          values[1],
          `elapseEpoch(${currentEpoch} -> ${
            currentEpoch + 1
          }): Current inactive balance after ${address}`,
        );
        expectEq(
          await this.contract.getInactiveBalanceNextEpoch(address),
          values[1],
          `elapseEpoch(${currentEpoch} -> ${
            currentEpoch + 1
          }): Next inactive balance after ${address}`,
        );
      }),
    );
    const sumActiveAfter = _.chain(checkActiveBalanceUpdates)
      .values()
      .sumBy((x) => BigNumber.from(x[1]).toNumber()) // After.
      .value();
    const sumInactiveAfter = _.chain(checkInactiveBalanceUpdates)
      .values()
      .sumBy((x) => BigNumber.from(x[1]).toNumber()) // After.
      .value();
    expectEq(
      await this.contract.getTotalActiveBalanceCurrentEpoch(),
      sumActiveAfter,
      `elapseEpoch(${currentEpoch} -> ${currentEpoch + 1}): Total current inactive balance after`,
    );
    expectEq(
      await this.contract.getTotalActiveBalanceNextEpoch(),
      sumActiveAfter,
      `elapseEpoch(${currentEpoch} -> ${currentEpoch + 1}): Total current inactive balance after`,
    );
    expectEqualExceptRounding(
      await this.contract.getTotalInactiveBalanceCurrentEpoch(),
      sumInactiveAfter,
      options,
      `elapseEpoch(${currentEpoch} -> ${currentEpoch + 1}): Total next inactive balance after`,
    );
    expectEqualExceptRounding(
      await this.contract.getTotalInactiveBalanceNextEpoch(),
      sumInactiveAfter,
      options,
      `elapseEpoch(${currentEpoch} -> ${currentEpoch + 1}): Total next inactive balance after`,
    );
  }

  async expectStakerDebt(expectedDebtByStaker: Record<string, BigNumberish>): Promise<void> {
    await Promise.all(
      _.map(expectedDebtByStaker, async (value, address) => {
        expectEq(
          await asLS(this.contract).getStakerDebtBalance(address),
          value,
          `expectStakerDebt: ${address}`,
        );
      }),
    );
  }

  async expectBorrowerDebt(expectedDebtByBorrower: Record<string, BigNumberish>): Promise<void> {
    await Promise.all(
      _.map(expectedDebtByBorrower, async (value, address) => {
        expectEq(
          await asLS(this.contract).getBorrowerDebtBalance(address),
          value,
          `expectBorrowerDebt: ${address}`,
        );
      }),
    );
  }

  async elapseEpoch(): Promise<void> {
    const remaining = await this.contract.getTimeRemainingInCurrentEpoch();
    if (remaining.eq(0)) {
      await increaseTimeAndMine(this.ctx.config.EPOCH_LENGTH);
    } else {
      await increaseTimeAndMine(remaining.toNumber());
    }
  }

  reset(): void {
    this.state = this.makeInitialState();
  }

  private makeInitialState(): StakingState {
    return {
      lastCurrentEpoch: BigNumber.from(0),
      netDeposits: BigNumber.from(0),
      netDebtDeposits: BigNumber.from(0),
      netBorrowed: BigNumber.from(0),
      netBorrowedByBorrower: defaultAddrMapping(() => BigNumber.from(0)),
      debtBalanceByBorrower: defaultAddrMapping(() => BigNumber.from(0)),
      debtBalanceByStaker: defaultAddrMapping(() => BigNumber.from(0)),
      madeInitialAllocation: false,
      activeBalanceByStaker: defaultAddrMapping((addr) => {
        const label = `${addr.slice(0, 6)} active  `;
        return new StoredBalance(this.contract, label);
      }),
      inactiveBalanceByStaker: defaultAddrMapping((addr) => {
        const label = `${addr.slice(0, 6)} inactive`;
        return new StoredBalance(this.contract, label);
      }),
    };
  }

  private async parseLogs(
    tx: ContractTransaction | Promise<ContractTransaction>,
  ): Promise<LogDescription[]> {
    const result = await (await tx).wait();
    return result.logs
      .filter((log) => log.address === this.contract.address)
      .map((log) => this.contract.interface.parseLog(log));
  }

  private sumByAddr(mapFn: (addr: string) => BigNumber | Promise<BigNumber>): Promise<BigNumber> {
    return bnSumReduce(Object.keys(this.users), mapFn);
  }
}

function asAddress(
  account: string | SignerWithAddress,
): string {
  if (typeof account == 'string') {
    return account;
  }
  return account.address;
}

async function bnSumReduce<T>(
  values: T[],
  mapFn: (arg: T) => BigNumber | Promise<BigNumber>,
): Promise<BigNumber> {
  let sum = BigNumber.from(0);
  for (const value of values) {
    sum = sum.add(await mapFn(value));
  }
  return sum;
}

function expectEqualExceptRounding(
  a: BigNumberish,
  b: BigNumberish,
  options: InvariantCheckOptions,
  message?: string,
): void {
  const tolerance = options.roundingTolerance || 0;
  const error = BigNumber.from(a).sub(b).abs();
  const msg = `${message || ''}: ${a} ≠ ${b} (tolerance: ${tolerance})`;
  const pass = error.lte(tolerance);
  if (!pass) {
    // Note: Have had some trouble getting chai to always print the message.
    console.error(msg);
  }
  expect(pass, msg).to.be.true();
}

function expectEq(a: BigNumberish, b: BigNumberish, message?: string): void {
  const msg = `${message || ''}: ${a} ≠ ${b}`;
  const pass = BigNumber.from(a).eq(b);
  if (!pass) {
    // Note: Have had some trouble getting chai to always print the message.
    console.error(msg);
  }
  expect(pass, msg).to.be.true();
}

function expectGte(a: BigNumberish, b: BigNumberish, message?: string): void {
  expect(BigNumber.from(a).gte(b), `${message || ''}: ${a} < ${b}`).to.be.true();
}
