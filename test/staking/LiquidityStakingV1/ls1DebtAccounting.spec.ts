import { expect } from 'chai';
import { BigNumber } from 'ethers';

import { timeLatest, evmSnapshot, evmRevert, increaseTime } from '../../../helpers/misc-utils';
import { LiquidityStakingV1 } from '../../../types/LiquidityStakingV1';
import { MintableErc20 } from '../../../types/MintableErc20';
import { StakingHelper } from '../../test-helpers/staking-helper';
import {
  makeSuite,
  TestEnv,
  deployPhase2,
  SignerWithAddress,
} from '../../test-helpers/make-suite';
import { SHORTFALL_INDEX_BASE, ZERO_ADDRESS } from '../../../helpers/constants';
import { DydxToken } from '../../../types/DydxToken';

const snapshots = new Map<string, string>();

// Snapshots
const afterMockTokenMint = 'AfterMockTokenMint';
const twoShortfalls = 'TwoShortfalls';

const stakerInitialBalance: number = 1_000_000;

makeSuite('LS1DebtAccounting', deployPhase2, (testEnv: TestEnv) => {
  let deployer: SignerWithAddress;
  let rewardsTreasury: SignerWithAddress;
  let liquidityStakingV1: LiquidityStakingV1;
  let mockStakedToken: MintableErc20;
  let dydxToken: DydxToken;

  // Users.
  let stakers: SignerWithAddress[];
  let borrowers: SignerWithAddress[];
  let otherUser: SignerWithAddress;

  let distributionStart: string;
  let distributionEnd: string;

  let contract: StakingHelper;

  before(async () => {
    liquidityStakingV1 = testEnv.liquidityStaking;
    mockStakedToken = testEnv.mockStakedToken;
    dydxToken = testEnv.dydxToken;
    rewardsTreasury = testEnv.rewardsTreasury;
    deployer = testEnv.deployer;

    // Users.
    stakers = testEnv.users.slice(1, 3); // 2 stakers
    borrowers = testEnv.users.slice(3, 5); // 2 borrowers
    otherUser = testEnv.users[5];

    distributionStart = (await liquidityStakingV1.DISTRIBUTION_START()).toString();
    distributionEnd = (await liquidityStakingV1.DISTRIBUTION_END()).toString();

    // Use helper class to automatically check contract invariants after every update.
    contract = new StakingHelper(
      liquidityStakingV1,
      mockStakedToken,
      rewardsTreasury,
      deployer,
      deployer,
      stakers.concat(borrowers).concat([otherUser]),
      false,
    );

    // Mint staked tokens and set allowances.
    await Promise.all(stakers.map((s) => contract.mintAndApprove(s, stakerInitialBalance)));
    await Promise.all(
      borrowers.map((b) => contract.approveContract(b, BigNumber.from('0x10000000000000000')))
    );

    await saveSnapshot(afterMockTokenMint);
  });

  describe('Simple shortfall scenarios', () => {
    beforeEach(async () => {
      await loadSnapshot(afterMockTokenMint);
    });

    it('Allows restricting a borrower even if there is no shortfall', async () => {
      // Before epoch 0: Set borrower allocations.
      await contract.setBorrowerAllocations({
        [borrowers[0].address]: 0.4,
        [borrowers[1].address]: 0.6,
      });

      // Epoch 0: Stake and borrow.
      await incrementTimeToTimestamp(distributionStart);
      await contract.mintAndApprove(stakers[0], 100e10);
      await contract.stake(stakers[0], 100e10);
      await contract.borrow(borrowers[0], 40e10);
      await contract.borrow(borrowers[1], 60e10);
      // Revoke allocation.
      await contract.setBorrowerAllocations({
        [ZERO_ADDRESS]: 1,
        [borrowers[0].address]: 0,
        [borrowers[1].address]: 0,
      });
      // Borrower 0 makes a repayment.
      await contract.repayBorrow(borrowers[0], borrowers[0], 40e10);

      // Epoch 1: No shortfall since there were no withdrawal requests.
      await contract.elapseEpoch();
      await contract.expectNoShortfall();

      // Borrower who repaid cannot be restricted.
      await expect(liquidityStakingV1.restrictBorrower(borrowers[0].address)).to.be.revertedWith(
        'LS1DebtAccounting: Borrower not overdue'
      );

      // Borrower who did not make a repayment can be restricted.
      await expect(liquidityStakingV1.restrictBorrower(borrowers[1].address))
        .to.emit(liquidityStakingV1, 'BorrowingRestrictionChanged')
        .withArgs(borrowers[1].address, true);
    });

    it('Cannot mark debt if provided borrowers do not cover the shortfall', async () => {
      // Before epoch 0: Set borrower allocations.
      await contract.setBorrowerAllocations({
        [borrowers[0].address]: 0.999,
        [borrowers[1].address]: 0.001,
      });

      // Epoch 0: Stake, borrow, and request withdrawal.
      await incrementTimeToTimestamp(distributionStart);
      await contract.stake(stakers[0], 1000);
      await contract.borrow(borrowers[0], 999);
      await contract.borrow(borrowers[1], 1);
      await contract.requestWithdrawal(stakers[0], 1000);

      // Epoch 1
      await contract.elapseEpoch();

      // Fails if both borrowers are not specified.
      await expect(
        contract.markDebt({ [borrowers[0].address]: 999 }, [borrowers[0].address], 0)
      ).to.be.revertedWith('LS1DebtAccounting: Borrowers do not cover the shortfall');
      await expect(
        contract.markDebt({ [borrowers[1].address]: 1 }, [borrowers[1].address], 0)
      ).to.be.revertedWith('LS1DebtAccounting: Borrowers do not cover the shortfall');

      // Succeeds if both borrowers are specified.
      await contract.markDebt(
        {
          [borrowers[0].address]: 999,
          [borrowers[1].address]: 1,
        },
        borrowers,
        0
      );
    });

    it('Can mark debt with a single borrower if they are short for the whole shortfall amount', async () => {
      // Before epoch 0: Set borrower allocations.
      await contract.setBorrowerAllocations({
        [borrowers[0].address]: 0.5,
        [borrowers[1].address]: 0.5,
        [otherUser.address]: 0,
      });

      // Epoch 0: Stake, borrow, and request withdrawal.
      await incrementTimeToTimestamp(distributionStart);
      await contract.stake(stakers[0], 1000);
      await contract.borrow(borrowers[0], 500);
      await contract.borrow(borrowers[1], 500);
      await contract.requestWithdrawal(stakers[0], 500);
      await contract.setBorrowerAllocations({
        [borrowers[0].address]: 0,
        [borrowers[1].address]: 0,
        [otherUser.address]: 1,
      });

      // Epoch 1
      //
      // There is a shortfall of 500.
      // Each borrower is individually short 500 versus their allocation.
      await contract.elapseEpoch();

      const singleBorrowerShortfall = 'SingleBorrowerShortfall';
      await saveSnapshot(singleBorrowerShortfall);

      // Can mark debt with borrower 0.
      await contract.markDebt({ [borrowers[0].address]: 500 }, [borrowers[0]], 0);

      // Can mark debt with borrower 1.
      await loadSnapshot(singleBorrowerShortfall);
      await contract.markDebt({ [borrowers[1].address]: 500 }, [borrowers[1]], 0);

      // Can mark debt with all borrowers.
      await loadSnapshot(singleBorrowerShortfall);
      await contract.markDebt(
        {
          [otherUser.address]: 0, // Will skip borrowers who have no debt.
          [borrowers[0].address]: 500, // First borrower with debt will be allocated the shortfall.
          [borrowers[1].address]: 0,
        },
        [borrowers[0]], // Only the first one will be restricted, since they cover the whole debt.
        0
      );
    });
  });

  describe('Debt accounting, after two shortfalls', () => {
    before(async () => {
      loadSnapshot(afterMockTokenMint);

      // Before epoch 0: Set borrower allocations.
      await contract.setBorrowerAllocations({
        [borrowers[0].address]: 0.4,
        [borrowers[1].address]: 0.6,

        // TOOD: This should be handled by state.madeInitialAllocation, but it's not working.
        [ZERO_ADDRESS]: 0,
      });

      // Epoch 0: Deposit, borrow, request withdrawal. Partial repayment.
      await incrementTimeToTimestamp(distributionStart);
      await contract.stake(stakers[0], 300);
      await contract.stake(stakers[1], 700);
      await contract.borrow(borrowers[0], 300);
      await contract.borrow(borrowers[1], 600);
      await contract.requestWithdrawal(stakers[0], 100);
      await contract.requestWithdrawal(stakers[1], 500);
      await contract.repayBorrow(borrowers[1], borrowers[1], 200);

      // Epoch 1: First partial shortfall: debt of 300 against inactive balance of 600.
      await contract.elapseEpoch();
      await contract.markDebt(
        {
          [borrowers[0].address]: 140,
          [borrowers[1].address]: 160,
        },
        borrowers, // Expect both borrowers to be restricted.
        0.5 // Expected new index.
      );
      await contract.requestWithdrawal(stakers[0], 200);

      // Epoch 2: Second partial shortfall: debt of 200 against inactive balance of 500.
      await contract.elapseEpoch();
      await contract.markDebt(
        {
          [borrowers[0].address]: 80,
          [borrowers[1].address]: 120,
        },
        [], // Expect no new restrictions.
        0.6 // Expected new index.
      );

      // Expect state.
      await contract.expectStakerDebt({
        [stakers[0].address]: 150,
        [stakers[1].address]: 350,
      });
      await contract.expectBorrowerDebt({
        [borrowers[0].address]: 220,
        [borrowers[1].address]: 280,
      });

      await saveSnapshot(twoShortfalls);
    });

    beforeEach(async () => {
      await loadSnapshot(twoShortfalls);
    });

    it('getters return shortfall info', async () => {
      expect(await liquidityStakingV1.getShortfallCount()).to.equal(2);
      expect((await liquidityStakingV1.getShortfall(0)).epoch).to.equal(1);
      expect((await liquidityStakingV1.getShortfall(1)).epoch).to.equal(2);
      expect((await liquidityStakingV1.getShortfall(0)).index).to.equal(
        SHORTFALL_INDEX_BASE.mul(5).div(10)
      );
      expect((await liquidityStakingV1.getShortfall(1)).index).to.equal(
        SHORTFALL_INDEX_BASE.mul(6).div(10)
      );
    });

    it('newly deposited funds are not affected by past shortfalls', async () => {
      await contract.mintAndApprove(otherUser, 150e6);
      await contract.stake(otherUser, 150e6);
      await contract.elapseEpoch();
      await contract.requestWithdrawal(otherUser, 100e6);
      await contract.elapseEpoch();
      await contract.withdrawStake(otherUser, otherUser, 50e6);
      await contract.elapseEpoch();
      await contract.requestWithdrawal(otherUser, 50e6);
      await contract.elapseEpoch();
      await contract.withdrawStake(otherUser, otherUser, 100e6);
      expect(await liquidityStakingV1.getActiveBalanceCurrentEpoch(otherUser.address)).to.equal(0);
      expect(await liquidityStakingV1.getInactiveBalanceNextEpoch(otherUser.address)).to.equal(0);
    });

    it('stakers cannot withdraw debt if there were no repayments', async () => {
      await contract.fullWithdrawDebt(stakers[0], 0);
      await contract.fullWithdrawDebt(stakers[1], 0);
    });

    it('stakers can withdraw repaid debt on a first-come first-serve basis', async () => {
      await contract.fullRepayDebt(borrowers[0], 220);
      await contract.fullWithdrawDebt(stakers[0], 150);
      await contract.fullWithdrawDebt(stakers[1], 70);
      await contract.fullRepayDebt(borrowers[1], 280);
      await contract.fullWithdrawDebt(stakers[1], 280);
    });

    it('stakers can withdraw max debt', async () => {
      await contract.fullRepayDebt(borrowers[0], 220);
      await contract.fullRepayDebt(borrowers[1], 280);
      await contract.withdrawMaxDebt(stakers[0], stakers[0]);
      await contract.withdrawMaxDebt(stakers[1], stakers[1]);
      expect(await liquidityStakingV1.getTotalDebtAvailableToWithdraw()).to.equal(0);

      // Can still call withdrawMaxDebt() even if there are no funds to withdraw.
      await contract.withdrawMaxDebt(stakers[0], stakers[0]);
      await contract.withdrawMaxDebt(stakers[1], stakers[1]);
    });

    it('borrower can make partial repayments', async () => {
      await contract.repayDebt(borrowers[0], borrowers[0], 1);
      await contract.repayDebt(borrowers[0], borrowers[0], 10);
      await contract.repayDebt(borrowers[0], borrowers[0], 100);
      await contract.fullWithdrawDebt(stakers[0], 111);
      await contract.fullRepayDebt(borrowers[0], 109);
      await contract.fullWithdrawDebt(stakers[1], 109);
    });

    it('anyone can repay debt on behalf of a borrower', async () => {
      await contract.repayDebt(stakers[0], borrowers[0], 110);
      await contract.fullWithdrawDebt(stakers[1], 110);

      // Borrower repays the rest of their own debt.
      await contract.fullRepayDebt(borrowers[0], 110);
    });

    it('repaid debt cannot be borrowed', async () => {
      // Check initial state.
      //
      // Currently, the contract is perfectly balanced, with:
      //   Staker Active   = Borrower Borrowed     = 200
      //   Staker Inactive = Available in Contract = 300
      //   Staker Debt     = Borrower Debt         = 500
      expect(await liquidityStakingV1.getTotalBorrowedBalance()).to.equal(200);
      expect(await liquidityStakingV1.getTotalActiveBalanceCurrentEpoch()).to.equal(200);
      expect(await liquidityStakingV1.getTotalInactiveBalanceCurrentEpoch()).to.equal(300);
      expect(await mockStakedToken.balanceOf(liquidityStakingV1.address)).to.equal(300);

      // Add more stake.
      await contract.stake(stakers[0], 500);

      // Release borrower restrictions.
      await contract.setBorrowingRestriction(borrowers[0], false);
      await contract.setBorrowingRestriction(borrowers[1], false);

      // Verify borrowable amounts.
      expect(await liquidityStakingV1.getBorrowableAmount(borrowers[0].address)).to.be.equal(200);
      expect(await liquidityStakingV1.getBorrowableAmount(borrowers[1].address)).to.be.equal(300);

      // Use another user to withdraw all borrowable funds.
      await contract.setBorrowerAllocations({
        [borrowers[0].address]: 0,
        [borrowers[1].address]: 0,
        [otherUser.address]: 1,
      });
      await contract.elapseEpoch();
      // Active balance 700, contract balance 800, inactive balance 300 => can withdraw 500
      await contract.fullBorrow(otherUser, 500);
      await contract.setBorrowerAllocations({
        [borrowers[0].address]: 0.4,
        [borrowers[1].address]: 0.6,
        [otherUser.address]: 0,
      });
      await contract.elapseEpoch();

      // New state:
      //   Staker Active   = Borrower Borrowed     = 700
      //   Staker Inactive = Available in Contract = 300
      //   Staker Debt     = Borrower Debt         = 500
      expect(await mockStakedToken.balanceOf(liquidityStakingV1.address)).to.equal(300);
      expect(await liquidityStakingV1.getContractBalanceAvailableToWithdraw()).to.equal(300);

      // Repay full debt balances, so that there are more funds in the contract.
      await contract.fullRepayDebt(borrowers[0], 220);
      await contract.fullRepayDebt(borrowers[1], 280);
      //
      // Now the contract balance should be: 300 unborrowed + 500 repaid debt
      expect(await mockStakedToken.balanceOf(liquidityStakingV1.address)).to.equal(800);

      // Verify that no additional borrows can be made.
      await contract.fullBorrow(borrowers[0], 0);
      await contract.fullBorrow(borrowers[1], 0);

      // Furthermore, the borrowable amounts should reflect this.
      expect(await liquidityStakingV1.getBorrowableAmount(borrowers[0].address)).to.be.equal(0);
      expect(await liquidityStakingV1.getBorrowableAmount(borrowers[1].address)).to.be.equal(0);

      // Verify that the borrowers still have allocated balances though.
      expect(
        await liquidityStakingV1.getAllocatedBalanceCurrentEpoch(borrowers[0].address)
      ).to.be.equal(280);
      expect(
        await liquidityStakingV1.getAllocatedBalanceCurrentEpoch(borrowers[1].address)
      ).to.be.equal(420);
    });

    it('repaid debt cannot be withdrawn as stake withdrawal', async () => {
      // Withdraw the full withdrawable stake amount.
      await contract.fullWithdrawStake(stakers[0], 150);
      await contract.fullWithdrawStake(stakers[1], 150);

      // Verify that there are no tokens left in the contract.
      expect(await mockStakedToken.balanceOf(liquidityStakingV1.address)).to.equal(0);

      // Request to withdraw remaining funds.
      await contract.requestWithdrawal(stakers[1], 200, { roundingTolerance: 1 });

      // Elapse epoch so that the inactive balance becomes current.
      await contract.elapseEpoch();

      // Verify that the staker has a current inactive balance.
      expect(
        await liquidityStakingV1.getInactiveBalanceCurrentEpoch(stakers[1].address)
      ).to.be.equal(200);

      // Repay full debt balances.
      await contract.fullRepayDebt(borrowers[0], 220, { roundingTolerance: 1 });
      await contract.fullRepayDebt(borrowers[1], 280, { roundingTolerance: 1 });

      // Verify that no stake can be withdrawn.
      await contract.fullWithdrawStake(stakers[0], 0, { roundingTolerance: 1 });
      await contract.fullWithdrawStake(stakers[1], 0, { roundingTolerance: 1 });
    });
  });

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
  const timestamp: BigNumber = BigNumber.from(timestampString);
  // we can only increase time in this method, assert that user isn't trying to move time backwards
  expect(latestBlockTimestamp.toNumber()).to.be.at.most(timestamp.toNumber());
  const timestampDiff: number = timestamp.sub(latestBlockTimestamp.toString()).toNumber();
  await increaseTime(timestampDiff);
}
