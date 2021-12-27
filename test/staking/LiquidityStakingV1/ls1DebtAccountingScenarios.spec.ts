import { expect } from 'chai';
import { BigNumber } from 'ethers';

import { timeLatest, evmSnapshot, increaseTime } from '../../../helpers/misc-utils';
import { LiquidityStakingV1 } from '../../../types/LiquidityStakingV1';
import { MintableErc20 } from '../../../types/MintableErc20';
import { StakingHelper } from '../../test-helpers/staking-helper';
import { DydxToken } from '../../../types/DydxToken';
import {
  makeSuite,
  TestEnv,
  deployPhase2,
  SignerWithAddress,
} from '../../test-helpers/make-suite';

const snapshots = new Map<string, string>();

// Snapshots
const afterMockTokenMint = 'AfterMockTokenMint';
const twoShortfalls = 'TwoShortfalls';

const stakerInitialBalance: number = 1_000_000;

makeSuite('LS1DebtAccounting (Scenarios)', deployPhase2, (testEnv: TestEnv) => {
  let deployer: SignerWithAddress;
  let rewardsTreasury: SignerWithAddress;
  let liquidityStakingV1: LiquidityStakingV1;
  let mockStakedToken: MintableErc20;
  let dydxToken: DydxToken;

  // Users.
  let stakers: SignerWithAddress[];
  let borrowers: SignerWithAddress[];

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

    distributionStart = (await liquidityStakingV1.DISTRIBUTION_START()).toString();
    distributionEnd = (await liquidityStakingV1.DISTRIBUTION_END()).toString();

    // Use helper class to automatically check contract invariants after every update.
    contract = new StakingHelper(
      liquidityStakingV1,
      mockStakedToken,
      rewardsTreasury,
      deployer,
      deployer,
      stakers.concat(borrowers),
      false,
    );

    // Mint staked tokens and set allowances.
    await Promise.all(stakers.map((s) => contract.mintAndApprove(s, stakerInitialBalance)));
    await Promise.all(borrowers.map((b) => contract.approveContract(b, stakerInitialBalance)));

    saveSnapshot(afterMockTokenMint);
  });

  describe('Shortfalls and debt accounting', () => {
    it('Initial scenario with two shortfalls', async () => {
      await incrementTimeToTimestamp(distributionStart);

      // Epoch 0
      //
      // Set borrower allocations.
      await contract.setBorrowerAllocations({
        [borrowers[0].address]: 0.4,
        [borrowers[1].address]: 0.6,
      });

      // Epoch (step)     1      2 (1)   2 (2)   3 (1)   3 (2)   4
      // Active           1000   400     400     300     300     200
      // Inactive         0      600     300     400     300     400
      // Debt             0      0       300     300     400     400
      // Total            1000   1000    1000    1000    1000    1000
      // Borrowed         900    700     400     400     300     300
      // Available        100    300     300     300     300     300
      //
      // Debt + Borrowed + Available is always 1000
      // Active + Inactive Value + Debt is normally 1000

      //
      // Epoch 1
      //
      await contract.elapseEpoch();
      //
      // Deposit, borrow, request withdrawal.
      await contract.stake(stakers[0], 300);
      await contract.stake(stakers[1], 700);
      await contract.borrow(borrowers[0], 300);
      await contract.borrow(borrowers[1], 600);
      await contract.requestWithdrawal(stakers[0], 100);
      await contract.requestWithdrawal(stakers[1], 500);
      //
      // Make a partial repayment.
      //
      // Borrower             0        1
      // ----------------------------------------
      // Initial allocated    400      600
      // Initial borrowed     300      600
      // New allocated        160      240
      // New borrowed         300      400
      // Epoch 2 shortfall    140      160
      await contract.repayBorrow(borrowers[1], borrowers[1], 200);

      //
      // Epoch 2
      //
      // (Step 1)
      //
      await contract.elapseEpochWithExpectedBalanceUpdates(
        {
          // Active.
          [stakers[0].address]: [300, 200],
          [stakers[1].address]: [700, 200],
        },
        {
          // Inactive.
          [stakers[0].address]: [0, 100],
          [stakers[1].address]: [0, 500],
        }
      );
      //
      // (Step 2)
      //
      // Initially, expect no debt.
      expect(await liquidityStakingV1.getBorrowerDebtBalance(borrowers[0].address)).to.equal(0);
      expect(await liquidityStakingV1.getBorrowerDebtBalance(borrowers[1].address)).to.equal(0);
      expect(await liquidityStakingV1.getStakerDebtBalance(stakers[0].address)).to.equal(0);
      expect(await liquidityStakingV1.getStakerDebtBalance(stakers[1].address)).to.equal(0);
      //
      // Mark debt.
      //
      // Expect loss of 300 against a total inactive balance of 600.
      await contract.markDebt(
        {
          [borrowers[0].address]: 140,
          [borrowers[1].address]: 160,
        },
        borrowers, // Expect both borrowers to be restricted.
        0.5 // Expected new index.
      );
      //
      // Expect staker debt balances.
      //
      // Staker 1: Requested to withdraw 100, cut by 50% => is owed 50.
      // Staker 1: Requested to withdraw 500, cut by 50% => is owed 250.
      await contract.expectStakerDebt({
        [stakers[0].address]: 50,
        [stakers[1].address]: 250,
      });
      //
      // Request to withdraw to trigger a second shortfall.
      await contract.requestWithdrawal(stakers[0], 100);

      //
      // Epoch 3
      //
      // (Step 1)
      //
      await contract.elapseEpochWithExpectedBalanceUpdates(
        {
          // Active.
          [stakers[0].address]: [200, 100],
          [stakers[1].address]: [200, 200],
        },
        {
          // Inactive.
          [stakers[0].address]: [50, 150],
          [stakers[1].address]: [250, 250],
        }
      );
      //
      // Request to withdraw again, before debt has been marked.
      // This inactive balance should NOT be included in the shortfall.
      await contract.requestWithdrawal(stakers[0], 100);
      expect(await liquidityStakingV1.getInactiveBalanceCurrentEpoch(stakers[0].address)).to.equal(
        150
      );
      expect(await liquidityStakingV1.getInactiveBalanceNextEpoch(stakers[0].address)).to.equal(
        250
      );
      // Check the total balance.
      expect(await getTotalStakerBalance()).to.equal(1000);
      //
      // (Step 2)
      //
      // Now mark debt.
      //
      // Borrower             0        1
      // ----------------------------------------
      // Epoch 2 allocated    160      240
      // Epoch 2 borrowed     300      400
      // Epoch 2 shortfall    140      160
      // Current allocated    120      180
      // Current borrowed     160      240
      // New shortfall        40       60
      //
      // Expect loss of 100 against a total inactive balance (next epoch) of 400.
      await contract.markDebt(
        {
          [borrowers[0].address]: 40,
          [borrowers[1].address]: 60,
        },
        [], // Expect no new restrictions.
        0.75, // Expected new index.
        { roundingTolerance: 1 }
      );
      // Expect staker debt balances.
      //
      // Staker 1: Has 150 inactive, cut by 25% => is owed 37.5 in new debt.
      // Staker 1: Has 250 inactive, cut by 25% => is owed 62.5 in new debt.
      await contract.expectStakerDebt({
        [stakers[0].address]: 50 + 38, // Rounds up.
        [stakers[1].address]: 250 + 63, // Rounds up.
      });
      // Check the total balance.
      expect(await getTotalStakerBalance()).to.equal(1000);

      //
      // Epoch 4
      //
      await contract.elapseEpochWithExpectedBalanceUpdates(
        {
          // Active.
          [stakers[0].address]: [100, 0],
          [stakers[1].address]: [200, 200],
        },
        {
          // Inactive.
          [stakers[0].address]: [112, 212], // Inactive balance was pulled forward early.
          [stakers[1].address]: [187, 187],
        },
        { roundingTolerance: 1 }
      );
      // Check total balances.
      expect(await getTotalStakerBalance()).to.equal(1000);
      expect(await liquidityStakingV1.getTotalActiveBalanceCurrentEpoch()).to.equal(200);
      expect(await liquidityStakingV1.getTotalInactiveBalanceCurrentEpoch()).to.equal(400);
      expect(await liquidityStakingV1.getTotalBorrowerDebtBalance()).to.equal(400);
      expect(await liquidityStakingV1.getTotalBorrowedBalance()).to.equal(300);
      //
      // Finally, check invariants again.
      await contract.checkInvariants({ roundingTolerance: 1 });

      // Test failsafe functions.
      const signer0 = liquidityStakingV1.connect(stakers[0].signer);
      const signer1 = liquidityStakingV1.connect(stakers[1].signer);
      await signer0.failsafeDeleteUserInactiveBalance();
      expect(await liquidityStakingV1.getInactiveBalanceCurrentEpoch(stakers[0].address)).to.equal(
        0
      );
      expect(await liquidityStakingV1.getInactiveBalanceNextEpoch(stakers[0].address)).to.equal(0);
      await signer0.failsafeDeleteUserInactiveBalance();
      await signer1.failsafeSettleUserInactiveBalanceToEpoch(2);
      await signer1.failsafeSettleUserInactiveBalanceToEpoch(3);
      await signer1.failsafeSettleUserInactiveBalanceToEpoch(4);
      await signer1.failsafeSettleUserInactiveBalanceToEpoch(4);
      await expect(signer1.failsafeSettleUserInactiveBalanceToEpoch(5)).to.be.revertedWith(
        'LS1StakedBalances: maxEpoch'
      );

      // Test that normal operation still works afterwards.
      const amount = 12345;
      const options = { skipInvariantChecks: true };
      await contract.stake(stakers[0], amount, options);
      await contract.stake(stakers[1], amount, options);
      await contract.requestWithdrawal(stakers[0], amount, options);
      await contract.requestWithdrawal(stakers[1], amount, options);
      await contract.elapseEpoch();
      await contract.withdrawStake(stakers[0], stakers[0], amount, options);
      await contract.withdrawStake(stakers[1], stakers[1], amount, options);
    });
  });

  /**
   * Add up all funds owned by stakers: active + inactive (rounded) + debt.
   */
  async function getTotalStakerBalance(): Promise<BigNumber> {
    let sum = await liquidityStakingV1.getTotalActiveBalanceCurrentEpoch();
    for (const staker of stakers) {
      const address = staker.address;
      sum = sum.add(await liquidityStakingV1.getInactiveBalanceCurrentEpoch(address));
      sum = sum.add(await liquidityStakingV1.getStakerDebtBalance(address));
    }
    return sum;
  }

  async function saveSnapshot(label: string): Promise<void> {
    snapshots.set(label, await evmSnapshot());
    contract.saveSnapshot(label);
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
