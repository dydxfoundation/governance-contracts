import { expect } from 'chai';

import { DIP_23_IPFS_HASH } from '../../src/lib/constants';
import { describeContractHardhatRevertBefore, TestContext } from '../helpers/describe-contract';

function init() {}

describeContractHardhatRevertBefore('ops-trust-v2-proposal', init, (ctx: TestContext) => {

  it('Proposal IPFS hash is correct', async () => {
    const opsTrustV2ProposalId = 13;
    const proposal = await ctx.governor.getProposalById(opsTrustV2ProposalId);
    expect(proposal.ipfsHash).to.equal(DIP_23_IPFS_HASH);
  });

  it('DOT 2.0 receives tokens from the community treasury', async () => {
    const balance = await ctx.dydxToken.balanceOf(ctx.config.DOT_MULTISIG_ADDRESS);
    expect(balance).to.equal(ctx.config.DOT_FUNDING_AMOUNT_v2);
  });
});
