/**
 * Safety Module snapshots test cases, wrapped in a function to allow parametrization.
 */
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { BigNumber, BigNumberish } from 'ethers';

import { DelegationType } from '../../../src/types';
import { SafetyModuleV1 } from '../../../types';
import { describeContract, TestContext } from '../../helpers/describe-contract';
import {
  advanceBlock,
  increaseTimeAndMine,
  latestBlock,
} from '../../helpers/evm';

type Stakers = [SignerWithAddress, SignerWithAddress];

export function addSnapshotsTestCases(
  getStakers: (ctx: TestContext) => Stakers | Promise<Stakers>,
): void {
  // Users.
  let staker1: SignerWithAddress;
  let staker2: SignerWithAddress;

  // Initial balance.
  let staker1InitialTokenBalance: BigNumber;

  // Safety Module contract connected to the first user by default.
  let safetyModule: SafetyModuleV1;

  async function init(ctx: TestContext) {
    [staker1, staker2] = await getStakers(ctx);

    safetyModule = ctx.safetyModule.connect(staker1);

    // Send tokens to first user.
    await ctx.dydxToken.transfer(staker1.address, 100_000_000);
    await ctx.dydxToken.connect(staker1).approve(ctx.safetyModule.address, 100_000_000);

    staker1InitialTokenBalance = await ctx.dydxToken.balanceOf(staker1.address);
  }

  describeContract('Safety Module snapshots - getPowerAtBlock()', init, (ctx: TestContext) => {

    it('Governance power is initially zero', async () => {
      await expectPowerAtBlock(staker1, 0, 0);
      await expectPowerRelativeBlock(staker1, 0, 0);
      await expect(expectPowerRelativeBlock(staker1, 1, 0)).to.be.revertedWith(
        'SM1Snapshots: INVALID_BLOCK_NUMBER',
      );
    });

    it('Governance power increases by staking', async () => {
      await safetyModule.stake(1250);
      await expectPowerRelativeBlock(staker1, -1, 0);
      await expectPowerRelativeBlock(staker1, 0, 1250);
    });

    it('Governance power can be delegated', async () => {
      await safetyModule.stake(1250);

      await safetyModule.delegateByType(staker2.address, DelegationType.PROPOSITION_POWER);
      await expectPowerRelativeBlock(staker1, -1, 1250, DelegationType.PROPOSITION_POWER);
      await expectPowerRelativeBlock(staker1, 0, 0, DelegationType.PROPOSITION_POWER);
      await expectPowerRelativeBlock(staker2, -1, 0, DelegationType.PROPOSITION_POWER);
      await expectPowerRelativeBlock(staker2, 0, 1250, DelegationType.PROPOSITION_POWER);

      await expectPowerRelativeBlock(staker1, -1, 1250, DelegationType.VOTING_POWER);
      await expectPowerRelativeBlock(staker1, 0, 1250, DelegationType.VOTING_POWER);
      await expectPowerRelativeBlock(staker2, -1, 0, DelegationType.VOTING_POWER);
      await expectPowerRelativeBlock(staker2, 0, 0, DelegationType.VOTING_POWER);

      await safetyModule.delegateByType(staker2.address, DelegationType.VOTING_POWER);
      await expectPowerRelativeBlock(staker1, -1, 1250, DelegationType.VOTING_POWER);
      await expectPowerRelativeBlock(staker1, 0, 0, DelegationType.VOTING_POWER);
      await expectPowerRelativeBlock(staker2, -1, 0, DelegationType.VOTING_POWER);
      await expectPowerRelativeBlock(staker2, 0, 1250, DelegationType.VOTING_POWER);
    });

    it('Governance power can be transfered', async () => {
      await safetyModule.stake(1250); // [1250, 0]
      await safetyModule.transfer(staker2.address, 100); // [1150, 100]
      await safetyModule.transfer(staker2.address, 200); // [950, 300]
      await safetyModule.transfer(staker2.address, 400); // [550, 700]
      await safetyModule.connect(staker2).transfer(staker1.address, 250); // [800, 450]
      await safetyModule.transfer(staker2.address, 800); // [0, 1250]
      await safetyModule.connect(staker2).transfer(staker1.address, 625); // [625, 625]

      await expectPowerRelativeBlock(staker1, -7, 0);
      await expectPowerRelativeBlock(staker2, -7, 0);

      await expectPowerRelativeBlock(staker1, -6, 1250);
      await expectPowerRelativeBlock(staker2, -6, 0);

      await expectPowerRelativeBlock(staker1, -5, 1150);
      await expectPowerRelativeBlock(staker2, -5, 100);

      await expectPowerRelativeBlock(staker1, -4, 950);
      await expectPowerRelativeBlock(staker2, -4, 300);

      await expectPowerRelativeBlock(staker1, -3, 550);
      await expectPowerRelativeBlock(staker2, -3, 700);

      await expectPowerRelativeBlock(staker1, -2, 800);
      await expectPowerRelativeBlock(staker2, -2, 450);

      await expectPowerRelativeBlock(staker1, -1, 0);
      await expectPowerRelativeBlock(staker2, -1, 1250);

      await expectPowerRelativeBlock(staker1, 0, 625);
      await expectPowerRelativeBlock(staker2, 0, 625);
    });

    it('Governance power is affected by slashing', async () => {
      await safetyModule.stake(1250); // [1250, 0]
      await ctx.safetyModule.slash(250, ctx.deployer.address);

      await expectPowerRelativeBlock(staker1, -1, 1250);
      await expectPowerRelativeBlock(staker1, 0, 1000);

      // Skip some blocks.
      for (let i = 0; i < 10; i++) {
        await advanceBlock();
      }

      await expectPowerRelativeBlock(staker1, -11, 1250);
      await expectPowerRelativeBlock(staker1, -10, 1000);
      await expectPowerRelativeBlock(staker1, 0, 1000);

      // Transfer one fifth of the staked position.
      await safetyModule.transfer(staker2.address, 250); // [1000, 250]
      await expectPowerRelativeBlock(staker1, -1, 1000);
      await expectPowerRelativeBlock(staker2, -1, 0);
      await expectPowerRelativeBlock(staker1, 0, 800);
      await expectPowerRelativeBlock(staker2, 0, 200);

      // Delegate the rest of the position, for voting power only.
      await safetyModule.delegateByType(staker2.address, DelegationType.VOTING_POWER);
      await expectPowerRelativeBlock(staker1, -2, 1000);
      await expectPowerRelativeBlock(staker2, -2, 0);
      await expectPowerRelativeBlock(staker1, -1, 800);
      await expectPowerRelativeBlock(staker2, -1, 200);
      await expectPowerRelativeBlock(staker1, 0, 800, DelegationType.PROPOSITION_POWER);
      await expectPowerRelativeBlock(staker2, 0, 200, DelegationType.PROPOSITION_POWER);
      await expectPowerRelativeBlock(staker1, 0, 0, DelegationType.VOTING_POWER);
      await expectPowerRelativeBlock(staker2, 0, 1000, DelegationType.VOTING_POWER);

      // Stake some more.
      await safetyModule.stake(1000); // [2250, 250]
      await expectPowerRelativeBlock(staker1, -1, 800, DelegationType.PROPOSITION_POWER);
      await expectPowerRelativeBlock(staker2, -1, 200, DelegationType.PROPOSITION_POWER);
      await expectPowerRelativeBlock(staker1, -1, 0, DelegationType.VOTING_POWER);
      await expectPowerRelativeBlock(staker2, -1, 1000, DelegationType.VOTING_POWER);
      await expectPowerRelativeBlock(staker1, 0, 1800, DelegationType.PROPOSITION_POWER);
      await expectPowerRelativeBlock(staker2, 0, 200, DelegationType.PROPOSITION_POWER);
      await expectPowerRelativeBlock(staker1, 0, 0, DelegationType.VOTING_POWER);
      await expectPowerRelativeBlock(staker2, 0, 2000, DelegationType.VOTING_POWER);

      // Skip some blocks.
      for (let i = 0; i < 7; i++) {
        await advanceBlock();
      }

      // Slash again, by 40%.
      await ctx.safetyModule.slash(800, ctx.deployer.address);
      await expectPowerRelativeBlock(staker1, -9, 800, DelegationType.PROPOSITION_POWER);
      await expectPowerRelativeBlock(staker2, -9, 200, DelegationType.PROPOSITION_POWER);
      await expectPowerRelativeBlock(staker1, -9, 0, DelegationType.VOTING_POWER);
      await expectPowerRelativeBlock(staker2, -9, 1000, DelegationType.VOTING_POWER);
      await expectPowerRelativeBlock(staker1, -8, 1800, DelegationType.PROPOSITION_POWER);
      await expectPowerRelativeBlock(staker2, -8, 200, DelegationType.PROPOSITION_POWER);
      await expectPowerRelativeBlock(staker1, -8, 0, DelegationType.VOTING_POWER);
      await expectPowerRelativeBlock(staker2, -8, 2000, DelegationType.VOTING_POWER);
      await expectPowerRelativeBlock(staker1, -7, 1800, DelegationType.PROPOSITION_POWER);
      await expectPowerRelativeBlock(staker2, -7, 200, DelegationType.PROPOSITION_POWER);
      await expectPowerRelativeBlock(staker1, -7, 0, DelegationType.VOTING_POWER);
      await expectPowerRelativeBlock(staker2, -7, 2000, DelegationType.VOTING_POWER);
      await expectPowerRelativeBlock(staker1, 0, 1080, DelegationType.PROPOSITION_POWER);
      await expectPowerRelativeBlock(staker2, 0, 120, DelegationType.PROPOSITION_POWER);
      await expectPowerRelativeBlock(staker1, 0, 0, DelegationType.VOTING_POWER);
      await expectPowerRelativeBlock(staker2, 0, 1200, DelegationType.VOTING_POWER);
    });

    it('Governance power is not affected by withdrawal requests', async () => {
      await safetyModule.stake(1250); // [1250, 0]
      await ctx.safetyModule.slash(250, ctx.deployer.address);

      await safetyModule.requestWithdrawal(1250);
      await expectPowerRelativeBlock(staker1, 0, 1000);

      // Elapse epochs...
      await increaseTimeAndMine((await safetyModule.getTimeRemainingInCurrentEpoch()).toNumber());
      await expectPowerRelativeBlock(staker1, 0, 1000);
      await increaseTimeAndMine((await safetyModule.getTimeRemainingInCurrentEpoch()).toNumber());
      await expectPowerRelativeBlock(staker1, 0, 1000);
      await increaseTimeAndMine((await safetyModule.getTimeRemainingInCurrentEpoch()).toNumber());
      await expectPowerRelativeBlock(staker1, 0, 1000);
    });

    it('Governance power is affected by withdrawals', async () => {
      await safetyModule.stake(1250); // [1250, 0]
      await ctx.safetyModule.slash(250, ctx.deployer.address);
      await safetyModule.requestWithdrawal(1250);
      await increaseTimeAndMine((await safetyModule.getTimeRemainingInCurrentEpoch()).toNumber());
      await expectPowerRelativeBlock(staker1, 0, 1000);

      const tokenBalanceAfterStaking = staker1InitialTokenBalance.sub(1250);

      await expectBalances(staker1, tokenBalanceAfterStaking, 1250);
      await safetyModule.withdrawStake(staker1.address, 125);
      await expectPowerRelativeBlock(staker1, 0, 900);
      await expectBalances(staker1, tokenBalanceAfterStaking.add(100), 1125);
      await safetyModule.withdrawStake(staker1.address, 125);
      await expectPowerRelativeBlock(staker1, 0, 800);
      await expectBalances(staker1, tokenBalanceAfterStaking.add(200), 1000);
      await safetyModule.withdrawStake(staker1.address, 250);
      await expectPowerRelativeBlock(staker1, 0, 600);
      await expectBalances(staker1, tokenBalanceAfterStaking.add(400), 750);

      // Slash again, by 50%.
      await ctx.safetyModule.slash(300, ctx.deployer.address);
      await expectPowerRelativeBlock(staker1, 0, 300);

      // Withdraw the remaining stake.
      await safetyModule.withdrawStake(staker1.address, 750);
      await expectPowerRelativeBlock(staker1, 0, 0);
      await expectPowerRelativeBlock(staker1, -1, 300);
      await expectPowerRelativeBlock(staker1, -2, 600);
      await expectPowerRelativeBlock(staker1, -3, 800);
      await expectPowerRelativeBlock(staker1, -4, 900);
      await expectPowerRelativeBlock(staker1, -5, 1000);
      await expectBalances(staker1, tokenBalanceAfterStaking.add(700), 0);
    });

    async function expectBalances(
      user: SignerWithAddress,
      tokenBalance: BigNumberish,
      stakedTokenBalance: BigNumberish,
    ): Promise<void> {
      expect(await ctx.dydxToken.balanceOf(user.address)).to.equal(tokenBalance);
      expect(await ctx.safetyModule.balanceOf(user.address)).to.equal(stakedTokenBalance);
    }

    async function expectPowerRelativeBlock(
      user: SignerWithAddress,
      relativeBlockNumber: number,
      amount: number,
      optionalType: DelegationType | null = null,
    ): Promise<void> {
      return expectPowerAtBlock(
        user,
        await latestBlock() + relativeBlockNumber,
        amount,
        optionalType,
      );
    }

    async function expectPowerAtBlock(
      user: SignerWithAddress,
      blockNumber: number,
      amount: number,
      optionalType: DelegationType | null = null,
    ): Promise<void> {
      if (optionalType !== DelegationType.VOTING_POWER) {
        expect(await ctx.safetyModule.getPowerAtBlock(
          user.address,
          blockNumber,
          DelegationType.PROPOSITION_POWER,
        )).to.equal(amount);
      }
      if (optionalType !== DelegationType.PROPOSITION_POWER) {
        expect(await ctx.safetyModule.getPowerAtBlock(
          user.address,
          blockNumber,
          DelegationType.VOTING_POWER,
        )).to.equal(amount);
      }
    }
  });
}
