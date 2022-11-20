import { expect } from 'chai';

import { describeContract, TestContext } from '../helpers/describe-contract';

function init() {}

describeContract('ops-trust-proposal', init, (ctx: TestContext) => {

  it.only('DOT multisig receives tokens from the community treasury', async () => {
    const balance = await ctx.dydxToken.balanceOf(ctx.config.DOT_MULTISIG_ADDRESS);
    expect(balance).to.equal(ctx.config.DOT_FUNDING_AMOUNT);
  });
});
