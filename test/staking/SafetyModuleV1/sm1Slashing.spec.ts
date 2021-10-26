import BNJS from 'bignumber.js';
import { BigNumber } from 'ethers';

import { deployPhase2, makeSuite, SignerWithAddress, TestEnv } from '../../test-helpers/make-suite';
import {
  timeLatest,
  evmSnapshot,
  evmRevert,
  increaseTime,
  increaseTimeAndMine,
  advanceBlock,
  incrementTimeToTimestamp,
} from '../../../helpers/misc-utils';
import { EPOCH_LENGTH } from '../../../helpers/constants';
import { StakingHelper } from '../../test-helpers/staking-helper';
import { SafetyModuleV1 } from '../../../types/SafetyModuleV1';
import { expect } from 'chai';
import { DydxToken } from '../../../types/DydxToken';
import { deployMintableErc20, deploySafetyModuleV1 } from '../../../helpers/contracts-deployments';
import { DEPLOY_CONFIG } from '../../../tasks/helpers/deploy-config';

const snapshots = new Map<string, string>();

const afterDistributionStarted = 'AfterDistributionStarted';

const stakerInitialBalance: number = 1_000_000;

makeSuite('SM1Slashing', deployPhase2, (testEnv: TestEnv) => {
  // Contracts.
  let deployer: SignerWithAddress;
  let rewardsTreasury: SignerWithAddress;
  let safetyModule: SafetyModuleV1;
  let dydxToken: DydxToken;

  // Users.
  let staker1: SignerWithAddress;
  let staker2: SignerWithAddress;
  let fundsRecipient: SignerWithAddress;

  // Users calling the liquidity staking contract.
  let stakerSigner1: SafetyModuleV1;
  let stakerSigner2: SafetyModuleV1;

  let distributionStart: string;

  let contract: StakingHelper;

  before(async () => {
    ({
      safetyModule,
      dydxToken,
      rewardsTreasury,
      deployer,
    } = testEnv);

    // Users.
    [staker1, staker2, fundsRecipient] = testEnv.users.slice(1);

    // Users calling the liquidity staking contract.
    stakerSigner1 = safetyModule.connect(staker1.signer);
    stakerSigner2 = safetyModule.connect(staker2.signer);

    distributionStart = (await safetyModule.DISTRIBUTION_START()).toString();

    // Use helper class to automatically check contract invariants after every update.
    contract = new StakingHelper(
      safetyModule,
      dydxToken,
      rewardsTreasury,
      deployer,
      deployer,
      [staker1, staker2],
      true,
    );

    // Empty user balances.
    await dydxToken.connect(staker1.signer).transfer(deployer.address, await dydxToken.balanceOf(staker1.address));
    await dydxToken.connect(staker2.signer).transfer(deployer.address, await dydxToken.balanceOf(staker2.address));
    await dydxToken.connect(fundsRecipient.signer).transfer(deployer.address, await dydxToken.balanceOf(fundsRecipient.address));

    // Mint to stakers 1 and 2.
    await contract.mintAndApprove(staker1, stakerInitialBalance);
    await contract.mintAndApprove(staker2, stakerInitialBalance);

    // Set initial rewards rate to zero.
    await contract.setRewardsPerSecond(0);

    // Start rewards.
    await incrementTimeToTimestamp(distributionStart);

    saveSnapshot(afterDistributionStarted);
  });

  afterEach(async () => {
    await loadSnapshot(afterDistributionStarted);
  });

  describe('slash', () => {

    it('slashing when there are no balances does nothing', async () => {
      await safetyModule.connect(deployer.signer).slash(0, fundsRecipient.address);
      await safetyModule.connect(deployer.signer).slash(1, fundsRecipient.address);
      await safetyModule.connect(deployer.signer).slash(stakerInitialBalance, fundsRecipient.address);
      expect(await safetyModule.getExchangeRateSnapshotCount()).to.equal(0);
    });

    it('slashing when there is only one token does nothing', async () => {
      await contract.stake(staker1, 1);
      await safetyModule.connect(deployer.signer).slash(0, fundsRecipient.address);
      await safetyModule.connect(deployer.signer).slash(1, fundsRecipient.address);
      await safetyModule.connect(deployer.signer).slash(stakerInitialBalance, fundsRecipient.address);
      expect(await safetyModule.getExchangeRateSnapshotCount()).to.equal(0);
    });

    it('slashing zero does nothing', async () => {
      await contract.stake(staker1, stakerInitialBalance);
      await safetyModule.connect(deployer.signer).slash(0, fundsRecipient.address);

      // Check underlying token balances.
      expect(await dydxToken.balanceOf(staker1.address)).to.equal(0);
      expect(await dydxToken.balanceOf(safetyModule.address)).to.equal(stakerInitialBalance);
      expect(await dydxToken.balanceOf(fundsRecipient.address)).to.equal(0);

      // Check stake balances.
      expect(await safetyModule.balanceOf(staker1.address)).to.equal(stakerInitialBalance);
      expect(await safetyModule.totalSupply()).to.equal(stakerInitialBalance);

      // Check slash snapshots.
      expect(await safetyModule.getExchangeRateSnapshotCount()).to.equal(0);
    });

    it('slashes one token', async () => {
      // Stake 2 tokens.
      await contract.stake(staker1, 2);

      // Request to slash 3 tokens, should be limited to 1.
      await safetyModule.connect(deployer.signer).slash(3, fundsRecipient.address);

      // Check underlying token balances.
      expect(await dydxToken.balanceOf(safetyModule.address)).to.equal(1);
      expect(await dydxToken.balanceOf(fundsRecipient.address)).to.equal(1);

      // Check stake balances.
      expect(await safetyModule.balanceOf(staker1.address)).to.equal(2);
      expect(await safetyModule.totalSupply()).to.equal(2);

      // Check slash snapshots.
      expect(await safetyModule.getExchangeRateSnapshotCount()).to.equal(1);
    });

    it('does not affect stake balance, but affects gov power and tokens received on withdrawal', async () => {
      const slashAmount = stakerInitialBalance / 2;
      const remainingAmount = stakerInitialBalance - slashAmount;
      await contract.stake(staker1, stakerInitialBalance);
      await safetyModule.connect(deployer.signer).slash(slashAmount, fundsRecipient.address);

      // Check underlying token balances.
      expect(await dydxToken.balanceOf(staker1.address)).to.equal(0);
      expect(await dydxToken.balanceOf(safetyModule.address)).to.equal(remainingAmount);
      expect(await dydxToken.balanceOf(fundsRecipient.address)).to.equal(slashAmount);

      // Check stake balances.
      expect(await safetyModule.balanceOf(staker1.address)).to.equal(stakerInitialBalance);
      expect(await safetyModule.balanceOf(safetyModule.address)).to.equal(0);
      expect(await safetyModule.balanceOf(fundsRecipient.address)).to.equal(0);
      expect(await safetyModule.totalSupply()).to.equal(stakerInitialBalance);

      // Check slash snapshots.
      await advanceBlock();
      await advanceBlock();
      const slashBlock = await getLatestSlashBlockNumber(safetyModule);
      expect(await safetyModule.getExchangeRateSnapshotCount()).to.equal(1);
      expect((await safetyModule.getExchangeRateSnapshot(0))[0]).to.equal(slashBlock);
      expect((await safetyModule.getExchangeRateSnapshot(0))[1]).to.equal('2000000000000000000'); // 2e18

      // Check gov power.
      expect(await safetyModule.getPowerAtBlock(staker1.address, slashBlock - 1, 0)).to.equal(stakerInitialBalance);
      expect(await safetyModule.getPowerAtBlock(staker1.address, slashBlock - 1, 1)).to.equal(stakerInitialBalance);
      expect(await safetyModule.getPowerAtBlock(staker1.address, slashBlock, 0)).to.equal(remainingAmount);
      expect(await safetyModule.getPowerAtBlock(staker1.address, slashBlock, 1)).to.equal(remainingAmount);
      expect(await safetyModule.getPowerAtBlock(staker1.address, slashBlock + 1, 0)).to.equal(remainingAmount);
      expect(await safetyModule.getPowerAtBlock(staker1.address, slashBlock + 1, 1)).to.equal(remainingAmount);
      expect(await safetyModule.getPowerCurrent(staker1.address, 0)).to.equal(remainingAmount);
      expect(await safetyModule.getPowerCurrent(staker1.address, 1)).to.equal(remainingAmount);

      // Withdraw funds.
      await contract.requestWithdrawal(staker1, stakerInitialBalance); // In stake units
      await elapseEpoch();
      const withdrawalAmount = await contract.withdrawMaxStake(staker1, staker1);
      expect(withdrawalAmount).to.equal(stakerInitialBalance); // In stake units

      // Check underlying token balances.
      expect(await dydxToken.balanceOf(staker1.address)).to.equal(remainingAmount);
      expect(await dydxToken.balanceOf(safetyModule.address)).to.equal(0);
      expect(await dydxToken.balanceOf(fundsRecipient.address)).to.equal(slashAmount);

      // Check total supply.
      expect(await safetyModule.totalSupply()).to.equal(0);
    });

    it('does not affect rewards earned', async () => {
      await contract.stake(staker1, stakerInitialBalance);

      // Earn some rewards before the slash.
      let lastTimestamp = (await timeLatest()).toNumber();
      await contract.setRewardsPerSecond(150);
      await elapseEpoch();

      // Slash.
      await safetyModule.connect(deployer.signer).slash(stakerInitialBalance / 2, fundsRecipient.address);

      // Earn some rewards after the slash.
      await elapseEpoch();

      // Slash again.
      await safetyModule.connect(deployer.signer).slash(stakerInitialBalance / 4, fundsRecipient.address);

      // Earn some rewards after the second slash.
      await elapseEpoch();

      // Claim rewards (with assertions within the helper function).
      await contract.claimRewards(staker1, fundsRecipient, lastTimestamp);
    });

    it('affects rewards earned relative to a new depositor', async () => {
      await contract.stake(staker1, stakerInitialBalance);

      // Slash by 50%, three times.
      await safetyModule.connect(deployer.signer).slash(stakerInitialBalance / 2, fundsRecipient.address)
      await safetyModule.connect(deployer.signer).slash(stakerInitialBalance / 4, fundsRecipient.address)
      await safetyModule.connect(deployer.signer).slash(stakerInitialBalance / 8, fundsRecipient.address)

      // Second staker after first three slashes.
      await contract.stake(staker2, stakerInitialBalance);

      // Slash again by 50%.
      await safetyModule.connect(deployer.signer).slash((await dydxToken.balanceOf(safetyModule.address)).div(2), fundsRecipient.address)

      // Earn some rewards after the slash.
      const lastTimestamp = (await timeLatest()).toNumber();
      await contract.setRewardsPerSecond(150);
      await elapseEpoch();

      // Expect staker 2 to earn an 8x share vs. staker 1.
      const staker1Rewards = await contract.claimRewards(staker1, fundsRecipient, lastTimestamp, null, 1 / 9);
      const staker2Rewards = await contract.claimRewards(staker2, fundsRecipient, lastTimestamp, null, 8 / 9);
      const error = staker1Rewards.mul(8).sub(staker2Rewards).abs().toNumber()
      expect(error).to.be.lte(300);
    });
  });

  describe('max slash', () => {

    it('slashes 95%', async () => {
      await contract.stake(staker1, stakerInitialBalance);
      await safetyModule.connect(deployer.signer).slash(stakerInitialBalance, fundsRecipient.address);

      // Check underlying token balances.
      expect(await dydxToken.balanceOf(staker1.address)).to.equal(0);
      expect(await dydxToken.balanceOf(safetyModule.address)).to.equal(stakerInitialBalance / 20);
      expect(await dydxToken.balanceOf(fundsRecipient.address)).to.equal(stakerInitialBalance / 20 * 19);

      // Check stake balances.
      expect(await safetyModule.balanceOf(staker1.address)).to.equal(stakerInitialBalance);
      expect(await safetyModule.balanceOf(safetyModule.address)).to.equal(0);
      expect(await safetyModule.balanceOf(fundsRecipient.address)).to.equal(0);
      expect(await safetyModule.totalSupply()).to.equal(stakerInitialBalance);

      // Withdraw.
      await safetyModule.connect(staker1.signer).requestWithdrawal(stakerInitialBalance);
      await elapseEpoch();
      await safetyModule.connect(staker1.signer).withdrawMaxStake(staker1.address);
      expect(await dydxToken.balanceOf(staker1.address)).to.equal(stakerInitialBalance / 20);
    });

    it('staker continues earning rewards', async () => {
      await contract.stake(staker1, stakerInitialBalance);

      // Earn some rewards before the slash.
      let lastTimestamp = (await timeLatest()).toNumber();
      await contract.setRewardsPerSecond(150);
      await elapseEpoch();

      // Slash.
      await safetyModule.connect(deployer.signer).slash(stakerInitialBalance, fundsRecipient.address);

      // Earn some rewards after the slash.
      await elapseEpoch();

      // Slash again.
      await safetyModule.connect(deployer.signer).slash(stakerInitialBalance, fundsRecipient.address);

      // Earn some rewards after the second slash.
      await elapseEpoch();

      // Claim rewards (with assertions within the helper function).
      await contract.claimRewards(staker1, fundsRecipient, lastTimestamp);
    });

    it('staker receive funds via transfer after being slashed', async () => {
      await contract.stake(staker1, stakerInitialBalance);
      await safetyModule.connect(deployer.signer).slash(stakerInitialBalance, fundsRecipient.address)

      // New deposit multiplied by exchange rate of 20...
      await contract.stake(staker2, stakerInitialBalance);
      await contract.transfer(staker2, staker1, stakerInitialBalance * 10); // Transfer half.

      // Check balances.
      expect(await safetyModule.balanceOf(staker1.address)).to.equal(stakerInitialBalance * 11);
      expect(await safetyModule.balanceOf(staker2.address)).to.equal(stakerInitialBalance * 10);
      expect(await safetyModule.totalSupply()).to.equal(stakerInitialBalance * 21);

      // Check underlying balance of the contract.
      expect(await dydxToken.balanceOf(safetyModule.address)).to.equal(stakerInitialBalance + stakerInitialBalance / 20);

      // Can earn rewards.
      const startTimestamp = (await timeLatest()).toNumber();
      await contract.setRewardsPerSecond(150);
      await elapseEpoch();
      const rewards1 = await contract.claimRewards(staker1, fundsRecipient, startTimestamp, null, 11 / 21);
      const rewards2 = await contract.claimRewards(staker2, fundsRecipient, startTimestamp, null, 10 / 21);
      const error = rewards1.sub(rewards2.mul(11).div(10)).abs().toNumber()
      expect(error).to.be.lte(300);
    });
  });

  describe('exchange rate max', () => {

    it('supports max slash up to 34 times', async () => {
      // This test case requires that we mint far beyond the initial supply of DYDX.
      const mockDydxToken = await deployMintableErc20('Mock dYdX', 'DYDX', 18);
      const distributionStart_2 = (await timeLatest()).plus(100).toString();
      const safetyModule_2: SafetyModuleV1 = await deploySafetyModuleV1(
        mockDydxToken.address,
        dydxToken.address,
        rewardsTreasury.address,
        DEPLOY_CONFIG.SAFETY_MODULE.DISTRIBUTION_START.toString(),
        DEPLOY_CONFIG.SAFETY_MODULE.DISTRIBUTION_END.toString(),
        distributionStart_2, // Must be in the future.
        DEPLOY_CONFIG.SAFETY_MODULE.EPOCH_LENGTH.toString(),
        DEPLOY_CONFIG.SAFETY_MODULE.BLACKOUT_WINDOW_LENGTH.toString(),
        deployer.signer,
        true,  // use gas price overrides
      );
      contract = new StakingHelper(
        safetyModule_2,
        mockDydxToken,
        rewardsTreasury,
        deployer,
        deployer,
        [staker1, staker2],
        true,
      );
      await incrementTimeToTimestamp(distributionStart_2);
      await mockDydxToken.mint(deployer.address, BigNumber.from(10).pow(30));

      // Give stakers a larger balance.
      const amountToStake = BigNumber.from(10).pow(24);
      await contract.mintAndApprove(staker1, amountToStake);
      await contract.mintAndApprove(staker2, amountToStake);

      // Stake.
      await contract.stake(staker1, amountToStake); // 1e24 in base units

      // Do a max slash 34 times, to get an exchange rate of around 1.7e44 (raw value 1.7e62).
      let slashCount = 0;
      while (slashCount < 34) {
        await safetyModule_2.connect(deployer.signer).slash(amountToStake, fundsRecipient.address);
        // Every 10 slashes, add more funds, to ensure we don't run out of funds to slash.
        if (slashCount % 10 === 9) {
          await contract.mintAndApprove(staker1, amountToStake);
          await safetyModule_2.connect(staker1.signer).stake(amountToStake);
        }
        slashCount++
      }

      // Cannot do another max slash.
      await expect(
        safetyModule_2.connect(deployer.signer).slash(amountToStake, fundsRecipient.address),
      ).to.be.revertedWith('SM1ExchangeRate: Max exchange rate exceeded');

      // Staked balances should never overflow, under the assumption that the total underlying
      // token balance is not more than 10^28.
      const veryLargeAmountToStake = BigNumber.from(10).pow(28);
      await contract.mintAndApprove(staker2, veryLargeAmountToStake);
      await safetyModule_2.connect(staker2.signer).stake(veryLargeAmountToStake); // Receive ~1.7e72 in staked units

      // Cannot deposit much more without overflowing uint240.
      const additionalAmount = BigNumber.from(10).pow(27);
      await contract.mintAndApprove(staker2, additionalAmount);
      await expect(
        safetyModule_2.connect(staker2.signer).stake(additionalAmount),
      ).to.be.revertedWith('SafeCast: toUint240 overflow');

      // All regular logic should continue to work as expected...

      // Check staked balance
      const stakedBalance = await safetyModule_2.balanceOf(staker2.address);
      expect(stakedBalance.gt(BigNumber.from(10).pow(72))).to.be.true;

      // Check power.
      expect(await safetyModule_2.getPowerCurrent(staker2.address, 0)).to.equal(veryLargeAmountToStake);

      // Request full withdrawal.
      await safetyModule_2.connect(staker2.signer).requestWithdrawal(stakedBalance);

      // Elapse epoch.
      let remaining = (await safetyModule_2.getTimeRemainingInCurrentEpoch()).toNumber();
      remaining ||= EPOCH_LENGTH.toNumber();
      await increaseTimeAndMine(remaining);

      // Execute full withdrawal.
      let balanceBefore = await mockDydxToken.balanceOf(staker2.address);
      await safetyModule_2.connect(staker2.signer).withdrawMaxStake(staker2.address);
      let balanceAfter = await mockDydxToken.balanceOf(staker2.address);
      let receivedAmount = balanceAfter.sub(balanceBefore);
      expect(receivedAmount).to.equal(veryLargeAmountToStake);

      // Check power.
      expect(await safetyModule_2.getPowerCurrent(staker2.address, 0)).to.equal(0);

      // Stake again.
      await mockDydxToken.connect(staker2.signer).approve(safetyModule_2.address, veryLargeAmountToStake);
      await safetyModule_2.connect(staker2.signer).stake(veryLargeAmountToStake);

      // Check power.
      expect(await safetyModule_2.getPowerCurrent(staker2.address, 0)).to.equal(veryLargeAmountToStake);

      // Request withdrawal of most of the staked balance.
      const requestAmount = BigNumber.from(10).pow(72); // In staked units.
      await safetyModule_2.connect(staker2.signer).requestWithdrawal(requestAmount);

      // Elapse epoch.
      remaining = (await safetyModule_2.getTimeRemainingInCurrentEpoch()).toNumber();
      remaining ||= EPOCH_LENGTH.toNumber();
      await increaseTimeAndMine(remaining);

      // Execute withdrawal.
      balanceBefore = await mockDydxToken.balanceOf(staker2.address);
      await safetyModule_2.connect(staker2.signer).withdrawMaxStake(staker2.address);
      balanceAfter = await mockDydxToken.balanceOf(staker2.address);
      receivedAmount = balanceAfter.sub(balanceBefore);
      const expectedReceivedAmount = veryLargeAmountToStake.mul(10).div(17);
      const error = new BNJS(expectedReceivedAmount.toString()).minus(receivedAmount.toString()).div(receivedAmount.toString());
      expect(error.abs().toNumber()).to.be.lessThan(0.02);

      // Check governance power.
      const power = await safetyModule_2.getPowerCurrent(staker2.address, 0);
      const expectedPower = veryLargeAmountToStake.sub(receivedAmount);
      const powerError = expectedPower.sub(power);
      expect(powerError.toNumber()).to.be.lte(1);
    });
  });

  /**
   * Progress to the start of the next epoch. May be a bit after if mining a block.
   */
  async function elapseEpoch(mineBlock: boolean = true): Promise<void> {
    let remaining = (await safetyModule.getTimeRemainingInCurrentEpoch()).toNumber();
    remaining ||= EPOCH_LENGTH.toNumber();
    if (mineBlock) {
      await increaseTimeAndMine(remaining);
    } else {
      await increaseTime(remaining);
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

async function getLatestSlashBlockNumber(safetyModule: SafetyModuleV1): Promise<number> {
  const filter = safetyModule.filters.Slashed(null, null, null);
  const events = await safetyModule.queryFilter(filter);
  return events[events.length - 1].blockNumber;
}
