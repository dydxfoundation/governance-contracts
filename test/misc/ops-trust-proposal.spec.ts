import { expect } from 'chai';
import { DIP_18_IPFS_HASH } from '../../src/lib/constants';
import { describeContract, TestContext } from '../helpers/describe-contract';

function init() {}

describeContract('ops-trust-proposal', init, (ctx: TestContext) => {

  it('Proposal IPFS hash is correct', async () => {
    const opsTrustProposalId = 10;
    const proposal = await ctx.governor.getProposalById(opsTrustProposalId);
    expect(proposal.ipfsHash).to.equal(DIP_18_IPFS_HASH);
  });

  it('DOT multisig receives tokens from the community treasury', async () => {
    const balance = await ctx.dydxToken.balanceOf(ctx.config.DOT_MULTISIG_ADDRESS);
    expect(balance).to.equal(ctx.config.DOT_FUNDING_AMOUNT);
  });
});
