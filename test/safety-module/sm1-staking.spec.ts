import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import BNJS from 'bignumber.js';
import { expect } from 'chai';

import { ZERO_ADDRESS } from '../../src/lib/constants';
import { deployUpgradeable } from '../../src/migrations/helpers/deploy-upgradeable';
import { SafetyModuleV1, SafetyModuleV11__factory } from '../../types';
import { describeContract, TestContext } from '../helpers/describe-contract';
import {
  incrementTimeToTimestamp,
  latestBlockTimestamp,
} from '../helpers/evm';
import { StakingHelper } from '../helpers/staking-helper';

const stakerInitialBalance = 1_000_000;
const stakerInitialBalance2 = 4_000_000;

// Users.
let staker1: SignerWithAddress;
let staker2: SignerWithAddress;
let fundsRecipient: SignerWithAddress;

// Users calling the liquidity staking contract.
let stakerSigner1: SafetyModuleV1;
let stakerSigner2: SafetyModuleV1;

let distributionEnd: string;

let contract: StakingHelper;

async function init(ctx: TestContext) {
  // Users.
  [staker1, staker2, fundsRecipient] = ctx.users;

  // Users calling the liquidity staking contract.
  stakerSigner1 = ctx.safetyModule.connect(staker1);
  stakerSigner2 = ctx.safetyModule.connect(staker2);

  distributionEnd = (await ctx.safetyModule.DISTRIBUTION_END()).toString();

  // Use helper class to automatically check contract invariants after every update.
  contract = new StakingHelper(
    ctx,
    ctx.safetyModule,
    ctx.dydxToken,
    ctx.rewardsTreasury.address,
    ctx.deployer,
    ctx.deployer,
    [staker1, staker2],
    true,
  );

  // Mint to stakers.
  await contract.mintAndApprove(staker1, stakerInitialBalance);
  await contract.mintAndApprove(staker2, stakerInitialBalance2);

  // Set initial rewards rate to zero.
  await contract.setRewardsPerSecond(0);
}

describeContract('SM1Staking', init, (ctx: TestContext) => {

  before(() => {
    contract.saveSnapshot('main');
  });

  afterEach(() => {
    contract.loadSnapshot('main');
  });

  describe('stake', () => {

    it('User cannot stake if epoch zero has not started', async () => {
      const newDistributionStart = await latestBlockTimestamp() + 100;
      const [smBeforeEpochZero] = await deployUpgradeable(
        SafetyModuleV11__factory,
        ctx.deployer,
        [
          ctx.dydxToken.address,
          ctx.dydxToken.address,
          ctx.rewardsTreasury.address,
          newDistributionStart,
          ctx.config.SM_DISTRIBUTION_END,
        ],
        [
          ctx.config.EPOCH_LENGTH,
          newDistributionStart, // Must be in the future.
          ctx.config.BLACKOUT_WINDOW,
        ],
      );
      await expect(smBeforeEpochZero.stake(stakerInitialBalance)).to.be.revertedWith(
        'SM1EpochSchedule: Epoch zero has not started',
      );
    });

    it('User can successfully stake if epoch zero has started', async () => {
      await contract.stake(staker1, stakerInitialBalance);

      // `dydxToken` should be transferred to SafetyModuleV1 contract, and user should be given an
      // equivalent amount of `SM1ERC20` tokens
      expect(await ctx.dydxToken.balanceOf(staker1.address)).to.equal(0);
      expect(await ctx.dydxToken.balanceOf(ctx.safetyModule.address)).to.equal(
        stakerInitialBalance,
      );
      expect(await ctx.safetyModule.balanceOf(staker1.address)).to.equal(stakerInitialBalance);
    });
  });

  describe('requestWithdrawal', () => {

    it('User with nonzero staked balance can request a withdrawal after epoch zero has started', async () => {
      await contract.stake(staker1, stakerInitialBalance);
      await contract.requestWithdrawal(staker1, stakerInitialBalance);

      // `dydxToken` should still be owned by SafetyModuleV1 contract, and user should still own an
      // equivalent amount of `SM1ERC20` tokens
      expect(await ctx.dydxToken.balanceOf(staker1.address)).to.equal(0);
      expect(await ctx.dydxToken.balanceOf(ctx.safetyModule.address)).to.equal(
        stakerInitialBalance,
      );
      expect(await ctx.safetyModule.balanceOf(staker1.address)).to.equal(stakerInitialBalance);

      // Check balances. Note that the staking helper also does a lot of its own checks.
      //
      // Expect the next active balance to have decreased relative to the current active balance.
      expect(await ctx.safetyModule.getTotalActiveBalanceCurrentEpoch()).to.equal(stakerInitialBalance);
      expect(await ctx.safetyModule.getActiveBalanceCurrentEpoch(staker1.address)).to.equal(stakerInitialBalance);
      expect(await ctx.safetyModule.getActiveBalanceCurrentEpoch(staker2.address)).to.equal(0);
      expect(await ctx.safetyModule.getTotalActiveBalanceNextEpoch()).to.equal(0);
      expect(await ctx.safetyModule.getActiveBalanceNextEpoch(staker1.address)).to.equal(0);
      expect(await ctx.safetyModule.getActiveBalanceNextEpoch(staker2.address)).to.equal(0);
      // Expect the next inactive balance to have increased relative to the current inactive balance.
      expect(await ctx.safetyModule.getTotalInactiveBalanceCurrentEpoch()).to.equal(0);
      expect(await ctx.safetyModule.getInactiveBalanceCurrentEpoch(staker1.address)).to.equal(0);
      expect(await ctx.safetyModule.getInactiveBalanceCurrentEpoch(staker2.address)).to.equal(0);
      expect(await ctx.safetyModule.getTotalInactiveBalanceNextEpoch()).to.equal(stakerInitialBalance);
      expect(await ctx.safetyModule.getInactiveBalanceNextEpoch(staker1.address)).to.equal(stakerInitialBalance);
      expect(await ctx.safetyModule.getInactiveBalanceNextEpoch(staker2.address)).to.equal(0);
    });

    it('User with nonzero staked balance cannot request a withdrawal during blackout window', async () => {
      await contract.stake(staker1, stakerInitialBalance);

      const withinBlackoutWindow = (
        await latestBlockTimestamp() +
        Number(await ctx.safetyModule.getTimeRemainingInCurrentEpoch()) +
        ctx.config.EPOCH_LENGTH +
        ctx.config.BLACKOUT_WINDOW
      );
      await incrementTimeToTimestamp(withinBlackoutWindow);

      await expect(contract.requestWithdrawal(staker1, stakerInitialBalance)).to.be.revertedWith(
        'SM1Staking: Withdraw requests restricted in the blackout window',
      );

      // `dydxToken` should still be owned by SafetyModuleV1 contract, and user should still have an
      // equivalent amount of `SM1ERC20` tokens
      expect(await ctx.dydxToken.balanceOf(staker1.address)).to.equal(0);
      expect(await ctx.dydxToken.balanceOf(ctx.safetyModule.address)).to.equal(
        stakerInitialBalance,
      );
      expect(await ctx.safetyModule.balanceOf(staker1.address)).to.equal(stakerInitialBalance);
    });

    it('User with zero staked balance cannot request a withdrawal', async () => {
      await expect(contract.requestWithdrawal(staker1, 1)).to.be.revertedWith(
        'SM1Staking: Withdraw request exceeds next active balance',
      );
    });
  });

  describe('withdrawStake', () => {

    it('Staker can request and withdraw full balance', async () => {
      await contract.stake(staker1, stakerInitialBalance);
      await contract.requestWithdrawal(staker1, stakerInitialBalance);
      await contract.elapseEpoch(); // increase time to next epoch, so user can withdraw funds
      await contract.withdrawStake(staker1, fundsRecipient, stakerInitialBalance);

      // `dydxToken` should be sent to fundsRecipient, SafetyModuleV1 contract should own nothing
      // and user should have 0 staked token balance
      expect(await ctx.dydxToken.balanceOf(fundsRecipient.address)).to.equal(
        stakerInitialBalance,
      );
      expect(await ctx.dydxToken.balanceOf(staker1.address)).to.equal(0);
      expect(await ctx.dydxToken.balanceOf(ctx.safetyModule.address)).to.equal(0);
      expect(await ctx.safetyModule.balanceOf(staker1.address)).to.equal(0);
    });

    it('Staker can request full balance and make multiple partial withdrawals', async () => {
      await contract.stake(staker1, stakerInitialBalance);
      await contract.requestWithdrawal(staker1, stakerInitialBalance);
      await contract.elapseEpoch(); // increase time to next epoch, so user can withdraw funds
      const withdrawAmount = 1;
      await contract.withdrawStake(staker1, fundsRecipient, withdrawAmount);

      // `dydxToken` should be sent to fundsRecipient, SafetyModuleV1 contract should own remainder
      expect(await ctx.dydxToken.balanceOf(fundsRecipient.address)).to.equal(withdrawAmount);
      expect(await ctx.dydxToken.balanceOf(staker1.address)).to.equal(0);
      expect(await ctx.dydxToken.balanceOf(ctx.safetyModule.address)).to.equal(
        stakerInitialBalance - withdrawAmount,
      );

      // Additional withdrawal
      await contract.withdrawStake(staker1, fundsRecipient, 10);
      await contract.withdrawStake(staker1, fundsRecipient, 100);
      await contract.withdrawStake(staker1, fundsRecipient, stakerInitialBalance - 111);
    });

    it('Staker can make multiple partial requests and then a full withdrawal', async () => {
      await contract.stake(staker1, stakerInitialBalance);
      await contract.requestWithdrawal(staker1, 100);
      await contract.requestWithdrawal(staker1, 10);
      await contract.requestWithdrawal(staker1, 1);
      await contract.elapseEpoch(); // increase time to next epoch, so user can withdraw funds
      await contract.withdrawStake(staker1, fundsRecipient, 111);
    });

    it('Staker can make multiple partial requests and then multiple partial withdrawals', async () => {
      await contract.stake(staker1, stakerInitialBalance);
      await contract.requestWithdrawal(staker1, 100);
      await contract.requestWithdrawal(staker1, 10);
      await contract.requestWithdrawal(staker1, 1);
      await contract.elapseEpoch(); // increase time to next epoch, so user can withdraw funds
      await contract.withdrawStake(staker1, fundsRecipient, 50);
      await contract.withdrawStake(staker1, fundsRecipient, 60);
      await contract.withdrawStake(staker1, fundsRecipient, 1);
    });

    it('Staker cannot withdraw funds if none are staked', async () => {
      await expect(
        stakerSigner1.withdrawStake(staker1.address, stakerInitialBalance),
      ).to.be.revertedWith('SM1Staking: Withdraw amount exceeds staker inactive balance');
    });
  });

  describe('withdrawMaxStake', () => {

    it('Staker can request and withdraw full balance', async () => {
      await contract.stake(staker1, stakerInitialBalance);
      await contract.requestWithdrawal(staker1, stakerInitialBalance);
      await contract.elapseEpoch(); // increase time to next epoch, so user can withdraw funds
      await contract.withdrawMaxStake(staker1.address, fundsRecipient.address);

      // `dydxToken` should be sent to fundsRecipient, SafetyModuleV1 contract should own nothing
      // and user should have 0 staked token balance
      expect(await ctx.dydxToken.balanceOf(fundsRecipient.address)).to.equal(
        stakerInitialBalance,
      );
      expect(await ctx.dydxToken.balanceOf(staker1.address)).to.equal(0);
      expect(await ctx.dydxToken.balanceOf(ctx.safetyModule.address)).to.equal(0);
      expect(await ctx.safetyModule.balanceOf(staker1.address)).to.equal(0);
    });

    it('Staker can try to withdraw max stake even if there is none', async () => {
      await contract.withdrawMaxStake(staker1, staker1);
    });
  });

  describe('Transfer events', () => {

    it('Emits transfer events as expected', async () => {
      await expect(ctx.safetyModule.connect(staker1).stake(stakerInitialBalance))
        .to.emit(ctx.safetyModule, 'Transfer')
        .withArgs(ZERO_ADDRESS, staker1.address, stakerInitialBalance);

      await expect(ctx.safetyModule.connect(staker1).transfer(staker2.address, stakerInitialBalance))
        .to.emit(ctx.safetyModule, 'Transfer')
        .withArgs(staker1.address, staker2.address, stakerInitialBalance);

      await expect(ctx.safetyModule.connect(staker2).requestWithdrawal(stakerInitialBalance))
        .not.to.emit(ctx.safetyModule, 'Transfer');

      await contract.elapseEpoch(); // increase time to next epoch, so user can withdraw funds
      await expect(ctx.safetyModule.connect(staker2).withdrawStake(fundsRecipient.address, stakerInitialBalance))
        .to.emit(ctx.safetyModule, 'Transfer')
        .withArgs(staker2.address, ZERO_ADDRESS, stakerInitialBalance);
    });
  });

  describe('claimRewards', () => {

    it('User with staked balance can claim rewards', async () => {
      // Repeat with different rewards rates.
      await contract.stake(staker1, stakerInitialBalance);
      let lastTimestamp = await latestBlockTimestamp();
      for (const rewardsRate of [1]) {
        await contract.setRewardsPerSecond(rewardsRate);
        await contract.elapseEpoch(); // Earn one epoch of rewards.
        await contract.claimRewards(staker1, fundsRecipient, lastTimestamp);
        lastTimestamp = await latestBlockTimestamp();
        await contract.elapseEpoch(); // Earn one epoch of rewards.
        await contract.claimRewards(staker1, fundsRecipient, lastTimestamp);
        lastTimestamp = await latestBlockTimestamp();
        await contract.elapseEpoch(); // Earn one epoch of rewards.
        await contract.claimRewards(staker1, fundsRecipient, lastTimestamp);
        lastTimestamp = await latestBlockTimestamp();
      }
    });

    it('User with nonzero staked balance for one epoch but emission rate was zero cannot claim rewards', async () => {
      await contract.stake(staker1, stakerInitialBalance);

      // increase time to next epoch, so user can earn rewards
      await contract.elapseEpoch();

      // change EMISSION_RATE to be greater than 0
      const emissionRate = 1;
      await expect(ctx.safetyModule.connect(ctx.deployer).setRewardsPerSecond(emissionRate))
        .to.emit(ctx.safetyModule, 'RewardsPerSecondUpdated')
        .withArgs(emissionRate);

      expect(await stakerSigner1.callStatic.claimRewards(fundsRecipient.address)).to.equal(0);
    });

    it('Multiple users can stake, requestWithdrawal, withdrawStake, and claimRewards', async () => {
      // change EMISSION_RATE to be greater than 0
      const emissionRate = 1;
      await contract.setRewardsPerSecond(emissionRate);

      await contract.stake(staker1, stakerInitialBalance);
      const stakeTimestamp1 = await latestBlockTimestamp();
      await contract.stake(staker2, stakerInitialBalance2);
      const stakeTimestamp2 = await latestBlockTimestamp();

      await contract.requestWithdrawal(staker1, stakerInitialBalance);
      await contract.requestWithdrawal(staker2, stakerInitialBalance2);

      await contract.elapseEpoch();

      const totalBalance = stakerInitialBalance + stakerInitialBalance2;

      const beforeClaim1 = await latestBlockTimestamp();
      const numTokens1: number = new BNJS(beforeClaim1)
        .minus(stakeTimestamp1)
        .times(emissionRate)
        .times(stakerInitialBalance)
        .div(totalBalance)
        .toNumber();

      expect(
        (await stakerSigner1.callStatic.claimRewards(staker1.address)).toNumber(),
      ).to.be.closeTo(numTokens1, 2);

      const beforeClaim2 = await latestBlockTimestamp();
      const numTokens2: number = new BNJS(beforeClaim2)
        .minus(stakeTimestamp2)
        .times(emissionRate)
        .times(stakerInitialBalance2)
        .div(totalBalance)
        .toNumber();
      expect(
        (await stakerSigner2.callStatic.claimRewards(staker2.address)).toNumber(),
      ).to.be.closeTo(numTokens2, 2);
    });

    it('User with nonzero staked balance does not earn rewards after distributionEnd', async () => {
      await incrementTimeToTimestamp(
        Number(distributionEnd) - ctx.config.EPOCH_LENGTH,
      );

      // change EMISSION_RATE to be greater than 0
      const emissionRate = 1;
      await expect(ctx.safetyModule.connect(ctx.deployer).setRewardsPerSecond(emissionRate))
        .to.emit(ctx.safetyModule, 'RewardsPerSecondUpdated')
        .withArgs(emissionRate);

      // expect the `stake` call to succeed, else we can't test `claimRewards`
      await contract.stake(staker1.address, stakerInitialBalance);
      const stakedTimestamp = await latestBlockTimestamp();

      // move multiple epochs forward so we're after DISTRIBUTION_END
      // (user should only earn rewards for last epoch)
      for (let i = 0; i < 5; i++) {
        await contract.elapseEpoch();
      }

      const numTokens = new BNJS(distributionEnd)
        .minus(stakedTimestamp)
        .times(emissionRate)
        .toNumber();
      await expect(stakerSigner1.claimRewards(staker1.address))
        .to.emit(ctx.safetyModule, 'ClaimedRewards')
        .withArgs(staker1.address, staker1.address, numTokens);

      // verify user can withdraw and doesn't earn additional rewards
      await contract.requestWithdrawal(staker1.address, stakerInitialBalance);

      await contract.elapseEpoch();
      await contract.withdrawStake(staker1.address, staker1.address, stakerInitialBalance);

      // user shouldn't have any additional rewards since it's after DISTRIBUTION_END
      await expect(stakerSigner1.claimRewards(staker1.address))
        .to.emit(ctx.safetyModule, 'ClaimedRewards')
        .withArgs(staker1.address, staker1.address, 0);
    });
  });

  describe('transfer', () => {

    it('User with staked balance can transfer to another user', async () => {
      await contract.stake(staker1, stakerInitialBalance);

      await contract.transfer(staker1, staker2, stakerInitialBalance);

      expect(await ctx.safetyModule.balanceOf(staker1.address)).to.equal(0);
      expect(await ctx.safetyModule.balanceOf(staker2.address)).to.equal(stakerInitialBalance);
    });

    it('User with staked balance for one epoch can transfer to another user and claim rewards', async () => {
      // change EMISSION_RATE to be greater than 0
      const emissionRate = 1;
      await expect(ctx.safetyModule.connect(ctx.deployer).setRewardsPerSecond(emissionRate))
        .to.emit(ctx.safetyModule, 'RewardsPerSecondUpdated')
        .withArgs(emissionRate);

      await contract.stake(staker1, stakerInitialBalance);
      const stakeTimestamp = await latestBlockTimestamp();

      // increase time to next epoch, so user can earn rewards
      await contract.elapseEpoch();

      await contract.transfer(staker1, staker2, stakerInitialBalance);

      const balanceBeforeClaiming = await ctx.dydxToken.balanceOf(staker1.address);
      const now = await latestBlockTimestamp();
      const numTokens = new BNJS(now)
        .minus(stakeTimestamp)
        .times(emissionRate)
        .toNumber();
      await expect(stakerSigner1.claimRewards(staker1.address))
        .to.emit(ctx.safetyModule, 'ClaimedRewards')
        .withArgs(staker1.address, staker1.address, numTokens);
      expect(await ctx.dydxToken.balanceOf(staker1.address)).to.equal(
        balanceBeforeClaiming.add(numTokens).toString(),
      );
    });
  });

  describe('transferFrom', () => {

    it('User with staked balance can transfer to another user', async () => {
      await contract.stake(staker1, stakerInitialBalance);

      await contract.approve(staker1, staker2, stakerInitialBalance);
      await contract.transferFrom(staker2, staker1, staker2, stakerInitialBalance);

      expect(await ctx.safetyModule.balanceOf(staker1.address)).to.equal(0);
      expect(await ctx.safetyModule.balanceOf(staker2.address)).to.equal(stakerInitialBalance);
    });
  });
});
