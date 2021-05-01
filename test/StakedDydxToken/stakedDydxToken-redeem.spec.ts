import { makeSuite, TestEnv } from '../helpers/make-suite';
import { COOLDOWN_SECONDS, UNSTAKE_WINDOW } from '../../helpers/constants';
import {
  waitForTx,
  advanceBlock,
  timeLatest,
  increaseTime,
  increaseTimeAndMine,
} from '../../helpers/misc-utils';
import { ethers } from 'ethers';
import BigNumber from 'bignumber.js';

const { expect } = require('chai');

makeSuite('StakedDydxToken. Redeem', (testEnv: TestEnv) => {
  it('Reverts trying to redeem 0 amount', async () => {
    const { stakedDydxToken, users } = testEnv;

    const amount = '0';
    const staker = users[1];

    await expect(
      stakedDydxToken.connect(staker.signer).redeem(staker.address, amount)
    ).to.be.revertedWith('INVALID_ZERO_AMOUNT');
  });

  it('User 1 stakes 50 DYDX', async () => {
    const { stakedDydxToken, dydxToken, users } = testEnv;
    const amount = ethers.utils.parseEther('50');
    const staker = users[1];

    await waitForTx(
      await dydxToken.connect(staker.signer).approve(stakedDydxToken.address, amount)
    );
    await waitForTx(await stakedDydxToken.connect(staker.signer).stake(staker.address, amount));
  });

  it('User 1 tries to redeem without activating the cooldown first', async () => {
    const { stakedDydxToken, users } = testEnv;
    const amount = ethers.utils.parseEther('50');
    const staker = users[1];

    await expect(
      stakedDydxToken.connect(staker.signer).redeem(staker.address, amount)
    ).to.be.revertedWith('UNSTAKE_WINDOW_FINISHED');
  });

  it('User 1 activates the cooldown, but is not able to redeem before the COOLDOWN_SECONDS passed', async () => {
    const { stakedDydxToken, users } = testEnv;
    const amount = ethers.utils.parseEther('50');
    const staker = users[1];

    await stakedDydxToken.connect(staker.signer).cooldown();

    const startedCooldownAt = new BigNumber(
      await (await stakedDydxToken.stakersCooldowns(staker.address)).toString()
    );
    const currentTime = await timeLatest();

    const remainingCooldown = startedCooldownAt.plus(COOLDOWN_SECONDS).minus(currentTime);
    await increaseTimeAndMine(Number(remainingCooldown.dividedBy('2').toString()));
    await expect(
      stakedDydxToken.connect(staker.signer).redeem(staker.address, amount)
    ).to.be.revertedWith('INSUFFICIENT_COOLDOWN');

    await advanceBlock(startedCooldownAt.plus(new BigNumber(COOLDOWN_SECONDS).minus(1)).toNumber()); // We fast-forward time to just before COOLDOWN_SECONDS

    await expect(
      stakedDydxToken.connect(staker.signer).redeem(staker.address, amount)
    ).to.be.revertedWith('INSUFFICIENT_COOLDOWN');

    await advanceBlock(
      startedCooldownAt
        .plus(new BigNumber(COOLDOWN_SECONDS).plus(UNSTAKE_WINDOW).plus(1))
        .toNumber()
    ); // We fast-forward time to just after the unstake window

    await expect(
      stakedDydxToken.connect(staker.signer).redeem(staker.address, amount)
    ).to.be.revertedWith('UNSTAKE_WINDOW_FINISHED');
  });

  it('User 1 activates the cooldown again, and tries to redeem a bigger amount that he has staked, receiving the balance', async () => {
    const { stakedDydxToken, dydxToken, users } = testEnv;
    const amount = ethers.utils.parseEther('1000');
    const staker = users[1];

    await stakedDydxToken.connect(staker.signer).cooldown();
    const startedCooldownAt = new BigNumber(
      await (await stakedDydxToken.stakersCooldowns(staker.address)).toString()
    );
    const currentTime = await timeLatest();

    const remainingCooldown = startedCooldownAt.plus(COOLDOWN_SECONDS).minus(currentTime);

    await increaseTimeAndMine(remainingCooldown.plus(1).toNumber());
    const dydxBalanceBefore = new BigNumber((await dydxToken.balanceOf(staker.address)).toString());
    const stakedDydxTokenBalanceBefore = (
      await stakedDydxToken.balanceOf(staker.address)
    ).toString();
    await stakedDydxToken.connect(staker.signer).redeem(staker.address, amount);
    const dydxBalanceAfter = new BigNumber((await dydxToken.balanceOf(staker.address)).toString());
    const stakedDydxTokenBalanceAfter = (
      await stakedDydxToken.balanceOf(staker.address)
    ).toString();
    expect(dydxBalanceAfter.minus(stakedDydxTokenBalanceBefore).toString()).to.be.equal(
      dydxBalanceBefore.toString()
    );
    expect(stakedDydxTokenBalanceAfter).to.be.equal('0');
  });

  it('User 1 activates the cooldown again, and redeems within the unstake period', async () => {
    const { stakedDydxToken, dydxToken, users } = testEnv;
    const amount = ethers.utils.parseEther('50');
    const staker = users[1];

    await waitForTx(
      await dydxToken.connect(staker.signer).approve(stakedDydxToken.address, amount)
    );
    await waitForTx(await stakedDydxToken.connect(staker.signer).stake(staker.address, amount));

    await stakedDydxToken.connect(staker.signer).cooldown();
    const startedCooldownAt = new BigNumber(
      await (await stakedDydxToken.stakersCooldowns(staker.address)).toString()
    );
    const currentTime = await timeLatest();

    const remainingCooldown = startedCooldownAt.plus(COOLDOWN_SECONDS).minus(currentTime);

    await increaseTimeAndMine(remainingCooldown.plus(1).toNumber());
    const dydxBalanceBefore = new BigNumber((await dydxToken.balanceOf(staker.address)).toString());
    await stakedDydxToken.connect(staker.signer).redeem(staker.address, amount);
    const dydxBalanceAfter = new BigNumber((await dydxToken.balanceOf(staker.address)).toString());
    expect(dydxBalanceAfter.minus(amount.toString()).toString()).to.be.equal(
      dydxBalanceBefore.toString()
    );
  });

  it('User 4 stakes 50 DYDX, activates the cooldown and redeems half of the amount', async () => {
    const { stakedDydxToken, dydxToken, users } = testEnv;
    const amount = ethers.utils.parseEther('50');
    const staker = users[5];

    await waitForTx(
      await dydxToken.connect(staker.signer).approve(stakedDydxToken.address, amount)
    );
    await waitForTx(await stakedDydxToken.connect(staker.signer).stake(staker.address, amount));

    await stakedDydxToken.connect(staker.signer).cooldown();

    const cooldownActivationTimestamp = await timeLatest();

    await advanceBlock(
      cooldownActivationTimestamp.plus(new BigNumber(COOLDOWN_SECONDS).plus(1)).toNumber()
    );

    const dydxBalanceBefore = new BigNumber((await dydxToken.balanceOf(staker.address)).toString());
    await stakedDydxToken
      .connect(staker.signer)
      .redeem(staker.address, ethers.utils.parseEther('50').div(2));
    const dydxBalanceAfter = new BigNumber((await dydxToken.balanceOf(staker.address)).toString());
    expect(dydxBalanceAfter.minus(amount.toString()).toString()).to.be.equal(
      dydxBalanceBefore.div(2).toFixed()
    );
  });

  it('User 5 stakes 50 DYDX, activates the cooldown and redeems with rewards not enabled', async () => {
    const { stakedDydxToken, dydxToken, users } = testEnv;
    const amount = ethers.utils.parseEther('50');
    const staker = users[5];

    await waitForTx(
      await dydxToken.connect(staker.signer).approve(stakedDydxToken.address, amount)
    );
    await waitForTx(await stakedDydxToken.connect(staker.signer).stake(staker.address, amount));

    await stakedDydxToken.connect(staker.signer).cooldown();

    const cooldownActivationTimestamp = await timeLatest();

    await advanceBlock(
      cooldownActivationTimestamp.plus(new BigNumber(COOLDOWN_SECONDS).plus(1)).toNumber()
    );

    const dydxBalanceBefore = new BigNumber((await dydxToken.balanceOf(staker.address)).toString());
    await stakedDydxToken.connect(staker.signer).redeem(staker.address, amount);
    const dydxBalanceAfter = new BigNumber((await dydxToken.balanceOf(staker.address)).toString());
    expect(dydxBalanceAfter.minus(amount.toString()).toString()).to.be.equal(
      dydxBalanceBefore.toString()
    );
  });
});
