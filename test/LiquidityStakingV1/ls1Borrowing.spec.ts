import BigNumber from 'bignumber.js';
import { BigNumberish } from 'ethers';
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
const afterMintSnapshot = 'AfterMockTokenMint';
const distributionStartSnapshot = 'DistributionStart';
const fundsStakedSnapshot = 'FundsStaked';
const borrowerAllocationsSnapshot = 'BorrowerAllocationsSet';
const borrowerAllocationsSettledSnapshot = 'BorrowerAllocationsSettled';

const stakerInitialBalance: number = 1_000_000;

makeSuite('LS1Borrowing', (testEnv: TestEnv) => {
  // Contracts.
  let deployer: SignerWithAddress;
  let rewardsVault: SignerWithAddress;
  let liquidityStakingV1: LiquidityStakingV1;
  let mockStakedToken: MockStakedToken;
  let dydxToken: MintableErc20;

  // Users.
  let stakers: SignerWithAddress[];
  let borrowers: StarkProxyV1[];

  let distributionStart: string;
  let distributionEnd: string;
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

    distributionStart = (await liquidityStakingV1.DISTRIBUTION_START()).toString();
    distributionEnd = (await liquidityStakingV1.DISTRIBUTION_END()).toString();

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

    // Stake funds.
    await incrementTimeToTimestamp(distributionStart);
    await contract.stake(stakers[0], stakerInitialBalance / 4);
    await contract.stake(stakers[1], (stakerInitialBalance / 4) * 3);
    saveSnapshot(fundsStakedSnapshot);
  });

  describe('if no borrower allocations have been set', () => {
    beforeEach(async () => {
      await loadSnapshot(fundsStakedSnapshot);
    });

    it('Borrower cannot borrow if they have no allocation', async () => {
      await expect(contract.borrowViaProxy(borrowers[0], stakerInitialBalance)).to.be.revertedWith(
        'LS1Borrowing: Cannot borrow more than the available allocated balance'
      );
    });
  });

  describe('before borrower allocations have taken effect', () => {
    before(async () => {
      await loadSnapshot(fundsStakedSnapshot);
      // Set borrower allocations.
      await contract.setBorrowerAllocations({
        [borrowers[0].address]: 0.4,
        [borrowers[1].address]: 0.6,
      });
      expectedAllocations = [stakerInitialBalance * 0.4, stakerInitialBalance * 0.6];
      saveSnapshot(borrowerAllocationsSnapshot);
    });

    beforeEach(async () => {
      await loadSnapshot(borrowerAllocationsSnapshot);
    });

    it('Borrower cannot borrow if the next allocation has not taken effect', async () => {
      await expect(contract.borrowViaProxy(borrowers[0], stakerInitialBalance)).to.be.revertedWith(
        'LS1Borrowing: Cannot borrow more than the available allocated balance'
      );
    });

    it('Can query current and next borrower allocations', async () => {
      expect(
        await liquidityStakingV1.getAllocatedBalanceCurrentEpoch(borrowers[0].address)
      ).to.equal(0);
      expect(
        await liquidityStakingV1.getAllocatedBalanceCurrentEpoch(borrowers[1].address)
      ).to.equal(0);

      expect(await liquidityStakingV1.getAllocatedBalanceNextEpoch(borrowers[0].address)).to.equal(
        expectedAllocations[0]
      );
      expect(await liquidityStakingV1.getAllocatedBalanceNextEpoch(borrowers[1].address)).to.equal(
        expectedAllocations[1]
      );
    });
  });

  describe('after funds have been staked and allocations have taken effect', () => {
    before(async () => {
      await loadSnapshot(fundsStakedSnapshot);
      // Set borrower allocations.
      await contract.setBorrowerAllocations({
        [borrowers[0].address]: 0.4,
        [borrowers[1].address]: 0.6,
      });
      expectedAllocations = [stakerInitialBalance * 0.4, stakerInitialBalance * 0.6];
      await elapseEpoch(); // Increase time to next epoch, so borrower can use new allocation
      saveSnapshot(borrowerAllocationsSettledSnapshot);
    });

    beforeEach(async () => {
      await loadSnapshot(borrowerAllocationsSettledSnapshot);
    });

    it('Can query current borrower allocation', async () => {
      expect(
        await liquidityStakingV1.getAllocatedBalanceCurrentEpoch(borrowers[0].address)
      ).to.equal(expectedAllocations[0]);
      expect(
        await liquidityStakingV1.getAllocatedBalanceCurrentEpoch(borrowers[1].address)
      ).to.equal(expectedAllocations[1]);
    });

    it('Borrower cannot borrow more than their allocation', async () => {
      await expect(contract.borrowViaProxy(borrowers[0], stakerInitialBalance)).to.be.revertedWith(
        'LS1Borrowing: Cannot borrow more than the available allocated balance'
      );
      const expectedAllocation = stakerInitialBalance * 0.4;
      await expect(
        contract.borrowViaProxy(borrowers[0], expectedAllocation + 1)
      ).to.be.revertedWith('LS1Borrowing: Cannot borrow more than the available allocated balance');
    });

    it('Borrower can borrow and repay the full allocated balance', async () => {
      await contract.fullBorrowViaProxy(borrowers[0], expectedAllocations[0]);
      await contract.fullBorrowViaProxy(borrowers[1], expectedAllocations[1]);

      await contract.repayLoanViaProxy(borrowers[0], expectedAllocations[0]);
      await contract.repayLoanViaProxy(borrowers[1], expectedAllocations[1]);
    });

    it('Borrower can make partial borrows and repayments', async () => {
      await contract.borrowViaProxy(borrowers[0], expectedAllocations[0] / 2);
      await contract.borrowViaProxy(borrowers[1], expectedAllocations[1] / 2);
      await contract.fullBorrowViaProxy(borrowers[0], expectedAllocations[0] / 2);
      await contract.fullBorrowViaProxy(borrowers[1], expectedAllocations[1] / 2);

      // Equal repayments and re-borrows.
      await contract.repayLoanViaProxy(borrowers[0], Math.floor(expectedAllocations[0] / 3));
      await contract.borrowViaProxy(borrowers[0], Math.floor(expectedAllocations[0] / 3));
      await contract.repayLoanViaProxy(borrowers[0], expectedAllocations[0] / 2);
      await contract.borrowViaProxy(borrowers[0], expectedAllocations[0] / 2);
      await contract.repayLoanViaProxy(borrowers[0], expectedAllocations[0]);

      // Mixed amounts.
      await contract.repayLoanViaProxy(borrowers[1], expectedAllocations[1] / 2);
      await contract.borrowViaProxy(borrowers[1], expectedAllocations[1] / 4);
      await contract.repayLoanViaProxy(borrowers[1], expectedAllocations[1] / 2);
      await contract.borrowViaProxy(borrowers[1], expectedAllocations[1] / 4);
      await contract.repayLoanViaProxy(borrowers[1], expectedAllocations[1] / 2);

      // Expect exactly the full amount to be available.
      await contract.fullBorrowViaProxy(borrowers[0], expectedAllocations[0]);
      await contract.fullBorrowViaProxy(borrowers[1], expectedAllocations[1]);
    });

    it("Borrower can repay another borrower's loan", async () => {
      await contract.borrowViaProxy(borrowers[0], expectedAllocations[0]);
      await contract.borrowViaProxy(borrowers[1], expectedAllocations[1]);
      await mockStakedToken.mint(borrowers[0].address, stakerInitialBalance * 0.2);
      await contract.repayLoanViaProxy(borrowers[1], expectedAllocations[1]);
      await contract.repayLoanViaProxy(borrowers[0], expectedAllocations[0]);
    });

    it('Borrower cannot repay more than is owed', async () => {
      await contract.borrowViaProxy(borrowers[0], expectedAllocations[0]);
      await contract.borrowViaProxy(borrowers[1], expectedAllocations[1]);

      await expect(
        contract.repayLoanViaProxy(borrowers[0], expectedAllocations[0] + 1)
      ).to.be.revertedWith('LS1Borrowing: Repay loan amount exceeds borrowed');
      await expect(
        contract.repayLoanViaProxy(borrowers[1], expectedAllocations[1] + 1)
      ).to.be.revertedWith('LS1Borrowing: Repay loan amount exceeds borrowed');
    });

    it('Can immediately borrow more after users stake more, even in the blackout window', async () => {
      await contract.fullBorrowViaProxy(borrowers[0], expectedAllocations[0]);

      const additionalStake = stakerInitialBalance / 4;

      await contract.stake(stakers[0], additionalStake);
      await contract.fullBorrowViaProxy(borrowers[0], additionalStake * 0.4);
      await advanceToBlackoutWindow();
      await contract.stake(stakers[0], additionalStake);
      await contract.fullBorrowViaProxy(borrowers[0], additionalStake * 0.4);
    });

    it('Outside blackout window, not affected if next active balance is lower than current', async () => {
      // Request withdrawal, decreasing next active balance.
      await contract.requestWithdrawal(stakers[0], stakerInitialBalance / 4);
      await contract.requestWithdrawal(stakers[1], (stakerInitialBalance / 4) * 3);

      // Can still borrow full amount.
      await contract.fullBorrowViaProxy(borrowers[0], expectedAllocations[0]);
    });

    it('In blackout window, can borrow less if next active balance will be less', async () => {
      // Request withdrawal, decreasing next active balance.
      await contract.requestWithdrawal(stakers[0], stakerInitialBalance / 8);

      // Expect borrowable amount to be less.
      await advanceToBlackoutWindow();
      const expectedAllocationNext = expectedAllocations[0] - (stakerInitialBalance / 8) * 0.4;
      await contract.fullBorrowViaProxy(borrowers[0], expectedAllocationNext);
    });

    it('Can borrow less if admin decreases allocation (even while it is the next epoch allocation)', async () => {
      // Give all of borrower 0's allocation to borrower 2.
      await contract.setBorrowerAllocations({
        [borrowers[0].address]: 0,
        [borrowers[2].address]: 0.4,
      });

      // Check that neither borrower can borrow.
      await expect(contract.borrowViaProxy(borrowers[0], 1)).to.be.revertedWith(
        'LS1Borrowing: Cannot borrow more than the available allocated balance'
      );
      await expect(contract.borrowViaProxy(borrowers[2], 1)).to.be.revertedWith(
        'LS1Borrowing: Cannot borrow more than the available allocated balance'
      );

      // Give some of the allocation back.
      await contract.setBorrowerAllocations({
        [borrowers[0].address]: 0.2,
        [borrowers[2].address]: 0.2,
      });

      await contract.fullBorrowViaProxy(borrowers[0], expectedAllocations[0] / 2);
    });

    it('Cannot immediately borrow more if admin increase allocation', async () => {
      await contract.fullBorrowViaProxy(borrowers[0], expectedAllocations[0]);

      // Give all of borrower 1's allocation to borrower 0.
      await contract.setBorrowerAllocations({
        [borrowers[1].address]: 0,
        [borrowers[0].address]: 1,
      });

      // Still unable to borrow more.
      await expect(contract.borrowViaProxy(borrowers[0], 1)).to.be.revertedWith(
        'LS1Borrowing: Cannot borrow more than the available allocated balance'
      );
    });

    it('Staker cannot borrow', async () => {
      await contract.fullBorrow(stakers[0], 0);
      await expect(contract.borrow(stakers[0], 1)).to.be.revertedWith(
        'LS1Borrowing: Cannot borrow more than the available allocated balance'
      );
    });

    it('New borrower can borrow in next epoch', async () => {
      // Give all of borrower 0's allocation to borrower 2.
      await contract.setBorrowerAllocations({
        [borrowers[0].address]: 0,
        [borrowers[2].address]: 0.4,
      });

      // Wait for the allocation to become active.
      await elapseEpoch();

      await contract.fullBorrowViaProxy(borrowers[2], expectedAllocations[0]);
    });
  });

  /**
   * Progress to the start of the next epoch. May be a bit after if mining a block.
   */
  async function elapseEpoch(mineBlock: boolean = true): Promise<void> {
    let remaining = (await liquidityStakingV1.getTimeRemainingInCurrentEpoch()).toNumber();
    remaining ||= EPOCH_LENGTH.toNumber();
    if (mineBlock) {
      await increaseTimeAndMine(remaining);
    } else {
      await increaseTime(remaining);
    }
  }

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

async function incrementTimeToTimestamp(timestampString: string): Promise<void> {
  const latestBlockTimestamp = await timeLatest();
  const timestamp: BigNumber = new BigNumber(timestampString);
  // we can only increase time in this method, assert that user isn't trying to move time backwards
  expect(latestBlockTimestamp.toNumber()).to.be.at.most(timestamp.toNumber());
  const timestampDiff: number = timestamp.minus(latestBlockTimestamp).toNumber();
  await increaseTimeAndMine(timestampDiff);
}
