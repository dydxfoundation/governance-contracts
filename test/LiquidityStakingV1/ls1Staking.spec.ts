import BigNumber from 'bignumber.js';
import { makeSuite, TestEnv } from '../helpers/make-suite';
import {
  timeLatest,
  evmSnapshot,
  evmRevert,
  increaseTime,
  increaseTimeAndMine,
} from '../../helpers/misc-utils';
import { BLACKOUT_WINDOW, EPOCH_LENGTH } from '../../helpers/constants';
import { LiquidityStakingHelper } from '../helpers/liquidity-staking-helper';
import { SignerWithAddress } from '../helpers/make-suite';
import { LiquidityStakingV1 } from '../../types/LiquidityStakingV1';
import { MockStakedToken } from '../../types/MockStakedToken';
import { MintableErc20 } from '../../types/MintableErc20';
import { expect } from 'chai';

const snapshots = new Map<string, string>();

const afterMockTokenMint = 'AfterMockTokenMint';

const stakerInitialBalance: number = 1_000_000;

makeSuite('LS1Staking', (testEnv: TestEnv) => {
  // Contracts.
  let deployer: SignerWithAddress;
  let rewardsVault: SignerWithAddress;
  let liquidityStakingV1: LiquidityStakingV1;
  let mockStakedToken: MockStakedToken;
  let dydxToken: MintableErc20;

  // Users.
  let staker1: SignerWithAddress;
  let staker2: SignerWithAddress;
  let fundsRecipient: SignerWithAddress;

  // Users calling the liquidity staking contract.
  let stakerSigner1: LiquidityStakingV1;
  let stakerSigner2: LiquidityStakingV1;

  let distributionStart: string;
  let distributionEnd: string;

  let contract: LiquidityStakingHelper;

  before(async () => {
    liquidityStakingV1 = testEnv.liquidityStakingV1;
    mockStakedToken = testEnv.mockStakedToken;
    dydxToken = testEnv.dydxToken;
    rewardsVault = testEnv.rewardsVault;
    deployer = testEnv.deployer;

    // Users.
    [staker1, staker2, fundsRecipient] = testEnv.users.slice(1);

    // Users calling the liquidity staking contract.
    stakerSigner1 = liquidityStakingV1.connect(staker1.signer);
    stakerSigner2 = liquidityStakingV1.connect(staker2.signer);

    distributionStart = (await liquidityStakingV1.DISTRIBUTION_START()).toString();
    distributionEnd = (await liquidityStakingV1.DISTRIBUTION_END()).toString();

    // Use helper class to automatically check contract invariants after every update.
    contract = new LiquidityStakingHelper(
      liquidityStakingV1,
      mockStakedToken,
      rewardsVault,
      deployer,
      [staker1, staker2]
    );

    await contract.mintAndApprove(staker1, stakerInitialBalance);

    saveSnapshot(afterMockTokenMint);
  });

  describe('stake', () => {
    beforeEach(async () => {
      await loadSnapshot(afterMockTokenMint);
    });

    it('User with mock tokens cannot successfully stake if epoch zero has not started', async () => {
      await expect(stakerSigner1.stake(stakerInitialBalance)).to.be.revertedWith(
        'LS1EpochSchedule: Epoch zero has not started'
      );
    });

    it('User with mock tokens can successfully stake if epoch zero has started', async () => {
      await incrementTimeToTimestamp(distributionStart);
      await contract.stake(staker1, stakerInitialBalance);

      // `mockStakedToken` should be transferred to LiquidityStakingV1 contract, and user should be given an
      // equivalent amount of `LS1ERC20` tokens
      expect(await mockStakedToken.balanceOf(staker1.address)).to.equal(0);
      expect(await mockStakedToken.balanceOf(liquidityStakingV1.address)).to.equal(
        stakerInitialBalance
      );
      expect(await liquidityStakingV1.balanceOf(staker1.address)).to.equal(stakerInitialBalance);
    });
  });

  describe('requestWithdrawal', () => {
    beforeEach(async () => {
      await loadSnapshot(afterMockTokenMint);
    });

    it('User with nonzero staked balance can request a withdrawal after epoch zero has started', async () => {
      await incrementTimeToTimestamp(distributionStart);

      await contract.stake(staker1, stakerInitialBalance);
      await contract.requestWithdrawal(staker1, stakerInitialBalance);

      // `mockStakedToken` should still be owned by LiquidityStakingV1 contract, and user should still own an
      // equivalent amount of `LS1ERC20` tokens
      expect(await mockStakedToken.balanceOf(staker1.address)).to.equal(0);
      expect(await mockStakedToken.balanceOf(liquidityStakingV1.address)).to.equal(
        stakerInitialBalance
      );
      expect(await liquidityStakingV1.balanceOf(staker1.address)).to.equal(stakerInitialBalance);
    });

    it('User with nonzero staked balance cannot request a withdrawal during blackout window', async () => {
      await incrementTimeToTimestamp(distributionStart);

      await contract.stake(staker1, stakerInitialBalance);

      const withinBlackoutWindow: string = EPOCH_LENGTH.add(distributionStart)
        .sub(BLACKOUT_WINDOW)
        .toString();
      await incrementTimeToTimestamp(withinBlackoutWindow);

      await expect(contract.requestWithdrawal(staker1, stakerInitialBalance)).to.be.revertedWith(
        'LS1Staking: Withdrawal requests restricted in the blackout window'
      );

      // `mockStakedToken` should still be owned by LiquidityStakingV1 contract, and user should still have an
      // equivalent amount of `LS1ERC20` tokens
      expect(await mockStakedToken.balanceOf(staker1.address)).to.equal(0);
      expect(await mockStakedToken.balanceOf(liquidityStakingV1.address)).to.equal(
        stakerInitialBalance
      );
      expect(await liquidityStakingV1.balanceOf(staker1.address)).to.equal(stakerInitialBalance);
    });

    it('User with zero staked balance cannot request a withdrawal', async () => {
      // increment time to past epoch zero
      await incrementTimeToTimestamp(distributionStart);

      await expect(contract.requestWithdrawal(staker1, 1)).to.be.revertedWith(
        'LS1Staking: Withdrawal request exceeds next staker active balance'
      );
    });
  });

  describe('withdrawStake', () => {
    beforeEach(async () => {
      await loadSnapshot(afterMockTokenMint);
    });

    it('Staker can request and withdraw full balance', async () => {
      await incrementTimeToTimestamp(distributionStart);

      await contract.stake(staker1, stakerInitialBalance);
      await contract.requestWithdrawal(staker1, stakerInitialBalance);
      await elapseEpoch(); // increase time to next epoch, so user can withdraw funds
      await contract.withdrawStake(staker1, fundsRecipient, stakerInitialBalance);

      // `mockStakedToken` should be sent to fundsRecipient, LiquidityStakingV1 contract should own nothing
      // and user should have 0 staked token balance
      expect(await mockStakedToken.balanceOf(fundsRecipient.address)).to.equal(
        stakerInitialBalance
      );
      expect(await mockStakedToken.balanceOf(staker1.address)).to.equal(0);
      expect(await mockStakedToken.balanceOf(liquidityStakingV1.address)).to.equal(0);
      expect(await liquidityStakingV1.balanceOf(staker1.address)).to.equal(0);
    });

    it('Staker can request full balance and make multiple partial withdrawals', async () => {
      await incrementTimeToTimestamp(distributionStart);

      await contract.stake(staker1, stakerInitialBalance);
      await contract.requestWithdrawal(staker1, stakerInitialBalance);
      await elapseEpoch(); // increase time to next epoch, so user can withdraw funds
      const withdrawAmount = 1;
      await contract.withdrawStake(staker1, fundsRecipient, withdrawAmount);

      // `mockStakedToken` should be sent to fundsRecipient, LiquidityStakingV1 contract should own remainder
      expect(await mockStakedToken.balanceOf(fundsRecipient.address)).to.equal(withdrawAmount);
      expect(await mockStakedToken.balanceOf(staker1.address)).to.equal(0);
      expect(await mockStakedToken.balanceOf(liquidityStakingV1.address)).to.equal(
        stakerInitialBalance - withdrawAmount
      );

      // Additional withdrawal
      await contract.withdrawStake(staker1, fundsRecipient, 10);
      await contract.withdrawStake(staker1, fundsRecipient, 100);
      await contract.withdrawStake(staker1, fundsRecipient, stakerInitialBalance - 111);
    });

    it('Staker can make multiple partial requests and then a full withdrawal', async () => {
      await incrementTimeToTimestamp(distributionStart);

      await contract.stake(staker1, stakerInitialBalance);
      await contract.requestWithdrawal(staker1, 100);
      await contract.requestWithdrawal(staker1, 10);
      await contract.requestWithdrawal(staker1, 1);
      await elapseEpoch(); // increase time to next epoch, so user can withdraw funds
      await contract.withdrawStake(staker1, fundsRecipient, 111);
    });

    it('Staker can make multiple partial requests and then multiple partial withdrawals', async () => {
      await incrementTimeToTimestamp(distributionStart);

      await contract.stake(staker1, stakerInitialBalance);
      await contract.requestWithdrawal(staker1, 100);
      await contract.requestWithdrawal(staker1, 10);
      await contract.requestWithdrawal(staker1, 1);
      await elapseEpoch(); // increase time to next epoch, so user can withdraw funds
      await contract.withdrawStake(staker1, fundsRecipient, 50);
      await contract.withdrawStake(staker1, fundsRecipient, 60);
      await contract.withdrawStake(staker1, fundsRecipient, 1);
    });

    it('Staker cannot withdraw funds if none are staked', async () => {
      await incrementTimeToTimestamp(distributionStart);

      await expect(
        stakerSigner1.withdrawStake(staker1.address, stakerInitialBalance)
      ).to.be.revertedWith('LS1Staking: Withdraw amount exceeds amount available in the contract');
    });
  });

  describe('withdrawMaxStake', () => {
    beforeEach(async () => {
      await loadSnapshot(afterMockTokenMint);
    });

    it('Staker can request and withdraw full balance', async () => {
      await incrementTimeToTimestamp(distributionStart);

      await contract.stake(staker1, stakerInitialBalance);
      await contract.requestWithdrawal(staker1, stakerInitialBalance);
      await elapseEpoch(); // increase time to next epoch, so user can withdraw funds
      await contract.withdrawMaxStake(staker1.address, fundsRecipient.address);

      // `mockStakedToken` should be sent to fundsRecipient, LiquidityStakingV1 contract should own nothing
      // and user should have 0 staked token balance
      expect(await mockStakedToken.balanceOf(fundsRecipient.address)).to.equal(
        stakerInitialBalance
      );
      expect(await mockStakedToken.balanceOf(staker1.address)).to.equal(0);
      expect(await mockStakedToken.balanceOf(liquidityStakingV1.address)).to.equal(0);
      expect(await liquidityStakingV1.balanceOf(staker1.address)).to.equal(0);
    });

    it('Staker can try to withdraw max stake even if there is none', async () => {
      await incrementTimeToTimestamp(distributionStart);

      await contract.withdrawMaxStake(staker1, staker1);
    });
  });

  describe('claimRewards', () => {
    beforeEach(async () => {
      await loadSnapshot(afterMockTokenMint);
    });

    it('User with staked balance can claim rewards', async () => {
      await incrementTimeToTimestamp(distributionStart);

      // Repeat with different rewards rates.
      await contract.stake(staker1, stakerInitialBalance);
      let lastTimestamp = (await timeLatest()).toNumber();
      for (const rewardsRate of [1, 100, 100001]) {
        await contract.setRewardsPerSecond(rewardsRate);
        await elapseEpoch(); // Earn one epoch of rewards.
        await contract.claimRewards(staker1, fundsRecipient, lastTimestamp);
        lastTimestamp = (await timeLatest()).toNumber();
        await elapseEpoch(); // Earn one epoch of rewards.
        await contract.claimRewards(staker1, fundsRecipient, lastTimestamp);
        lastTimestamp = (await timeLatest()).toNumber();
        await elapseEpoch(); // Earn one epoch of rewards.
        await contract.claimRewards(staker1, fundsRecipient, lastTimestamp);
        lastTimestamp = (await timeLatest()).toNumber();
      }
    });

    it('User with nonzero staked balance for one epoch but emission rate was zero cannot claim rewards', async () => {
      await incrementTimeToTimestamp(distributionStart);

      await contract.stake(staker1, stakerInitialBalance);

      // increase time to next epoch, so user can earn rewards
      await elapseEpoch();

      // change EMISSION_RATE to be greater than 0
      const emissionRate = 1;
      await expect(liquidityStakingV1.connect(deployer.signer).setRewardsPerSecond(emissionRate))
        .to.emit(liquidityStakingV1, 'RewardsPerSecondUpdated')
        .withArgs(emissionRate);

      const fundsRecipient: SignerWithAddress = testEnv.users[2];

      expect(await stakerSigner1.callStatic.claimRewards(fundsRecipient.address)).to.equal(0);
    });

    it('Multiple users can stake, requestWithdrawal, withdrawStake, and claimRewards', async () => {
      // mint tokens to staker2
      const stakerInitialBalance2 = 4_000_000;
      await contract.mintAndApprove(staker2, stakerInitialBalance2);

      await incrementTimeToTimestamp(distributionStart);

      // change EMISSION_RATE to be greater than 0
      const emissionRate = 1;
      await contract.setRewardsPerSecond(emissionRate);

      await contract.stake(staker1, stakerInitialBalance);
      const stakeTimestamp1 = (await timeLatest()).toNumber();
      await contract.stake(staker2, stakerInitialBalance2);
      const stakeTimestamp2 = (await timeLatest()).toNumber();

      await contract.requestWithdrawal(staker1, stakerInitialBalance);
      await contract.requestWithdrawal(staker2, stakerInitialBalance2);

      await elapseEpoch();

      const totalBalance = stakerInitialBalance + stakerInitialBalance2;

      const beforeClaim1: BigNumber = await timeLatest();
      const numTokens1: number = beforeClaim1
        .minus(stakeTimestamp1)
        .times(emissionRate)
        .times(stakerInitialBalance)
        .div(totalBalance)
        .toNumber();

      expect(
        (await stakerSigner1.callStatic.claimRewards(staker1.address)).toNumber()
      ).to.be.closeTo(numTokens1, 2);

      const beforeClaim2: BigNumber = await timeLatest();
      const numTokens2: number = beforeClaim2
        .minus(stakeTimestamp2)
        .times(emissionRate)
        .times(stakerInitialBalance2)
        .div(totalBalance)
        .toNumber();
      expect(
        (await stakerSigner2.callStatic.claimRewards(staker2.address)).toNumber()
      ).to.be.closeTo(numTokens2, 2);
    });

    it('User with nonzero staked balance does not earn rewards after distributionEnd', async () => {
      await incrementTimeToTimestamp(
        new BigNumber(distributionEnd).minus(EPOCH_LENGTH.toNumber()).toString()
      );

      // change EMISSION_RATE to be greater than 0
      const emissionRate = 1;
      await expect(liquidityStakingV1.connect(deployer.signer).setRewardsPerSecond(emissionRate))
        .to.emit(liquidityStakingV1, 'RewardsPerSecondUpdated')
        .withArgs(emissionRate);

      // expect the `stake` call to succeed, else we can't test `claimRewards`
      await contract.stake(staker1.address, stakerInitialBalance);
      const stakedTimestamp: BigNumber = await timeLatest();

      // move multiple epochs forward so we're after DISTRIBUTION_END
      // (user should only earn rewards for last epoch)
      for (let i = 0; i < 5; i++) {
        await elapseEpoch();
      }

      const numTokens = new BigNumber(distributionEnd)
        .minus(stakedTimestamp)
        .times(emissionRate)
        .toString();
      await expect(stakerSigner1.claimRewards(staker1.address))
        .to.emit(liquidityStakingV1, 'ClaimedRewards')
        .withArgs(staker1.address, staker1.address, numTokens);

      // verify user can withdraw and doesn't earn additional rewards
      await contract.requestWithdrawal(staker1.address, stakerInitialBalance);

      await elapseEpoch();
      await contract.withdrawStake(staker1.address, staker1.address, stakerInitialBalance);

      // user shouldn't have any additional rewards since it's after DISTRIBUTION_END
      await expect(stakerSigner1.claimRewards(staker1.address))
        .to.emit(liquidityStakingV1, 'ClaimedRewards')
        .withArgs(staker1.address, staker1.address, 0);
    });
  });

  describe('transfer', () => {
    beforeEach(async () => {
      await loadSnapshot(afterMockTokenMint);
    });

    it('User with staked balance can transfer to another user', async () => {
      await incrementTimeToTimestamp(distributionStart);

      await contract.stake(staker1, stakerInitialBalance);

      await contract.transfer(staker1, staker2, stakerInitialBalance);

      expect(await liquidityStakingV1.balanceOf(staker1.address)).to.equal(0);
      expect(await liquidityStakingV1.balanceOf(staker2.address)).to.equal(stakerInitialBalance);
    });

    it('User with staked balance for one epoch can transfer to another user and claim rewards', async () => {
      await incrementTimeToTimestamp(distributionStart);

      // change EMISSION_RATE to be greater than 0
      const emissionRate = 1;
      await expect(liquidityStakingV1.connect(deployer.signer).setRewardsPerSecond(emissionRate))
        .to.emit(liquidityStakingV1, 'RewardsPerSecondUpdated')
        .withArgs(emissionRate);

      await contract.stake(staker1, stakerInitialBalance);
      const stakeTimestamp: BigNumber = await timeLatest();

      // increase time to next epoch, so user can earn rewards
      await elapseEpoch();

      await contract.transfer(staker1, staker2, stakerInitialBalance);

      const balanceBeforeClaiming = await dydxToken.balanceOf(staker1.address);
      const now: BigNumber = await timeLatest();
      const numTokens = now.minus(stakeTimestamp).times(emissionRate).toString();
      await expect(stakerSigner1.claimRewards(staker1.address))
        .to.emit(liquidityStakingV1, 'ClaimedRewards')
        .withArgs(staker1.address, staker1.address, numTokens);
      expect(await dydxToken.balanceOf(staker1.address)).to.equal(
        balanceBeforeClaiming.add(numTokens).toString()
      );
    });
  });

  describe('transferFrom', () => {
    beforeEach(async () => {
      await loadSnapshot(afterMockTokenMint);
    });

    it('User with staked balance can transfer to another user', async () => {
      await incrementTimeToTimestamp(distributionStart);

      await contract.stake(staker1, stakerInitialBalance);

      await contract.approve(staker1, staker2, stakerInitialBalance);
      await contract.transferFrom(staker2, staker1, staker2, stakerInitialBalance);

      expect(await liquidityStakingV1.balanceOf(staker1.address)).to.equal(0);
      expect(await liquidityStakingV1.balanceOf(staker2.address)).to.equal(stakerInitialBalance);
    });
  });

  /**
   * Progress to the start of the next epoch. May be a bit after if mining a block.
   */
  async function elapseEpoch(mineBlock: boolean = true): Promise<void> {
    let remaining = (await liquidityStakingV1.getTimeRemainingInCurrentEpoch()).toNumber();
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

async function incrementTimeToTimestamp(timestampString: string): Promise<void> {
  const latestBlockTimestamp = await timeLatest();
  const timestamp: BigNumber = new BigNumber(timestampString);
  // we can only increase time in this method, assert that user isn't trying to move time backwards
  expect(latestBlockTimestamp.toNumber()).to.be.at.most(timestamp.toNumber());
  const timestampDiff: number = timestamp.minus(latestBlockTimestamp).toNumber();
  await increaseTimeAndMine(timestampDiff);
}
