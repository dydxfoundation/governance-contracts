import { BigNumber, BigNumberish } from 'ethers';
import { makeSuite, TestEnv } from '../helpers/make-suite';
import {
  timeLatest,
  evmSnapshot,
  evmRevert,
  increaseTime,
  increaseTimeAndMine,
} from '../../helpers/misc-utils';
import { BLACKOUT_WINDOW, EPOCH_LENGTH } from '../../helpers/constants';
import { LiquidityStakingHelper } from '../helpers/liquidity-staking-helper';
import { SignerWithAddress } from '../helpers/make-suite';
import { LiquidityStakingV1 } from '../../types/LiquidityStakingV1';
import { MockStakedToken } from '../../types/MockStakedToken';
import { MintableErc20 } from '../../types/MintableErc20';
import { expect } from 'chai';
import { StarkProxyV1 } from '../../types/StarkProxyV1';

// Snapshots
const snapshots = new Map<string, string>();
const fundsStakedSnapshot = 'FundsStaked';
const borrowerHasBorrowed = 'BorrowerHasBorrowed';
const borrowerAmountDue = 'BorrowerAmountDue';
const borrowerRestrictedSnapshot = 'BorrowerRestrictedSnapshot';

const stakerInitialBalance: number = 1_000_000;

makeSuite('LS1Exchange', (testEnv: TestEnv) => {
  // Contracts.
  let deployer: SignerWithAddress;
  let rewardsVault: SignerWithAddress;
  let liquidityStakingV1: LiquidityStakingV1;
  let mockStakedToken: MockStakedToken;
  let dydxToken: MintableErc20;

  // Users.
  let stakers: SignerWithAddress[];
  let borrowers: StarkProxyV1[];

  let distributionStart: number;
  let distributionEnd: number;
  let expectedAllocations: number[];

  let contract: LiquidityStakingHelper;

  before(async () => {
    liquidityStakingV1 = testEnv.liquidityStakingV1;
    mockStakedToken = testEnv.mockStakedToken;
    dydxToken = testEnv.dydxToken;
    rewardsVault = testEnv.rewardsVault;
    deployer = testEnv.deployer;

    // Users.
    stakers = testEnv.users.slice(1, 3); // 2 stakers
    borrowers = testEnv.starkProxyV1Borrowers;

    distributionStart = (await liquidityStakingV1.DISTRIBUTION_START()).toNumber();
    distributionEnd = (await liquidityStakingV1.DISTRIBUTION_END()).toNumber();

    // Use helper class to automatically check contract invariants after every update.
    contract = new LiquidityStakingHelper(
      liquidityStakingV1,
      mockStakedToken,
      testEnv.rewardsVault,
      deployer,
      stakers.concat(borrowers)
    );

    // Mint staked tokens and set allowances.
    await Promise.all(stakers.map((s) => contract.mintAndApprove(s, stakerInitialBalance)));
    await Promise.all(borrowers.map((b) => contract.approveContract(b, stakerInitialBalance)));

    // Initial stake of 1M.
    await incrementTimeToTimestamp(distributionStart);
    await contract.stake(stakers[0], stakerInitialBalance / 4);
    await contract.stake(stakers[1], (stakerInitialBalance / 4) * 3);
    saveSnapshot(fundsStakedSnapshot);
  });

  describe('Borrower, after borrowing funds', () => {
    before(async () => {
      await loadSnapshot(fundsStakedSnapshot);

      // Allocations: [40%, 60%]
      await contract.setBorrowerAllocations({
        [borrowers[0].address]: 0.4,
        [borrowers[1].address]: 0.6,
      });
      expectedAllocations = [stakerInitialBalance * 0.4, stakerInitialBalance * 0.6];

      // Borrow full amount.
      await contract.elapseEpoch();
      await contract.fullBorrowViaProxy(borrowers[0], stakerInitialBalance * 0.4);
      expect(await mockStakedToken.balanceOf(borrowers[0].address)).to.equal(
        stakerInitialBalance * 0.4
      );

      await saveSnapshot(borrowerHasBorrowed);
    });

    describe('interacting with the exchange', () => {
      beforeEach(async () => {
        await loadSnapshot(borrowerHasBorrowed);
      });

      it('can register an allowed STARK key', async () => {
        const starkKey = 123;
        await borrowers[0].allowStarkKey(starkKey);
        await borrowers[0].registerUserOnExchange(starkKey, []);
      });

      it('cannot register STARK key that has not been explicitly allowed', async () => {
        const starkKey = 123;
        await expect(borrowers[0].registerUserOnExchange(starkKey, [])).to.be.revertedWith(
          'SP1Storage: STARK key is not on the allowlist'
        );
      });

      it('cannot register STARK key that has not been disallowed', async () => {
        const starkKey = 123;
        await borrowers[0].allowStarkKey(starkKey);
        await borrowers[0].disallowStarkKey(starkKey);
        await expect(borrowers[0].registerUserOnExchange(starkKey, [])).to.be.revertedWith(
          'SP1Storage: STARK key is not on the allowlist'
        );
      });

      it('can deposit and withdraw, and then repay', async () => {
        const starkKey = 123;
        await borrowers[0].allowStarkKey(starkKey);
        await borrowers[0].depositToExchange(starkKey, 456, 789, stakerInitialBalance * 0.4);
        await borrowers[0].withdrawFromExchange(starkKey, 456);
        await contract.repayLoanViaProxy(borrowers[0], stakerInitialBalance * 0.4);
      });
    });

    describe('after restricted by guardian', () => {
      before(async () => {
        await loadSnapshot(borrowerHasBorrowed);
        await expect(
          borrowers[0].connect(testEnv.guardian.signer).guardianSetBorrowingRestriction(true)
        )
          .to.emit(borrowers[0], 'BorrowingRestrictionChanged')
          .withArgs(true);
        await saveSnapshot(borrowerRestrictedSnapshot);
      });

      beforeEach(async () => {
        await loadSnapshot(borrowerRestrictedSnapshot);
      });

      it('cannot deposit borrowed funds to the exchange', async () => {
        const starkKey = 123;
        await borrowers[0].allowStarkKey(starkKey);
        await expect(
          borrowers[0].depositToExchange(starkKey, 456, 789, stakerInitialBalance * 0.4)
        ).to.be.revertedWith(
          'SP1Borrowing: Cannot deposit borrowed funds to the exchange while borrowing is restricted'
        );
      });

      it('can still deposit own funds to the exchange', async () => {
        const starkKey = 123;
        await borrowers[0].allowStarkKey(starkKey);

        // Transfer some funds directly to the StarkProxy contract.
        const ownFundsAmount = 12340;
        await mockStakedToken
          .connect(stakers[0].signer)
          .transfer(borrowers[0].address, ownFundsAmount);

        // Deposit own funds to the exchange.
        await borrowers[0].depositToExchange(starkKey, 456, 789, ownFundsAmount);

        // Cannot deposit any more.
        await expect(borrowers[0].depositToExchange(starkKey, 456, 789, 1)).to.be.revertedWith(
          'SP1Borrowing: Cannot deposit borrowed funds to the exchange while borrowing is restricted'
        );
      });
    });
  });

  /**
   * Progress to the blackout window of the current epoch.
   */
  async function advanceToBlackoutWindow(mineBlock: boolean = true): Promise<void> {
    let remaining = (await liquidityStakingV1.getTimeRemainingInCurrentEpoch()).toNumber();
    remaining ||= EPOCH_LENGTH.toNumber();
    const timeUntilBlackoutWindow = remaining - BLACKOUT_WINDOW.toNumber();
    if (mineBlock) {
      await increaseTimeAndMine(timeUntilBlackoutWindow);
    } else {
      await increaseTime(timeUntilBlackoutWindow);
    }
  }

  async function saveSnapshot(label: string): Promise<void> {
    snapshots.set(label, await evmSnapshot());
    contract.saveSnapshot(label);
  }

  async function loadSnapshot(label: string): Promise<void> {
    const snapshot = snapshots.get(label);
    if (!snapshot) {
      throw new Error(`Cannot load since snapshot has not been saved: ${label}`);
    }
    await evmRevert(snapshot);
    snapshots.set(label, await evmSnapshot());
    contract.loadSnapshot(label);
  }
});

function expectEqs(actual: BigNumberish[], expected: BigNumberish[]): void {
  expect(actual).to.have.length(expected.length);
  for (let i = 0; i < expected.length; i++) {
    expect(actual[i], `expectEqs[${i}]: ${actual}`).to.be.equal(expected[i]);
  }
}

async function incrementTimeToTimestamp(timestampString: BigNumberish): Promise<void> {
  const latestBlockTimestamp = (await timeLatest()).toNumber();
  const timestamp = BigNumber.from(timestampString);
  // we can only increase time in this method, assert that user isn't trying to move time backwards
  expect(latestBlockTimestamp).to.be.at.most(timestamp.toNumber());
  const timestampDiff = timestamp.sub(latestBlockTimestamp).toNumber();
  await increaseTimeAndMine(timestampDiff);
}
