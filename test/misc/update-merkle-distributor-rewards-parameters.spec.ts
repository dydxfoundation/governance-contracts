import { expect } from 'chai';
import { BigNumber } from 'ethers';

import { describeContract, TestContext } from '../helpers/describe-contract';

// LP rewards should stay the same (1150685000000000000000000)
// Trader rewards should be reduced by 25% (3835616000000000000000000 => 2876712000000000000000000)
// Alpha parameter should be set to 0

function init() { }

describeContract('', init, (ctx: TestContext) => {

  it('Merkle distributor reward parameters are updated', async () => {
    const [
      lpRewardsAmount,
      traderRewardsAmount,
      alphaParameter,
    ]: [
      BigNumber,
      BigNumber,
      BigNumber,
    ] = await ctx.merkleDistributor.getRewardsParameters();


    expect(lpRewardsAmount.toString()).to.equal('1150685000000000000000000');
    expect(traderRewardsAmount.toString()).to.equal('2876712000000000000000000');
    expect(alphaParameter).to.equal(0);
  });
});
