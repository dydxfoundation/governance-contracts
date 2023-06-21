import { expect } from 'chai';
import { BigNumber } from 'ethers';

import { DIP_20_IPFS_HASH } from '../../src/lib/constants';
import { describeContractHardhatRevertBefore, TestContext } from '../helpers/describe-contract';

// LP rewards should stay the same (1150685000000000000000000)
// Trader rewards should be reduced by 45% (2876712000000000000000000 => 1582192000000000000000000)
// Alpha parameter is equal to 0 since the last time

function init() { }

describeContractHardhatRevertBefore('update-merkle-distributor-rewards-parameters-v2', init, (ctx: TestContext) => {

  it('Proposal IPFS hash is correct', async () => {
    const updateMerkleDistributorRewardParametersV2ProposalId = 11;
    const proposal = await ctx.governor.getProposalById(updateMerkleDistributorRewardParametersV2ProposalId);
    expect(proposal.ipfsHash).to.equal(DIP_20_IPFS_HASH);
  });

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
    expect(traderRewardsAmount.toString()).to.equal('1582192000000000000000000');
    expect(alphaParameter).to.equal(0);
  });
});
