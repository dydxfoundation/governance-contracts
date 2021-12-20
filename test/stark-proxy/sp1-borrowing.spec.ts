import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { BigNumberish, BigNumber } from 'ethers';

import { getRole } from '../../src/lib/util';
import { impersonateAndFundAccount } from '../../src/migrations/helpers/impersonate-account';
import { Role } from '../../src/types';
import { IERC20 } from '../../types/IERC20';
import { IStarkPerpetual } from '../../types/IStarkPerpetual';
import { LiquidityStakingV1 } from '../../types/LiquidityStakingV1';
import { StarkProxyV1 } from '../../types/StarkProxyV1';
import { describeContractHardhatRevertBefore, TestContext } from '../helpers/describe-contract';
import { increaseTime, increaseTimeAndMine, loadSnapshot, saveSnapshot } from '../helpers/evm';
import { findAddressWithRole } from '../helpers/get-address-with-role';
import { StakingHelper } from '../helpers/staking-helper';

// Snapshots
const snapshots = new Map<string, string>();
const fundsStakedSnapshot = 'FundsStaked';
const borrowerAllocationsSettledSnapshot = 'BorrowerAllocationsSettled';
const borrowerAmountDue = 'BorrowerAmountDue';
const borrowerRestrictedSnapshot = 'BorrowerRestrictedSnapshot';

const stakerInitialBalance: number = 1_000_000;

// Contracts.
let liquidityStaking: LiquidityStakingV1;
let mockStakedToken: IERC20;
let mockStarkPerpetual: IStarkPerpetual;
let shortTimelockSigner: SignerWithAddress;

// Users.
let deployer: SignerWithAddress;
let stakers: SignerWithAddress[];
let borrowerStarkProxies: StarkProxyV1[];

let expectedAllocations: number[];

let contract: StakingHelper;

let epochLength: BigNumber;
let blackoutWindow: BigNumber;

async function init(ctx: TestContext) {
  ({
    liquidityStaking,
    deployer,
  } = ctx);

  mockStakedToken = ctx.dydxCollateralToken;
  mockStarkPerpetual = ctx.starkPerpetual;

  blackoutWindow = await liquidityStaking.getBlackoutWindow();
  epochLength = (await liquidityStaking.getEpochParameters())[0];

  // Users.
  stakers = ctx.users.slice(1, 3); // 2 stakers
  const borrowers = await Promise.all(ctx.starkProxies.map(async b => {
    const ownerAddress = await findAddressWithRole(b, Role.OWNER_ROLE);
    return impersonateAndFundAccount(ownerAddress);
  }));

  borrowerStarkProxies = borrowers.map((b: SignerWithAddress, i: number) => ctx.starkProxies[i].connect(b));

  // Grant roles.
  await Promise.all(borrowerStarkProxies.map(async b => {
    await b.grantRole(getRole(Role.EXCHANGE_OPERATOR_ROLE), deployer.address);
    await b.grantRole(getRole(Role.BORROWER_ROLE), deployer.address);
  }));

  shortTimelockSigner = await impersonateAndFundAccount(ctx.shortTimelock.address);

  // Use helper class to automatically check contract invariants after every update.
  contract = new StakingHelper(
    ctx,
    liquidityStaking,
    mockStakedToken,
    ctx.rewardsTreasury.address,
    deployer,
    shortTimelockSigner,
    stakers.concat(borrowers),
    false,
  );

  // Mint staked tokens and set allowances.
  await Promise.all(stakers.map((s) => contract.mintAndApprove(s, stakerInitialBalance)));

  // Initial stake of 1M.
  await contract.stake(stakers[0], stakerInitialBalance / 4);
  await contract.stake(stakers[1], (stakerInitialBalance / 4) * 3);
  await saveSnapshot(snapshots, fundsStakedSnapshot, contract);
}

describeContractHardhatRevertBefore('SP1Borrowing', init, () => {

  describe('After stake is deposited and allocations are set', () => {
    before(async () => {
      await loadSnapshot(snapshots, fundsStakedSnapshot, contract);

      // Allocations: [40%, 60%]
      await contract.setBorrowerAllocations({
        [borrowerStarkProxies[0].address]: 0.4,
        [borrowerStarkProxies[1].address]: 0.6,
        [borrowerStarkProxies[2].address]: 0.0,
        [borrowerStarkProxies[3].address]: 0.0,
        [borrowerStarkProxies[4].address]: 0.0,
      });
      expectedAllocations = [stakerInitialBalance * 0.4, stakerInitialBalance * 0.6];

      // Enter the blackout window.
      await contract.elapseEpoch();
      await advanceToBlackoutWindow();

      await saveSnapshot(snapshots, borrowerAllocationsSettledSnapshot, contract);
    });

    describe('Before borrowing', () => {
      beforeEach(async () => {
        await loadSnapshot(snapshots, borrowerAllocationsSettledSnapshot, contract);
      });

      it('Auto-pay cannot be called outside the blackout window', async () => {
        await contract.elapseEpoch();
        await expect(borrowerStarkProxies[0].autoPayOrBorrow()).to.be.revertedWith(
          'SP1Borrowing: Auto-pay may only be used during the blackout window',
        );
      });

      it('Auto-pay will borrow full borrowable amount', async () => {
        const results = await contract.autoPay(borrowerStarkProxies[0]);
        expectEqs(results, [expectedAllocations[0], 0, 0]);

        // After a non-reverting call to autoPay(), should never be overdue in the next epoch.
        await contract.elapseEpoch();
        expect(await liquidityStaking.isBorrowerOverdue(borrowerStarkProxies[0].address)).to.equal(false);
      });
    });

    describe('When borrower has an amount due', () => {
      before(async () => {
        await loadSnapshot(snapshots, borrowerAllocationsSettledSnapshot, contract);

        // Borrow full amount of 0.4M
        await contract.fullBorrowViaProxy(borrowerStarkProxies[0], stakerInitialBalance * 0.4);

        // Staker request withdrawal of 0.5M (half the funds in the contract).
        await contract.elapseEpoch();
        await contract.requestWithdrawal(stakers[1], stakerInitialBalance / 2); // 0.5M

        // Enter the blackout window.
        await advanceToBlackoutWindow();

        await saveSnapshot(snapshots, borrowerAmountDue, contract);
      });

      beforeEach(async () => {
        await loadSnapshot(snapshots, borrowerAmountDue, contract);
      });

      it('Auto-pay will repay the borrow amount due', async () => {
        // Expect repay 0.2M
        let results = await contract.autoPay(borrowerStarkProxies[0]);
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
          await liquidityStaking.getAllocatedBalanceCurrentEpoch(borrowerStarkProxies[0].address),
        ).to.equal(800000);
        expect(
          await liquidityStaking.getAllocatedBalanceNextEpoch(borrowerStarkProxies[0].address),
        ).to.equal(600000);
        expect(await liquidityStaking.getContractBalanceAvailableToWithdraw()).to.equal(1800000);
        expect(await liquidityStaking.getBorrowedBalance(borrowerStarkProxies[0].address)).to.equal(200000);
        expect(await liquidityStaking.getBorrowableAmount(borrowerStarkProxies[0].address)).to.equal(400000);
        // Current active is 2M and next active is 1.5M.
        // We have an outstanding borrow of 0.2M.
        // Expect borrow to be limited by next active, so should be another 0.4M.
        results = await contract.autoPay(borrowerStarkProxies[0]);
        expectEqs(results, [stakerInitialBalance * 0.4, 0, 0]);

        // Next epoch: request withdraw everything.
        await contract.elapseEpoch();
        await contract.requestWithdrawal(stakers[0], (stakerInitialBalance * 5) / 4); // 0.25M
        await contract.requestWithdrawal(stakers[1], (stakerInitialBalance * 1) / 4); // 1.25M
        await advanceToBlackoutWindow();
        results = await contract.autoPay(borrowerStarkProxies[0]);
        expectEqs(results, [0, stakerInitialBalance * 0.6, 0]); // Repay 0.6M

        // After a non-reverting call to autoPay(), should never be overdue in the next epoch.
        await contract.elapseEpoch();
        expect(await liquidityStaking.isBorrowerOverdue(borrowerStarkProxies[0].address)).to.equal(false);
      });

      it('Auto-pay will revert if borrower does not have funds to pay amount due by the next epoch', async () => {
        // Need repayment of 0.2M. Borrower currently has 0.4M.

        // Deposit 0.2M + 1 to the exchange.
        const starkKey = 123;
        await mockStarkPerpetual.registerUser(borrowerStarkProxies[0].address, starkKey, []);
        await borrowerStarkProxies[0].allowStarkKey(starkKey);
        await borrowerStarkProxies[0].depositToExchange(starkKey, 456, 789, stakerInitialBalance * 0.2 + 1);

        // Auto-pay will revert to indicate there are not enough funds to avoid a shortfall.
        await expect(contract.autoPay(borrowerStarkProxies[0])).to.be.revertedWith(
          'SP1Borrowing: Insufficient funds to avoid falling short on repayment',
        );

        // Withdraw (all) from the exchange, then deposit 0.2M again.
        await borrowerStarkProxies[0].withdrawFromExchange(starkKey, 456);
        await borrowerStarkProxies[0].depositToExchange(starkKey, 456, 789, stakerInitialBalance * 0.2);

        // Expect repay 0.2M
        const results = await contract.autoPay(borrowerStarkProxies[0]);
        expectEqs(results, [0, expectedAllocations[0] / 2, 0]);

        // After a non-reverting call to autoPay(), should never be overdue in the next epoch.
        await contract.elapseEpoch();
        expect(await liquidityStaking.isBorrowerOverdue(borrowerStarkProxies[0].address)).to.equal(false);
      });
    });

    describe('When borrower has a debt due', () => {
      before(async () => {
        await loadSnapshot(snapshots, borrowerAllocationsSettledSnapshot, contract);

        // Borrow full amount of 0.4M
        await contract.fullBorrowViaProxy(borrowerStarkProxies[0], stakerInitialBalance * 0.4);

        // Staker request withdrawal of 0.75M (3/4 the funds in the contract).
        await contract.elapseEpoch();
        await contract.requestWithdrawal(stakers[1], (stakerInitialBalance * 3) / 4);

        // Advance to the next epoch and mark debt.
        // Overdue amount is 0.15M against a requested amount of 0.75M.
        await contract.elapseEpoch();
        await contract.markDebt(
          {
            [borrowerStarkProxies[0].address]: stakerInitialBalance * 0.15,
          },
          [borrowerStarkProxies[0].address],
          0.8, // (0.75 - 0.15) / 0.75
        );

        await saveSnapshot(snapshots, borrowerAmountDue, contract);
      });

      beforeEach(async () => {
        await loadSnapshot(snapshots, borrowerAmountDue, contract);
      });

      it('Auto-pay will pay outstanding debt if there are available funds to do so', async () => {
        // Borrowed, 0.4M and have not repaid any, but 0.15M was converted to debt.
        // The total active staked funds are 0.25M, and borrower's allocation is 40%, or 0.1M.
        //
        // So expect to owe 0.15M in debt and another 0.15M in borrow due by the next epoch.
        //
        // Make a partial repayment directly, first, and then call auto-pay.
        const earlyRepaymentAmount = 129787;
        await contract.repayBorrowViaProxy(borrowerStarkProxies[0], earlyRepaymentAmount);
        await advanceToBlackoutWindow();
        const results = await contract.autoPay(borrowerStarkProxies[0]);
        expectEqs(results, [
          0,
          stakerInitialBalance * 0.15 - earlyRepaymentAmount,
          stakerInitialBalance * 0.15,
        ]);

        // After a non-reverting call to autoPay(), should never be overdue in the next epoch.
        await contract.elapseEpoch();
        expect(await liquidityStaking.isBorrowerOverdue(borrowerStarkProxies[0].address)).to.equal(false);
      });
    });

    describe('After restricted by guardian', () => {
      before(async () => {
        await loadSnapshot(snapshots, borrowerAllocationsSettledSnapshot, contract);
        await expect(
          borrowerStarkProxies[0].connect(shortTimelockSigner).guardianSetBorrowingRestriction(true),
        )
          .to.emit(borrowerStarkProxies[0], 'BorrowingRestrictionChanged')
          .withArgs(true);
        await saveSnapshot(snapshots, borrowerRestrictedSnapshot, contract);
      });

      beforeEach(async () => {
        await loadSnapshot(snapshots, borrowerRestrictedSnapshot, contract);
      });

      it('Auto-pay will not borrow (and will not revert) if borrower is restricted by guardian', async () => {
        // Expect borrowable amount according to staking contract to be unchanged.
        expect(await liquidityStaking.getBorrowableAmount(borrowerStarkProxies[0].address)).to.equal(
          stakerInitialBalance * 0.4,
        );

        // Expect borrowable amount according to proxy contract to be zero.
        expect(await borrowerStarkProxies[0].getBorrowableAmount()).to.equal(0);

        // Auto-pay results in zero borrow.
        const results = await contract.autoPay(borrowerStarkProxies[0]);
        expectEqs(results, [0, 0, 0]);

        // After a non-reverting call to autoPay(), should never be overdue in the next epoch.
        await contract.elapseEpoch();
        expect(await liquidityStaking.isBorrowerOverdue(borrowerStarkProxies[0].address)).to.equal(false);
      });

      it('Borrower can borrow again if restriction is released', async () => {
        await expect(
          borrowerStarkProxies[0].connect(shortTimelockSigner).guardianSetBorrowingRestriction(false),
        )
          .to.emit(borrowerStarkProxies[0], 'BorrowingRestrictionChanged')
          .withArgs(false);

        // Borrow full amount of 0.4M.
        const results = await contract.autoPay(borrowerStarkProxies[0]);
        expectEqs(results, [expectedAllocations[0], 0, 0]);

        // After a non-reverting call to autoPay(), should never be overdue in the next epoch.
        await contract.elapseEpoch();
        expect(await liquidityStaking.isBorrowerOverdue(borrowerStarkProxies[0].address)).to.equal(false);
      });
    });
  });

  /**
   * Progress to the blackout window of the current epoch.
   */
  async function advanceToBlackoutWindow(mineBlock: boolean = true): Promise<void> {
    const remaining = (await liquidityStaking.getTimeRemainingInCurrentEpoch()).toNumber() || epochLength.toNumber();
    const timeUntilBlackoutWindow = remaining - blackoutWindow.toNumber();
    if (mineBlock) {
      await increaseTimeAndMine(timeUntilBlackoutWindow);
    } else {
      await increaseTime(timeUntilBlackoutWindow);
    }
  }
});

function expectEqs(actual: BigNumberish[], expected: BigNumberish[]): void {
  expect(actual).to.have.length(expected.length);
  for (let i = 0; i < expected.length; i++) {
    expect(actual[i], `expectEqs[${i}]: ${actual}`).to.be.equal(expected[i]);
  }
}
