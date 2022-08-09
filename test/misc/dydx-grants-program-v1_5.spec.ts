import { expect } from 'chai';

import { describeContract, TestContext } from '../helpers/describe-contract';

// We are expecting DGP Funding Round 1 + DGP Funding Round 1.5 as the final balance
// Expecting 752,000 + 2,582,000 = 3,334,000 DYDX tokens.
// Expecting 3334000000000000000000000 units of DYDX.

function init() { }

describeContract('', init, (ctx: TestContext) => {

  it('DGP v1.5 multisig receives tokens from the community treasury', async () => {
    const balance = await ctx.dydxToken.balanceOf(ctx.config.DGP_MULTISIG_ADDRESS);
    expect(balance).to.equal('3334000000000000000000000');
  });
});
