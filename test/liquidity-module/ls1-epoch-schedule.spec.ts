import { expect } from 'chai';
import { BigNumber } from 'ethers';

import { describeContract, TestContext } from '../helpers/describe-contract';

function init() { }

describeContract('LS1EpochSchedule', init, (ctx: TestContext) => {

  it('Blackout window is set to 3 days', async () => {
    const blackoutWindowLengthSeconds: BigNumber = await ctx.liquidityStaking.getBlackoutWindow();
    // 259,200 = 60 seconds * 60 minutes * 24 hours * 3 days.
    expect(blackoutWindowLengthSeconds.toString()).to.equal('259200');
  });
});
