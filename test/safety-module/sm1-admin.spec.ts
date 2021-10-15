import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { BigNumber } from 'ethers';

import { deployUpgradeable } from '../../src/migrations/helpers/deploy-upgradeable';
import { SafetyModuleV11, SafetyModuleV11__factory } from '../../types';
import { describeContract, TestContext } from '../helpers/describe-contract';
import { increaseTimeAndMine, latestBlockTimestamp } from '../helpers/evm';
import { StakingHelper } from '../helpers/staking-helper';

const stakerInitialBalance: number = 1_000_000;

// Users.
let stakers: SignerWithAddress[];

let initialOffset: BigNumber;
let contract: StakingHelper;

// Second Safety Module for test cases to test behavior before epoch zero.
let smBeforeEpochZero: SafetyModuleV11;
let smBeforeEpochZeroInitialOffset: number;

async function init(ctx: TestContext) {
  // Users.
  stakers = ctx.users.slice(1, 3); // 2 stakers

  const epochParams = await ctx.safetyModule.getEpochParameters();
  initialOffset = epochParams.offset;

  // Use helper class to automatically check contract invariants after every update.
  contract = new StakingHelper(
    ctx,
    ctx.safetyModule,
    ctx.dydxToken,
    ctx.rewardsTreasury.address,
    ctx.deployer,
    ctx.deployer,
    stakers,
    false,
  );

  // Mint staked tokens and set allowances.
  await Promise.all(stakers.map((s) => contract.mintAndApprove(s, stakerInitialBalance)));

  // Create a second, separate instance of the Safety Module, which can be used when we want to
  // test against a safety module which has not yet started epoch zero.
  smBeforeEpochZeroInitialOffset = await latestBlockTimestamp() + 500;
  [smBeforeEpochZero] = await deployUpgradeable(
    SafetyModuleV11__factory,
    ctx.deployer,
    [
      ctx.dydxToken.address,
      ctx.dydxToken.address,
      ctx.rewardsTreasury.address,
      smBeforeEpochZeroInitialOffset,
      ctx.config.SM_DISTRIBUTION_END,
    ],
    [
      ctx.config.EPOCH_LENGTH,
      smBeforeEpochZeroInitialOffset, // Must be in the future.
      ctx.config.BLACKOUT_WINDOW,
    ],
  );
}

describeContract('SM1Admin', init, (ctx: TestContext) => {

  before(() => {
    contract.saveSnapshot('main');
  });

  afterEach(() => {
    contract.loadSnapshot('main');
  });

  describe('Before epoch zero has started', () => {

    it('Can set valid epoch & blackout parameters which do not jump past the start of epoch zero', async () => {
      const currentTime = await latestBlockTimestamp();

      // Double epoch length.
      // We would now be in the blackout window, except that it doesn't apply before epoch zero.
      const newEpochLength = ctx.config.EPOCH_LENGTH * 2;
      await smBeforeEpochZero.setEpochParameters(newEpochLength, smBeforeEpochZeroInitialOffset);

      // Increase blackout window to fill the whole epoch.
      await smBeforeEpochZero.setBlackoutWindow(newEpochLength);

      // Decrease blackout window to zero.
      await smBeforeEpochZero.setBlackoutWindow(0);

      // Decrease epoch length.
      await smBeforeEpochZero.setEpochParameters(1, smBeforeEpochZeroInitialOffset);

      // Set different offsets. Any offset should be valid as long as it's in the future.
      await smBeforeEpochZero.setEpochParameters(ctx.config.EPOCH_LENGTH, currentTime + 30);
      await smBeforeEpochZero.setEpochParameters(ctx.config.EPOCH_LENGTH, currentTime + 100000);
    });

    it('Cannot set epoch parameters which jump past the start of epoch zero', async () => {
      const currentTime = await latestBlockTimestamp();
      await expect(smBeforeEpochZero.setEpochParameters(ctx.config.EPOCH_LENGTH, currentTime)).to.be.revertedWith(
        'SM1Admin: Started epoch zero',
      );
      await expect(
        smBeforeEpochZero.setEpochParameters(ctx.config.EPOCH_LENGTH, currentTime - 10000),
      ).to.be.revertedWith('SM1Admin: Started epoch zero');
    });

    it('Can set the emission rate', async () => {
      await smBeforeEpochZero.setRewardsPerSecond(123);
    });
  });

  describe('After epoch zero has started', () => {

    beforeEach(async () => {
      const latestTimestamp = await latestBlockTimestamp();
      // Move roughly midway into an epoch, before the blackout window.
      const timeRemainingInEpoch = (
        ctx.config.EPOCH_LENGTH -
        ((latestTimestamp - ctx.config.EPOCH_ZERO_START) % ctx.config.EPOCH_LENGTH)
      );
      const timeToElapse = timeRemainingInEpoch + ctx.config.EPOCH_LENGTH * 0.49;
      await increaseTimeAndMine(timeToElapse);
    });

    it('Can set epoch parameters which keep the same epoch number', async () => {
      const latestTimestamp = await latestBlockTimestamp();
      const currentEpoch = (await contract.getCurrentEpoch()).toNumber();
      const newEpochLength = ctx.config.EPOCH_LENGTH / 3;

      // Change the blackout period.
      await contract.setBlackoutWindow(ctx.config.BLACKOUT_WINDOW / 4);

      // Set an epoch schedule with shorter epochs.
      await contract.setEpochParameters(
        newEpochLength,
        latestTimestamp - ((currentEpoch + 0.5) * newEpochLength),
      );

      // Set an epoch schedule with longer epochs.
      const newEpochLength2 = ctx.config.EPOCH_LENGTH * 2;
      await contract.setEpochParameters(
        newEpochLength2,
        latestTimestamp - ((currentEpoch + 0.5) * newEpochLength2),
      );
    });

    it('Can set epoch parameters which move us into the blackout window', async () => {
      // Change the offset to move us into the blackout window.
      await contract.setEpochParameters(
        ctx.config.EPOCH_LENGTH,
        initialOffset.sub(ctx.config.EPOCH_LENGTH / 2 - 1000), // Move us 1000 seconds before epoch end.
      );
    });

    it('Can set blackout window length which move us into the blackout window', async () => {
      // Expand the blackout window to include the current timestamp.
      await contract.setBlackoutWindow(ctx.config.EPOCH_LENGTH * 4 / 5);

      expect(await ctx.safetyModule.inBlackoutWindow()).to.be.true();
    });

    it('Cannot set epoch parameters which decrease the current epoch number', async () => {
      // Change the offset by one epoch.
      await expect(
        contract.setEpochParameters(ctx.config.EPOCH_LENGTH, initialOffset.add(ctx.config.EPOCH_LENGTH)),
      ).to.be.revertedWith('SM1Admin: Changed epochs');
    });

    it('Cannot set epoch parameters which increase the current epoch number', async () => {
      // Change the offset by one epoch.
      await expect(
        contract.setEpochParameters(ctx.config.EPOCH_LENGTH, initialOffset.sub(ctx.config.EPOCH_LENGTH)),
      ).to.be.revertedWith('SM1Admin: Changed epochs');
    });

    it('Cannot set epoch parameters which put us before epoch zero', async () => {
      // Change the offset by one epoch.
      await expect(
        contract.setEpochParameters(ctx.config.EPOCH_LENGTH, initialOffset.add(ctx.config.EPOCH_LENGTH * 10)),
      ).to.be.revertedWith('SM1EpochSchedule: Epoch zero has not started');
    });

    it('Can set the emission rate', async () => {
      await contract.setRewardsPerSecond(123);
    });
  });

  describe('While in the blackout window', () => {

    beforeEach(async () => {
      // Move to the middle of a blackout window.
      const latestTimestamp = await latestBlockTimestamp();
      const timeRemainingInEpoch = (
        ctx.config.EPOCH_LENGTH -
        ((latestTimestamp - ctx.config.EPOCH_ZERO_START) % ctx.config.EPOCH_LENGTH)
      );
      const timeToElapse = (
        timeRemainingInEpoch +
        ctx.config.EPOCH_LENGTH * 3 -
        ctx.config.BLACKOUT_WINDOW / 2
      );
      await increaseTimeAndMine(timeToElapse);
      expect(await ctx.safetyModule.inBlackoutWindow()).to.be.true();
    });

    it('Can set epoch parameters', async () => {
      await contract.setEpochParameters(ctx.config.EPOCH_LENGTH, initialOffset);
    });

    it('Can set blackout window', async () => {
      await contract.setBlackoutWindow(ctx.config.BLACKOUT_WINDOW);
    });

    it('Can set the emission rate', async () => {
      await contract.setRewardsPerSecond(123);
    });
  });
});
