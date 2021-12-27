import { BigNumber, BigNumberish } from 'ethers';
import {
  makeSuite,
  TestEnv,
  deployPhase2,
  SignerWithAddress,
} from '../../test-helpers/make-suite';
import {
  timeLatest,
  evmSnapshot,
  evmRevert,
  increaseTime,
  increaseTimeAndMine,
} from '../../../helpers/misc-utils';
import { BLACKOUT_WINDOW, EPOCH_LENGTH } from '../../../helpers/constants';
import { StakingHelper } from '../../test-helpers/staking-helper';
import { LiquidityStakingV1 } from '../../../types/LiquidityStakingV1';
import { MintableErc20 } from '../../../types/MintableErc20';
import { expect } from 'chai';
import { StarkProxyV1 } from '../../../types/StarkProxyV1';
import { MockStarkPerpetual } from '../../../types/MockStarkPerpetual';

// Snapshots
const snapshots = new Map<string, string>();
const fundsStakedSnapshot = 'FundsStaked';
const borrowerAllocationsSettledSnapshot = 'BorrowerAllocationsSettled';
const borrowerAmountDue = 'BorrowerAmountDue';
const borrowerRestrictedSnapshot = 'BorrowerRestrictedSnapshot';

const stakerInitialBalance: number = 1_000_000;

makeSuite('SP1Borrowing', deployPhase2, (testEnv: TestEnv) => {
  // Contracts.
  let rewardsTreasury: SignerWithAddress;
  let liquidityStaking: LiquidityStakingV1;
  let mockStakedToken: MintableErc20;
  let mockStarkPerpetual: MockStarkPerpetual;

  // Users.
  let deployer: SignerWithAddress;
  let stakers: SignerWithAddress[];
  let borrowers: StarkProxyV1[];

  let distributionStart: number;
  let expectedAllocations: number[];

  let contract: StakingHelper;

  before(async () => {
    ({
      rewardsTreasury,
      liquidityStaking,
      mockStakedToken,
      mockStarkPerpetual,
      deployer,
    } = testEnv);

    // Users.
    stakers = testEnv.users.slice(1, 3); // 2 stakers
    borrowers = testEnv.starkProxyV1Borrowers;

    // Grant roles.
    const exchangeOperatorRole = await borrowers[0].EXCHANGE_OPERATOR_ROLE();
    const borrowerRole = await borrowers[0].BORROWER_ROLE();
    await Promise.all(borrowers.map(async b => {
      await b.grantRole(exchangeOperatorRole, deployer.address);
      await b.grantRole(borrowerRole, deployer.address);
    }));

    distributionStart = (await liquidityStaking.DISTRIBUTION_START()).toNumber();

    // Use helper class to automatically check contract invariants after every update.
    contract = new StakingHelper(
      liquidityStaking,
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

    // Initial stake of 1M.
    await incrementTimeToTimestamp(distributionStart);
    await contract.stake(stakers[0], stakerInitialBalance / 4);
    await contract.stake(stakers[1], (stakerInitialBalance / 4) * 3);
    saveSnapshot(fundsStakedSnapshot);
  });

  describe('After stake is deposited and allocations are set', () => {
    before(async () => {
      await loadSnapshot(fundsStakedSnapshot);

      // Allocations: [40%, 60%]
      await contract.setBorrowerAllocations({
        [borrowers[0].address]: 0.4,
        [borrowers[1].address]: 0.6,
      });
      expectedAllocations = [stakerInitialBalance * 0.4, stakerInitialBalance * 0.6];

      // Enter the blackout window.
      await contract.elapseEpoch();
      await advanceToBlackoutWindow();

      await saveSnapshot(borrowerAllocationsSettledSnapshot);
    });

    describe('Before borrowing', () => {
      beforeEach(async () => {
        await loadSnapshot(borrowerAllocationsSettledSnapshot);
      });

      it('Auto-pay cannot be called outside the blackout window', async () => {
        await contract.elapseEpoch();
        await expect(borrowers[0].autoPayOrBorrow()).to.be.revertedWith(
          'SP1Borrowing: Auto-pay may only be used during the blackout window'
        );
      });

      it('Auto-pay will borrow full borrowable amount', async () => {
        const results = await contract.autoPay(borrowers[0]);
        expectEqs(results, [expectedAllocations[0], 0, 0]);

        // After a non-reverting call to autoPay(), should never be overdue in the next epoch.
        await contract.elapseEpoch();
        expect(await liquidityStaking.isBorrowerOverdue(borrowers[0].address)).to.be.false;
      });
    });

    describe('When borrower has an amount due', async () => {
      before(async () => {
        await loadSnapshot(borrowerAllocationsSettledSnapshot);

        // Borrow full amount of 0.4M
        await contract.fullBorrowViaProxy(borrowers[0], stakerInitialBalance * 0.4);

        // Staker request withdrawal of 0.5M (half the funds in the contract).
        await contract.elapseEpoch();
        await contract.requestWithdrawal(stakers[1], stakerInitialBalance / 2); // 0.5M

        // Enter the blackout window.
        await advanceToBlackoutWindow();

        await saveSnapshot(borrowerAmountDue);
      });

      beforeEach(async () => {
        await loadSnapshot(borrowerAmountDue);
      });

      it('Auto-pay will repay the borrow amount due', async () => {
        // Expect repay 0.2M
        let results = await contract.autoPay(borrowers[0]);
        expectEqs(results, [0, expectedAllocations[0] / 2, 0]);

        // While still in the blackout period, staker stakes more, and borrower auto-borrows.
        // Stake another 1M.
        await contract.mintAndApprove(stakers[0], stakerInitialBalance);
        await contract.stake(stakers[0], stakerInitialBalance);
        // Just a quick overview of the current state.
        expect(await liquidityStaking.getTotalActiveBalanceCurrentEpoch()).to.equal(2000000);
        expect(await liquidityStaking.getTotalActiveBalanceNextEpoch()).to.equal(1500000);
        expect(await liquidityStaking.getTotalInactiveBalanceCurrentEpoch()).to.equal(0);
        expect(await liquidityStaking.getTotalInactiveBalanceNextEpoch()).to.equal(500000);
        expect(
          await liquidityStaking.getAllocatedBalanceCurrentEpoch(borrowers[0].address)
        ).to.equal(800000);
        expect(
          await liquidityStaking.getAllocatedBalanceNextEpoch(borrowers[0].address)
        ).to.equal(600000);
        expect(await liquidityStaking.getContractBalanceAvailableToWithdraw()).to.equal(1800000);
        expect(await liquidityStaking.getBorrowedBalance(borrowers[0].address)).to.equal(200000);
        expect(await liquidityStaking.getBorrowableAmount(borrowers[0].address)).to.equal(400000);
        // Current active is 2M and next active is 1.5M.
        // We have an outstanding borrow of 0.2M.
        // Expect borrow to be limited by next active, so should be another 0.4M.
        results = await contract.autoPay(borrowers[0]);
        expectEqs(results, [stakerInitialBalance * 0.4, 0, 0]);

        // Next epoch: request withdraw everything.
        await contract.elapseEpoch();
        await contract.requestWithdrawal(stakers[0], (stakerInitialBalance * 5) / 4); // 0.25M
        await contract.requestWithdrawal(stakers[1], (stakerInitialBalance * 1) / 4); // 1.25M
        await advanceToBlackoutWindow();
        results = await contract.autoPay(borrowers[0]);
        expectEqs(results, [0, stakerInitialBalance * 0.6, 0]); // Repay 0.6M

        // After a non-reverting call to autoPay(), should never be overdue in the next epoch.
        await contract.elapseEpoch();
        expect(await liquidityStaking.isBorrowerOverdue(borrowers[0].address)).to.be.false;
      });

      it('Auto-pay will revert if borrower does not have funds to pay amount due by the next epoch', async () => {
        // Need repayment of 0.2M. Borrower currently has 0.4M.

        // Deposit 0.2M + 1 to the exchange.
        const starkKey = 123;
        await mockStarkPerpetual.registerUser(borrowers[0].address, starkKey, []);
        await borrowers[0].allowStarkKey(starkKey);
        await borrowers[0].depositToExchange(starkKey, 456, 789, stakerInitialBalance * 0.2 + 1);

        // Auto-pay will revert to indicate there are not enough funds to avoid a shortfall.
        await expect(contract.autoPay(borrowers[0])).to.be.revertedWith(
          'SP1Borrowing: Insufficient funds to avoid falling short on repayment',
        );

        // Withdraw (all) from the exchange, then deposit 0.2M again.
        await borrowers[0].withdrawFromExchange(starkKey, 456);
        await borrowers[0].depositToExchange(starkKey, 456, 789, stakerInitialBalance * 0.2);

        // Expect repay 0.2M
        const results = await contract.autoPay(borrowers[0]);
        expectEqs(results, [0, expectedAllocations[0] / 2, 0]);

        // After a non-reverting call to autoPay(), should never be overdue in the next epoch.
        await contract.elapseEpoch();
        expect(await liquidityStaking.isBorrowerOverdue(borrowers[0].address)).to.be.false;
      });
    });

    describe('When borrower has a debt due', async () => {
      before(async () => {
        await loadSnapshot(borrowerAllocationsSettledSnapshot);

        // Borrow full amount of 0.4M
        await contract.fullBorrowViaProxy(borrowers[0], stakerInitialBalance * 0.4);

        // Staker request withdrawal of 0.75M (3/4 the funds in the contract).
        await contract.elapseEpoch();
        await contract.requestWithdrawal(stakers[1], (stakerInitialBalance * 3) / 4);

        // Advance to the next epoch and mark debt.
        // Overdue amount is 0.15M against a requested amount of 0.75M.
        await contract.elapseEpoch();
        await contract.markDebt(
          {
            [borrowers[0].address]: stakerInitialBalance * 0.15,
          },
          [borrowers[0]],
          0.8 // (0.75 - 0.15) / 0.75
        );

        await saveSnapshot(borrowerAmountDue);
      });

      beforeEach(async () => {
        await loadSnapshot(borrowerAmountDue);
      });

      it('Auto-pay will pay outstanding debt if there are available funds to do so', async () => {
        // Borrowed, 0.4M and have not repaid any, but 0.15M was converted to debt.
        // The total active staked funds are 0.25M, and borrower's allocation is 40%, or 0.1M.
        //
        // So expect to owe 0.15M in debt and another 0.15M in borrow due by the next epoch.
        //
        // Make a partial repayment directly, first, and then call auto-pay.
        const earlyRepaymentAmount = 129787;
        await contract.repayBorrowViaProxy(borrowers[0], earlyRepaymentAmount);
        await advanceToBlackoutWindow();
        const results = await contract.autoPay(borrowers[0]);
        expectEqs(results, [
          0,
          stakerInitialBalance * 0.15 - earlyRepaymentAmount,
          stakerInitialBalance * 0.15,
        ]);

        // After a non-reverting call to autoPay(), should never be overdue in the next epoch.
        await contract.elapseEpoch();
        expect(await liquidityStaking.isBorrowerOverdue(borrowers[0].address)).to.be.false;
      });
    });

    describe('After restricted by guardian', () => {
      before(async () => {
        await loadSnapshot(borrowerAllocationsSettledSnapshot);
        await expect(
          borrowers[0].connect(testEnv.deployer.signer).guardianSetBorrowingRestriction(true)
        )
          .to.emit(borrowers[0], 'BorrowingRestrictionChanged')
          .withArgs(true);
        await saveSnapshot(borrowerRestrictedSnapshot);
      });

      beforeEach(async () => {
        await loadSnapshot(borrowerRestrictedSnapshot);
      });

      it('Auto-pay will not borrow (and will not revert) if bororwer is restricted by guardian', async () => {
        // Expect borrowable amount according to staking contract to be unchanged.
        expect(await liquidityStaking.getBorrowableAmount(borrowers[0].address)).to.equal(
          stakerInitialBalance * 0.4
        );

        // Expect borrowable amount according to proxy contract to be zero.
        expect(await borrowers[0].getBorrowableAmount()).to.equal(0);

        // Auto-pay results in zero borrow.
        const results = await contract.autoPay(borrowers[0]);
        expectEqs(results, [0, 0, 0]);

        // After a non-reverting call to autoPay(), should never be overdue in the next epoch.
        await contract.elapseEpoch();
        expect(await liquidityStaking.isBorrowerOverdue(borrowers[0].address)).to.be.false;
      });

      it('Borrower can borrow again if restriction is released', async () => {
        await expect(
          borrowers[0].connect(testEnv.deployer.signer).guardianSetBorrowingRestriction(false)
        )
          .to.emit(borrowers[0], 'BorrowingRestrictionChanged')
          .withArgs(false);

        // Borrow full amount of 0.4M.
        const results = await contract.autoPay(borrowers[0]);
        expectEqs(results, [expectedAllocations[0], 0, 0]);

        // After a non-reverting call to autoPay(), should never be overdue in the next epoch.
        await contract.elapseEpoch();
        expect(await liquidityStaking.isBorrowerOverdue(borrowers[0].address)).to.be.false;
      });
    });
  });

  /**
   * Progress to the blackout window of the current epoch.
   */
  async function advanceToBlackoutWindow(mineBlock: boolean = true): Promise<void> {
    let remaining = (await liquidityStaking.getTimeRemainingInCurrentEpoch()).toNumber() || EPOCH_LENGTH.toNumber();
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
