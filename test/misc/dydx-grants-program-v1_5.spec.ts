import BigNumber from 'bignumber.js';
import { expect } from 'chai';

import { describeContract, TestContext } from '../helpers/describe-contract';

// We are expecting DGP Funding Round 1 + DGP Funding Round 1.5 as the final balance
// Expecting 752,000 + 2,582,000 = 3,371,000
// Expecting 3371000000000000000000000

function init() { }

describeContract('', init, (ctx: TestContext) => {

    it.only('DGP v1.5 multisig receives tokens from the community treasury', async () => {
        const balance = await ctx.dydxToken.balanceOf(ctx.config.DGP_MULTISIG_ADDRESS);
        expect(balance).to.equal('3334000000000000000000000');
    });
});
