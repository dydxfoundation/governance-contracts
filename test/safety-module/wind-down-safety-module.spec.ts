import { expect } from 'chai';
import { BigNumber } from 'ethers';
import { DIP_17_IPFS_HASH } from '../../src/lib/constants';
import { waitForTx } from '../../src/lib/util';
import { impersonateAndFundAccount } from '../../src/migrations/helpers/impersonate-account';

import { describeContract, TestContext } from '../helpers/describe-contract';
import { incrementTimeToTimestamp, latestBlockTimestamp } from '../helpers/evm';

function init() { }

describeContract('wind-down-safety-module-proposal', init, (ctx: TestContext) => {

  it('Blackout window is set to 3 days', async () => {
    const blackoutWindowLengthSeconds: BigNumber = await ctx.safetyModule.getBlackoutWindow();
    // 259,200 = 60 seconds * 60 minutes * 24 hours * 3 days.
    expect(blackoutWindowLengthSeconds.toString()).to.equal('259200');
  });

  it('Rewards per second is set to 0', async () => {
    const rewardsPerSecond = await ctx.safetyModule.getRewardsPerSecond();
    expect(rewardsPerSecond).to.equal('0');
  });

  it('Proposal IPFS hash is correct', async () => {
    const windDownBorrowingPoolProposalId = 9;
    const proposal = await ctx.governor.getProposalById(windDownBorrowingPoolProposalId);
    expect(proposal.ipfsHash).to.equal(DIP_17_IPFS_HASH);
  });

  it('Existing stakers can unstake', async () => {
    // Advance to beginning of next epoch.
    const timeToNextEpoch = await ctx.safetyModule.getTimeRemainingInCurrentEpoch();

    // Existing staker pulled from this transaction:
    // https://etherscan.io/tx/0x91ef76105a9ddf057770254ae46bf9d5038c0b0f56a8f3b8381d8e0d59da12d8
    const existingStaker = '0x4Bb64C7Dc02ce106849AFA12658Cf2F27aEf90A9';
    const mockedExistingStaker = await impersonateAndFundAccount(existingStaker);
    const existingStakerSafetyModule = ctx.safetyModule.connect(mockedExistingStaker);

    const stakerBalanceBeforeUnstake = await ctx.safetyModule.balanceOf(existingStaker);
    const stakerDydxRewardsBeforeUnstake = await existingStakerSafetyModule.callStatic.claimRewards(existingStaker);
    const existingStakerActiveBalance = await ctx.safetyModule.getActiveBalanceCurrentEpoch(existingStaker);
    expect(stakerBalanceBeforeUnstake.toString()).to.equal(existingStakerActiveBalance.toString())

    const currentTimestamp = await latestBlockTimestamp();
    await incrementTimeToTimestamp(currentTimestamp + timeToNextEpoch.toNumber());
    // Request to withdraw all of the staked DYDX.
    await waitForTx(await existingStakerSafetyModule.requestWithdrawal(stakerBalanceBeforeUnstake.toString()));

    // Advance to beginning of next epoch.
    const timeToNextEpoch2 = await ctx.safetyModule.getTimeRemainingInCurrentEpoch();
    const currentTimestamp2 = await latestBlockTimestamp();
    await incrementTimeToTimestamp(currentTimestamp2 + timeToNextEpoch2.toNumber());

    // Withdraw the staked DYDX.
    await waitForTx(
        await existingStakerSafetyModule.withdrawStake(
            existingStaker,
            stakerBalanceBeforeUnstake.toString(),
        ),
    );

    const stakerBalanceAfterUnstake = await ctx.safetyModule.balanceOf(existingStaker);
    const diff = stakerBalanceBeforeUnstake.sub(stakerBalanceAfterUnstake)
    expect(diff).to.equal(stakerBalanceBeforeUnstake.toString())

    // Ensure user has their DYDX tokens.
    expect(await ctx.dydxToken.balanceOf(existingStaker)).to.equal(stakerBalanceBeforeUnstake.toString())

    // Ensure user can claim rewards, and earned no additional rewards since rewards per second
    // was set to zero.
    await expect(existingStakerSafetyModule.claimRewards(existingStaker))
      .to.emit(ctx.safetyModule, 'ClaimedRewards')
      .withArgs(existingStaker, existingStaker, stakerDydxRewardsBeforeUnstake);
  });
});
