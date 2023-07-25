import { expect } from 'chai';
import { BigNumber } from 'ethers';

import { DIP_24_IPFS_HASH } from '../../src/lib/constants';
import { describeContract, TestContext } from '../helpers/describe-contract';

// LP rewards should be reduced by 50% (115068500000000000000000 => 575343000000000000000000)
// Trader rewards should stay the same (1582192000000000000000000)
// Alpha parameter show stay the same (0)

function init() { }

describeContract('update-merkle-distributor-rewards-parameters-dip24', init, (ctx: TestContext) => {

  it('Proposal IPFS hash is correct', async () => {
      const updateMerkleDistributorRewardsParametersDIP24Proposal = 24;
      const proposal = await ctx.governor.getProposalById(updateMerkleDistributorRewardsParametersDIP24Proposal);
      expect(proposal.ipfsHash).to.equal(DIP_24_IPFS_HASH);
    });

  it('Merkle distributor reward parameters are updated for DIP 24', async () => {
    const [
      lpRewardsAmount,
      traderRewardsAmount,
      alphaParameter,
    ]: [
      BigNumber,
      BigNumber,
      BigNumber,
    ] = await ctx.merkleDistributor.getRewardsParameters();


    expect(lpRewardsAmount.toString()).to.equal('575343000000000000000000');
    expect(traderRewardsAmount.toString()).to.equal('1582192000000000000000000');
    expect(alphaParameter).to.equal(0);
  });
});
