import { expect } from 'chai';

import { DIP_22_IPFS_HASH } from '../../src/lib/constants';
import { describeContract, TestContext } from '../helpers/describe-contract';

// Configuration hash should change to 0x03cbd17769430aed60aa8b9a5867b375c3fdca23e56cbbd83e33290577f50449

function init() { }

describeContract('update the funding rate config hash', init, (ctx: TestContext) => {

  it('Proposal IPFS hash is correct', async () => {
    const V3_DATA_AVAILABILITY_PROPOSAL_ID = 21;
    const proposal = await ctx.governor.getProposalById(V3_DATA_AVAILABILITY_PROPOSAL_ID);
    expect(proposal.ipfsHash).to.equal(DIP_22_IPFS_HASH);
  });

  it('Global configuration hash has been updated', async () => {
    const globalConfig = await ctx.starkPerpetual.globalConfigurationHash();
    expect(globalConfig).to.equal(ctx.config.STARK_PERPETUAL_CONFIG_HASH);
  });
});
