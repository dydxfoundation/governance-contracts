import { expect } from 'chai';

import { describeContract, TestContext } from '../helpers/describe-contract';

function init() { }

describeContract('', init, (ctx: TestContext) => {

    it('DGP multisig receives tokens from the community treasury', async () => {
        const balance = await ctx.dydxToken.balanceOf(ctx.config.DGP_MULTISIG_ADDRESS);
        expect(balance).to.equal(ctx.config.DGP_FUNDING_AMOUNT_v1_5);
    });
});
