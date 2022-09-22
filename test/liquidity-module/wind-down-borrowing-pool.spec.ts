import { expect } from 'chai';
import { BigNumber } from 'ethers';
import { USDC_TOKEN_DECIMALS } from '../../src';
import { DIP_14_IPFS_HASH } from '../../src/lib/constants';
import { toWad, waitForTx } from '../../src/lib/util';
import { impersonateAndFundAccount } from '../../src/migrations/helpers/impersonate-account';
import { parseNumberToString } from '../../src/tx-builder/utils/parsings';

import { describeContract, TestContext } from '../helpers/describe-contract';
import { incrementTimeToTimestamp, latestBlockTimestamp } from '../helpers/evm';

function init() { }

describeContract('wind-down-borrowing-pool-proposal', init, (ctx: TestContext) => {

  it('Blackout window is set to 3 days', async () => {
    const blackoutWindowLengthSeconds: BigNumber = await ctx.liquidityStaking.getBlackoutWindow();
    // 259,200 = 60 seconds * 60 minutes * 24 hours * 3 days.
    expect(blackoutWindowLengthSeconds.toString()).to.equal('259200');
  });

  it('Rewards per second is set to 0', async () => {
    const rewardsPerSecond = await ctx.liquidityStaking.getRewardsPerSecond();
    expect(rewardsPerSecond).to.equal('0');
  });

  it('Proposal IPFS hash is correct', async () => {
    const windDownBorrowingPoolProposalId = 7;
    const proposal = await ctx.governor.getProposalById(windDownBorrowingPoolProposalId);
    expect(proposal.ipfsHash).to.equal(DIP_14_IPFS_HASH);
  });

  it('Existing stakers can unstake', async () => {
    // Advance to beginning of next epoch.
    const timeToNextEpoch = await ctx.liquidityStaking.getTimeRemainingInCurrentEpoch();

    // Existing staker pulled from this transaction:
    // https://etherscan.io/tx/0x73c976b3955b3fe494c3318051ebc71f2ca4acbba449f8313baa68fc33767c13
    const existingStaker = '0xb105C388968e407979537dab44aB3e857ed25F08';
    const mockedExistingStaker = await impersonateAndFundAccount(existingStaker);
    const existingStakerLiquidityStaking = ctx.liquidityStaking.connect(mockedExistingStaker);

    const stakerBalanceBeforeUnstake = await ctx.dydxCollateralToken.balanceOf(existingStaker);
    const stakerDydxRewardsBeforeUnstake = await existingStakerLiquidityStaking.callStatic.claimRewards(existingStaker);
    const existingStakerActiveBalance = await ctx.liquidityStaking.getActiveBalanceCurrentEpoch(existingStaker);
    const minStakedAmount = parseNumberToString('250000', USDC_TOKEN_DECIMALS);
    expect(existingStakerActiveBalance.toNumber()).to.be.at.least(Number.parseInt(minStakedAmount))

    const currentTimestamp = await latestBlockTimestamp();
    await incrementTimeToTimestamp(currentTimestamp + timeToNextEpoch.toNumber());
    // Request to withdraw 250k USDC.
    await waitForTx(await existingStakerLiquidityStaking.requestWithdrawal(minStakedAmount));

    // Advance to beginning of next epoch.
    const timeToNextEpoch2 = await ctx.liquidityStaking.getTimeRemainingInCurrentEpoch();
    const currentTimestamp2 = await latestBlockTimestamp();
    await incrementTimeToTimestamp(currentTimestamp2 + timeToNextEpoch2.toNumber());

    // Withdraw 250k USDC.
    await waitForTx(
        await existingStakerLiquidityStaking.withdrawStake(
            existingStaker,
            minStakedAmount,
        ),
    );

    const stakerBalanceAfterUnstake = await ctx.dydxCollateralToken.balanceOf(existingStaker);
    const diff = stakerBalanceAfterUnstake.sub(stakerBalanceBeforeUnstake)
    expect(diff).to.equal(minStakedAmount)

    // Ensure user can claim rewards, and earned no additional rewards since rewards per second
    // was set to zero.
    await expect(existingStakerLiquidityStaking.claimRewards(existingStaker))
      .to.emit(ctx.liquidityStaking, 'ClaimedRewards')
      .withArgs(existingStaker, existingStaker, stakerDydxRewardsBeforeUnstake);
  });
});
