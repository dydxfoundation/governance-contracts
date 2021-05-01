import { makeSuite, TestEnv } from '../helpers/make-suite';
import {
  COOLDOWN_SECONDS,
  UNSTAKE_WINDOW,
  MAX_UINT_AMOUNT,
  STAKED_DYDX_NAME,
  STAKED_DYDX_SYMBOL,
  STAKED_DYDX_DECIMALS,
} from '../../helpers/constants';
import { waitForTx, timeLatest, advanceBlock, increaseTimeAndMine } from '../../helpers/misc-utils';
import { ethers } from 'ethers';
import BigNumber from 'bignumber.js';
import { compareRewardsAtAction } from './data-helpers/reward';
import { getUserIndex } from '../DistributionManager/data-helpers/asset-user-data';
import { getRewards } from '../DistributionManager/data-helpers/base-math';

const { expect } = require('chai');

makeSuite('StakedDydxToken. Basics', (testEnv: TestEnv) => {
  it('Initial configuration after initialize() is correct', async () => {
    const { stakedDydxToken, dydxToken, rewardsVault } = testEnv;

    expect(await stakedDydxToken.name()).to.be.equal(STAKED_DYDX_NAME);
    expect(await stakedDydxToken.symbol()).to.be.equal(STAKED_DYDX_SYMBOL);
    expect(await stakedDydxToken.decimals()).to.be.equal(STAKED_DYDX_DECIMALS);
    expect(await stakedDydxToken.REVISION()).to.be.equal(1);
    expect(await stakedDydxToken.STAKED_TOKEN()).to.be.equal(dydxToken.address);
    expect(await stakedDydxToken.REWARD_TOKEN()).to.be.equal(dydxToken.address);
    expect((await stakedDydxToken.COOLDOWN_SECONDS()).toString()).to.be.equal(COOLDOWN_SECONDS);
    expect((await stakedDydxToken.UNSTAKE_WINDOW()).toString()).to.be.equal(UNSTAKE_WINDOW);
    expect(await stakedDydxToken.REWARDS_VAULT()).to.be.equal(rewardsVault.address);
  });

  it('Reverts trying to stake 0 amount', async () => {
    const {
      stakedDydxToken,
      users: [, staker],
    } = testEnv;
    const amount = '0';

    await expect(
      stakedDydxToken.connect(staker.signer).stake(staker.address, amount)
    ).to.be.revertedWith('INVALID_ZERO_AMOUNT');
  });

  it('Reverts trying to activate cooldown with 0 staked amount', async () => {
    const {
      stakedDydxToken,
      users: [, staker],
    } = testEnv;
    const amount = '0';

    await expect(stakedDydxToken.connect(staker.signer).cooldown()).to.be.revertedWith(
      'INVALID_BALANCE_ON_COOLDOWN'
    );
  });

  it('User 1 stakes 50 DYDX: receives 50 SDYDX, StakedDydxToken balance of DYDX is 50 and his rewards to claim are 0', async () => {
    const {
      stakedDydxToken,
      dydxToken,
      users: [, staker],
    } = testEnv;
    const amount = ethers.utils.parseEther('50');

    const saveBalanceBefore = new BigNumber(
      (await stakedDydxToken.balanceOf(staker.address)).toString()
    );

    // Prepare actions for the test case
    const actions = () => [
      dydxToken.connect(staker.signer).approve(stakedDydxToken.address, amount),
      stakedDydxToken.connect(staker.signer).stake(staker.address, amount),
    ];

    // Check rewards
    await compareRewardsAtAction(stakedDydxToken, staker.address, actions);

    // Stake token tests
    expect((await stakedDydxToken.balanceOf(staker.address)).toString()).to.be.equal(
      saveBalanceBefore.plus(amount.toString()).toString()
    );
    expect((await dydxToken.balanceOf(stakedDydxToken.address)).toString()).to.be.equal(
      saveBalanceBefore.plus(amount.toString()).toString()
    );
    expect((await stakedDydxToken.balanceOf(staker.address)).toString()).to.be.equal(amount);
    expect((await dydxToken.balanceOf(stakedDydxToken.address)).toString()).to.be.equal(amount);
  });

  it('User 1 stakes 20 DYDX more: his total staked-DYDX balance increases, StakedDydxToken balance of DYDX token increases and his reward until now get accumulated', async () => {
    const {
      stakedDydxToken,
      dydxToken,
      users: [, staker],
    } = testEnv;
    const amount = ethers.utils.parseEther('20');

    const saveBalanceBefore = new BigNumber(
      (await stakedDydxToken.balanceOf(staker.address)).toString()
    );
    const actions = () => [
      dydxToken.connect(staker.signer).approve(stakedDydxToken.address, amount),
      stakedDydxToken.connect(staker.signer).stake(staker.address, amount),
    ];

    // Checks rewards
    await compareRewardsAtAction(stakedDydxToken, staker.address, actions, true);

    // Extra test checks
    expect((await stakedDydxToken.balanceOf(staker.address)).toString()).to.be.equal(
      saveBalanceBefore.plus(amount.toString()).toString()
    );
    expect((await dydxToken.balanceOf(stakedDydxToken.address)).toString()).to.be.equal(
      saveBalanceBefore.plus(amount.toString()).toString()
    );
  });

  it('User 1 claim half rewards ', async () => {
    const {
      stakedDydxToken,
      dydxToken,
      users: [, staker],
    } = testEnv;
    // Increase time for bigger rewards
    await increaseTimeAndMine(1000);

    const halfRewards = (await stakedDydxToken.stakerRewardsToClaim(staker.address)).div(2);
    const saveUserBalance = await dydxToken.balanceOf(staker.address);

    await stakedDydxToken.connect(staker.signer).claimRewards(staker.address, halfRewards);

    const userBalanceAfterActions = await dydxToken.balanceOf(staker.address);
    expect(userBalanceAfterActions.eq(saveUserBalance.add(halfRewards))).to.be.ok;
  });

  it('User 1 tries to claim higher reward than current rewards balance', async () => {
    const {
      stakedDydxToken,
      dydxToken,
      users: [, staker],
    } = testEnv;

    const saveUserBalance = await dydxToken.balanceOf(staker.address);

    // Try to claim more amount than accumulated
    await expect(
      stakedDydxToken
        .connect(staker.signer)
        .claimRewards(staker.address, ethers.utils.parseEther('10000'))
    ).to.be.revertedWith('INVALID_AMOUNT');

    const userBalanceAfterActions = await dydxToken.balanceOf(staker.address);
    expect(userBalanceAfterActions.eq(saveUserBalance)).to.be.ok;
  });

  it('User 1 claim all rewards', async () => {
    const {
      stakedDydxToken,
      dydxToken,
      users: [, staker],
    } = testEnv;

    const userAddress = staker.address;
    const underlyingAsset = stakedDydxToken.address;

    const userBalance = await stakedDydxToken.balanceOf(userAddress);
    const userDydxBalance = await dydxToken.balanceOf(userAddress);
    const userRewards = await stakedDydxToken.stakerRewardsToClaim(userAddress);
    // Get index before actions
    const userIndexBefore = await getUserIndex(stakedDydxToken, userAddress, underlyingAsset);

    // Claim rewards
    await expect(
      stakedDydxToken.connect(staker.signer).claimRewards(staker.address, MAX_UINT_AMOUNT)
    );

    // Get index after actions
    const userIndexAfter = await getUserIndex(stakedDydxToken, userAddress, underlyingAsset);

    const expectedAccruedRewards = getRewards(
      userBalance,
      userIndexAfter,
      userIndexBefore
    ).toString();
    const userDydxBalanceAfterAction = (await dydxToken.balanceOf(userAddress)).toString();

    expect(userDydxBalanceAfterAction).to.be.equal(
      userDydxBalance.add(userRewards).add(expectedAccruedRewards).toString()
    );
  });

  it('User 6 stakes 50 DYDX, with the rewards not enabled', async () => {
    const { stakedDydxToken, dydxToken, users } = testEnv;
    const amount = ethers.utils.parseEther('50');
    const sixStaker = users[5];

    // Disable rewards via config
    const assetsConfig = {
      emissionPerSecond: '0',
      totalStaked: '0',
    };

    // Checks rewards
    const actions = () => [
      dydxToken.connect(sixStaker.signer).approve(stakedDydxToken.address, amount),
      stakedDydxToken.connect(sixStaker.signer).stake(sixStaker.address, amount),
    ];

    await compareRewardsAtAction(stakedDydxToken, sixStaker.address, actions, false, assetsConfig);

    // Check expected stake balance for six staker
    expect((await stakedDydxToken.balanceOf(sixStaker.address)).toString()).to.be.equal(
      amount.toString()
    );

    // Expect rewards balance to still be zero
    const rewardsBalance = await (
      await stakedDydxToken.getTotalRewardsBalance(sixStaker.address)
    ).toString();
    expect(rewardsBalance).to.be.equal('0');
  });

  it('User 6 stakes 30 DYDX more, with the rewards not enabled', async () => {
    const { stakedDydxToken, dydxToken, users } = testEnv;
    const amount = ethers.utils.parseEther('30');
    const staker = users[1];
    const sixStaker = users[5];
    const saveBalanceBefore = new BigNumber(
      (await stakedDydxToken.balanceOf(sixStaker.address)).toString()
    );
    // Keep rewards disabled via config
    const assetsConfig = {
      emissionPerSecond: '0',
      totalStaked: '0',
    };

    // Checks rewards
    const actions = () => [
      dydxToken.connect(sixStaker.signer).approve(stakedDydxToken.address, amount),
      stakedDydxToken.connect(sixStaker.signer).stake(sixStaker.address, amount),
    ];

    await compareRewardsAtAction(stakedDydxToken, sixStaker.address, actions, false, assetsConfig);

    // Expect rewards balance to still be zero
    const rewardsBalance = await (
      await stakedDydxToken.getTotalRewardsBalance(sixStaker.address)
    ).toString();
    expect(rewardsBalance).to.be.equal('0');
  });

  it('Validates staker cooldown with stake() while being on valid unstake window', async () => {
    const { stakedDydxToken, dydxToken, users } = testEnv;
    const amount1 = ethers.utils.parseEther('50');
    const amount2 = ethers.utils.parseEther('20');
    const staker = users[4];

    // Checks rewards
    const actions = () => [
      dydxToken.connect(staker.signer).approve(stakedDydxToken.address, amount1.add(amount2)),
      stakedDydxToken.connect(staker.signer).stake(staker.address, amount1),
    ];

    await compareRewardsAtAction(stakedDydxToken, staker.address, actions, false);

    await stakedDydxToken.connect(staker.signer).cooldown();

    const cooldownActivationTimestamp = await timeLatest();

    await advanceBlock(
      cooldownActivationTimestamp.plus(new BigNumber(COOLDOWN_SECONDS).plus(1000)).toNumber()
    ); // We fast-forward time to just after the unstake window

    const stakerCooldownTimestampBefore = new BigNumber(
      (await stakedDydxToken.stakersCooldowns(staker.address)).toString()
    );
    await waitForTx(await stakedDydxToken.connect(staker.signer).stake(staker.address, amount2));
    const latestTimestamp = await timeLatest();
    const expectedCooldownTimestamp = amount2
      .mul(latestTimestamp.toString())
      .add(amount1.mul(stakerCooldownTimestampBefore.toString()))
      .div(amount2.add(amount1));
    expect(expectedCooldownTimestamp.toString()).to.be.equal(
      (await stakedDydxToken.stakersCooldowns(staker.address)).toString()
    );
  });
});
