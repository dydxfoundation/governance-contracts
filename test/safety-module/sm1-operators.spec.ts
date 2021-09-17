import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';

import { Role } from '../../src/types';
import { SafetyModuleV1 } from '../../types';
import { describeContract, TestContext } from '../helpers/describe-contract';
import {
  incrementTimeToTimestamp,
} from '../helpers/evm';
import { StakingHelper } from '../helpers/staking-helper';

const stakerInitialBalance: number = 1_000_000;

// Users.
let stakers: SignerWithAddress[];
let operator: SignerWithAddress;

// Smart contract callers.
let operatorSigner: SafetyModuleV1;

let distributionStart: string;

let contract: StakingHelper;

async function init(ctx: TestContext) {
  // Users.
  stakers = ctx.users.slice(1, 3); // 2 stakers
  operator = ctx.users[3];

  operatorSigner = ctx.safetyModule.connect(operator);

  distributionStart = (await ctx.safetyModule.DISTRIBUTION_START()).toString();

  // Use helper class to automatically check contract invariants after every update.
  contract = new StakingHelper(
    ctx,
    ctx.safetyModule,
    ctx.dydxToken,
    ctx.rewardsTreasury.address,
    ctx.deployer,
    ctx.deployer,
    stakers.concat([ctx.deployer, operator]),
    true,
  );

  // Mint staked tokens and set allowances.
  await Promise.all(stakers.map((s) => contract.mintAndApprove(s, stakerInitialBalance)));
}

describeContract('SM1Operator', init, (ctx: TestContext) => {

  before(() => {
    contract.saveSnapshot('main');
  });

  afterEach(() => {
    contract.loadSnapshot('main');
  });

  describe('Stake and claim operators', () => {

    beforeEach(async () => {
      await incrementTimeToTimestamp(distributionStart);
    });

    it('The stake operator can withdraw stake on behalf of a user', async () => {
      const largeBalance = stakerInitialBalance * 100;

      await contract.addOperator(operator, Role.STAKE_OPERATOR_ROLE);
      await contract.mintAndApprove(operator, largeBalance);

      // Stake using the operator's funds, and withdraw back to the operator.
      await operatorSigner.stakeFor(stakers[0].address, largeBalance);
      await operatorSigner.requestWithdrawalFor(stakers[0].address, largeBalance);
      await contract.elapseEpoch();
      await operatorSigner.withdrawStakeFor(stakers[0].address, operator.address, largeBalance);

      expect(await ctx.dydxToken.balanceOf(operator.address)).to.equal(largeBalance);
    });

    it('Another user can stake on behalf of a user, but not withdraw', async () => {
      const stakerSigner = ctx.safetyModule.connect(stakers[1]);

      await stakerSigner.stakeFor(stakers[0].address, stakerInitialBalance);
      await expect(stakerSigner.requestWithdrawalFor(stakers[0].address, 1)).to.be.revertedWith(
        'AccessControl: account',
      );
    });

    it('The claim operator can claim rewards on behalf of a user', async () => {
      // Safety module rewards first begin in the middle of the epoch.
      // Advance to the start of an epoch.
      await contract.elapseEpoch();

      await contract.addOperator(operator, Role.CLAIM_OPERATOR_ROLE);

      const initialBalance = await ctx.dydxToken.balanceOf(operator.address);

      const rewardsRate = 16;
      await contract.setRewardsPerSecond(rewardsRate);
      await contract.stake(stakers[0], stakerInitialBalance);
      await contract.elapseEpoch();
      await operatorSigner.claimRewardsFor(stakers[0].address, operator.address);

      const finalBalance = await ctx.dydxToken.balanceOf(operator.address);
      const amountReceived = finalBalance.sub(initialBalance).toNumber();
      const expectedReceived = ctx.config.EPOCH_LENGTH * rewardsRate;
      expect(amountReceived).to.be.closeTo(expectedReceived, 100);
    });
  });
});
