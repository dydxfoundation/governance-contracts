import { expect } from 'chai';

import { describeContract, TestContext } from '../helpers/describe-contract';

function init() { }

describeContract('LS1Rewards', init, (ctx: TestContext) => {

  it('Rewards per second is set to 0', async () => {
    const rewardsPerSecond = await ctx.liquidityStaking.getRewardsPerSecond();
    expect(rewardsPerSecond).to.equal('0');
  });
});
