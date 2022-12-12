import { expect } from 'chai';
import { BigNumber } from 'ethers';

import { USDC_TOKEN_DECIMALS } from '../../src';
import { DIP_14_IPFS_HASH } from '../../src/lib/constants';
import { waitForTx } from '../../src/lib/util';
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
});
