import { expect } from 'chai';
import { BigNumber } from 'ethers';

import { timeLatest, evmSnapshot, evmRevert, increaseTime } from '../../../helpers/misc-utils';
import {
  CLAIM_OPERATOR_ROLE_KEY,
  DEBT_OPERATOR_ROLE_KEY,
  EPOCH_LENGTH,
  STAKE_OPERATOR_ROLE_KEY,
} from '../../../helpers/constants';
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
const afterShortfall = 'AfterShortfall';

const stakerInitialBalance: number = 1_000_000;

makeSuite('LS1Operators', deployPhase2, (testEnv: TestEnv) => {
  let deployer: SignerWithAddress;
  let rewardsTreasury: SignerWithAddress;
  let liquidityStakingV1: LiquidityStakingV1;
  let mockStakedToken: MintableErc20;
  let dydxToken: DydxToken;

  // Users.
  let stakers: SignerWithAddress[];
  let borrowers: SignerWithAddress[];
  let operator: SignerWithAddress;

  // Smart contract callers.
  let operatorSigner: LiquidityStakingV1;

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
    operator = testEnv.users[5];

    operatorSigner = liquidityStakingV1.connect(operator.signer);

    distributionStart = (await liquidityStakingV1.DISTRIBUTION_START()).toString();
    distributionEnd = (await liquidityStakingV1.DISTRIBUTION_END()).toString();

    // Use helper class to automatically check contract invariants after every update.
    contract = new StakingHelper(
      liquidityStakingV1,
      mockStakedToken,
      rewardsTreasury,
      deployer,
      deployer,
      stakers.concat(borrowers).concat([deployer, operator]),
      false,
    );

    // Mint staked tokens and set allowances.
    await Promise.all(stakers.map((s) => contract.mintAndApprove(s, stakerInitialBalance)));
    await Promise.all(borrowers.map((b) => contract.approveContract(b, stakerInitialBalance)));

    await saveSnapshot(afterMockTokenMint);
  });

  describe('Stake and claim operators', () => {
    beforeEach(async () => {
      await loadSnapshot(afterMockTokenMint);
      await incrementTimeToTimestamp(distributionStart);
    });

    it('The stake operator can withdraw stake on behalf of a user', async () => {
      const largeBalance = stakerInitialBalance * 100;

      await contract.addOperator(operator, STAKE_OPERATOR_ROLE_KEY);
      await contract.mintAndApprove(operator, largeBalance);

      // Stake using the operator's funds, and withdraw back to the operator.
      await operatorSigner.stakeFor(stakers[0].address, largeBalance);
      await operatorSigner.requestWithdrawalFor(stakers[0].address, largeBalance);
      await contract.elapseEpoch();
      await operatorSigner.withdrawStakeFor(stakers[0].address, operator.address, largeBalance);

      expect(await mockStakedToken.balanceOf(operator.address)).to.equal(largeBalance);
    });

    it('Another user can stake on behalf of a user, but not withdraw', async () => {
      const stakerSigner = liquidityStakingV1.connect(stakers[1].signer);

      await stakerSigner.stakeFor(stakers[0].address, stakerInitialBalance);
      await expect(stakerSigner.requestWithdrawalFor(stakers[0].address, 1)).to.be.revertedWith(
        'revert AccessControl: account'
      );
    });

    it('The claim operator can claim rewards on behalf of a user', async () => {
      await contract.addOperator(operator, CLAIM_OPERATOR_ROLE_KEY);

      const initialBalance = await dydxToken.balanceOf(operator.address);

      const rewardsRate = 16;
      await contract.setRewardsPerSecond(rewardsRate);
      await contract.stake(stakers[0], stakerInitialBalance);
      await contract.elapseEpoch();
      await operatorSigner.claimRewardsFor(stakers[0].address, operator.address);

      const finalBalance = await dydxToken.balanceOf(operator.address);
      const amountReceived = finalBalance.sub(initialBalance).toNumber();
      const expectedReceived = EPOCH_LENGTH.mul(rewardsRate).toNumber();
      expect(amountReceived).to.be.closeTo(expectedReceived, 100);
    });
  });

  describe('Debt operator', () => {
    before(async () => {
      await loadSnapshot(afterMockTokenMint);

      // Before epoch 0: Set borrower allocations.
      await contract.setBorrowerAllocations({
        [borrowers[0].address]: 0.4,
        [borrowers[1].address]: 0.6,
      });

      // Epoch 0: Deposit, borrow, request withdrawal.
      await incrementTimeToTimestamp(distributionStart);
      await contract.stake(stakers[0], 500);
      await contract.stake(stakers[1], 500);
      await contract.borrow(borrowers[0], 400);
      await contract.borrow(borrowers[1], 600);
      await contract.requestWithdrawal(stakers[0], 200);
      await contract.requestWithdrawal(stakers[1], 300);

      // Epoch 1: Full shortfall.
      await contract.elapseEpoch();
      await contract.markDebt(
        {
          [borrowers[0].address]: 200,
          [borrowers[1].address]: 300,
        },
        borrowers, // Expect both borrowers to be restricted.
        0 // Expected new index.
      );
      // Expect staker debt balances.
      await contract.expectStakerDebt({
        [stakers[0].address]: 200,
        [stakers[1].address]: 300,
      });
      await saveSnapshot(afterShortfall);
    });

    beforeEach(async () => {
      await loadSnapshot(afterShortfall);
    });

    it('The admin can add and remove debt operators', async () => {
      await contract.addOperator(operator, DEBT_OPERATOR_ROLE_KEY);
      await contract.addOperator(borrowers[0], DEBT_OPERATOR_ROLE_KEY);
      await contract.removeOperator(borrowers[0], DEBT_OPERATOR_ROLE_KEY);
      await contract.removeOperator(operator, DEBT_OPERATOR_ROLE_KEY);
    });

    it('The debt operator can reduce staker debt balances', async () => {
      // Repay debt so that there are debt funds available.
      await contract.repayDebt(borrowers[1], borrowers[1], 100);

      // Add debt operator and decrease staker debt.
      await contract.addOperator(operator, DEBT_OPERATOR_ROLE_KEY);
      await contract.decreaseStakerDebt(operator, stakers[0], 200, {
        skipStakerVsBorrowerDebtComparison: true,
      });

      // Check that the debt cannot be further decreased by the manager.
      await expect(contract.decreaseStakerDebt(operator, stakers[0], 1)).to.be.revertedWith(
        'SafeMath: subtraction overflow'
      );

      // Check that the staker cannot withdraw debt anymore.
      await expect(contract.withdrawDebt(stakers[0], stakers[0], 1)).to.be.revertedWith(
        'LS1Staking: Withdraw debt exceeds debt owed'
      );

      // Re-balance by reducing borrower debt an equal amount.
      await contract.decreaseBorrowerDebt(operator, borrowers[0], 200);

      // The other staker can still withdraw debt. Can withdraw 100 since that's what was repaid.
      await contract.fullWithdrawDebt(stakers[1], 100);
    });

    it('The debt operator can reduce borrower debt balances', async () => {
      await contract.addOperator(operator, DEBT_OPERATOR_ROLE_KEY);
      await contract.decreaseBorrowerDebt(operator, borrowers[0], 200, {
        skipStakerVsBorrowerDebtComparison: true,
      });

      // Check that the debt cannot be further decreased by the manager.
      await expect(contract.decreaseBorrowerDebt(operator, borrowers[0], 1)).to.be.revertedWith(
        'SafeMath: subtraction overflow'
      );

      // Check that the debt cannot be further decreased by the borrower.
      await expect(contract.repayDebt(borrowers[0], borrowers[0], 1)).to.be.revertedWith(
        'LS1Borrowing: Repay > debt'
      );

      // Re-balance by reducing staker debt an equal amount.
      await contract.decreaseStakerDebt(operator, stakers[0], 200);
    });

    it('A non-debt operator cannot reduce debt balances', async () => {
      // Try with admin.
      const debtOperatorRole: string = (await contract.getRoles())[DEBT_OPERATOR_ROLE_KEY];
      const nonDebtOperatorAddress: string = stakers[0].address;
      await expect(
        contract.decreaseStakerDebt(nonDebtOperatorAddress, stakers[0], 0)
      ).to.be.revertedWith(
        `AccessControl: account ${nonDebtOperatorAddress.toLowerCase()} is missing role ${debtOperatorRole}`
      );
      await expect(contract.decreaseBorrowerDebt(stakers[0], borrowers[0], 0)).to.be.revertedWith(
        `AccessControl: account ${nonDebtOperatorAddress.toLowerCase()} is missing role ${debtOperatorRole}`
      );

      const newDebtOperator: string = stakers[1].address;
      await contract.addOperator(newDebtOperator, DEBT_OPERATOR_ROLE_KEY);
      await contract.removeOperator(newDebtOperator, DEBT_OPERATOR_ROLE_KEY);

      // Try with debt operator who was removed.
      await expect(contract.decreaseStakerDebt(newDebtOperator, stakers[0], 0)).to.be.revertedWith(
        `AccessControl: account ${newDebtOperator.toLowerCase()} is missing role ${debtOperatorRole}`
      );

      await expect(
        contract.decreaseBorrowerDebt(newDebtOperator, borrowers[0], 0)
      ).to.be.revertedWith(
        `AccessControl: account ${newDebtOperator.toLowerCase()} is missing role ${debtOperatorRole}`
      );
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
  expect(latestBlockTimestamp.toNumber()).to.be.at.most(
    timestamp.toNumber(),
    'incrementTimeToTimestamp: going backwards in time'
  );
  const timestampDiff: number = timestamp.sub(latestBlockTimestamp.toString()).toNumber();
  await increaseTime(timestampDiff);
}
