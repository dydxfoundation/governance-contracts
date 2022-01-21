import { expect } from 'chai';
import hre from 'hardhat';

import {
  DYDX_GOVERNOR_DEPLOYMENT_BLOCK,
  Network,
  tDistinctGovernanceAddresses,
  TxBuilder,
} from '../../src';
import { NetworkName } from '../../src/types';
import { describeContract, describeContractForNetwork, TestContext } from '../helpers/describe-contract';

const BLOCK_AFTER_GOVRNANCE_VOTES: number = 13679600;

let txBuilder: TxBuilder;

function init(ctx: TestContext): void {
  txBuilder = new TxBuilder(
    {
      network: Network.hardhat,
      hardhatGovernanceAddresses: {
        DYDX_GOVERNANCE: ctx.governor.address,
      } as tDistinctGovernanceAddresses,
      hardhatMerkleDistributorAddresses: {
        MERKLE_DISTRIBUTOR_ADDRESS: ctx.merkleDistributor.address,
      },
      injectedProvider: hre.ethers.provider,
    },
  );
}

describeContract('DydxGovernance', init, (ctx: TestContext) => {
  describeContractForNetwork(
    'DydxGovernance',
    ctx,
    NetworkName.hardhat,
    true,
    () => {
      it('getGovernanceVoters with large range and expected votes', async () => {
        const voters = await txBuilder.dydxGovernanceService.getGovernanceVoters(
          DYDX_GOVERNOR_DEPLOYMENT_BLOCK,
        );
        expect(voters.size).to.be.eq(790);
      });

      it('getGovernanceVoters with no range and no expected votes', async () => {
        const emptyVoters = await txBuilder.dydxGovernanceService.getGovernanceVoters(
          DYDX_GOVERNOR_DEPLOYMENT_BLOCK,
          DYDX_GOVERNOR_DEPLOYMENT_BLOCK,
        );
        expect(emptyVoters.size).to.be.eq(0);
      });

      it('getGovernanceVoters with range and no expected votes', async () => {
        const emptyVoters = await txBuilder.dydxGovernanceService.getGovernanceVoters(
          DYDX_GOVERNOR_DEPLOYMENT_BLOCK,
          BLOCK_AFTER_GOVRNANCE_VOTES,
        );
        expect(emptyVoters.size).to.be.eq(0);
      });

      it('getUserBalancesPerEpoch', async () => {
        const userBalancesPerEpoch = await txBuilder.merkleDistributorService.getUserBalancesPerEpoch();
        expect(Object.keys(userBalancesPerEpoch).length).to.be.eq(3);
        expect(Object.keys(userBalancesPerEpoch['2']).length).to.be.eq(40867);
      });

      it('getActiveUsersInEpoch 0', async () => {
        const activeUsers = await txBuilder.merkleDistributorService.getActiveUsersInEpoch(0);
        expect(activeUsers.length).to.be.eq(32457);
      });

      it('getActiveUsersInEpoch 1', async () => {
        const activeUsers = await txBuilder.merkleDistributorService.getActiveUsersInEpoch(1);
        expect(activeUsers.length).to.be.eq(9979);
      });

      it('getActiveUsersInEpoch 11', async () => {
        const activeUsers = await txBuilder.merkleDistributorService.getActiveUsersInEpoch(11);
        expect(activeUsers.length).to.be.eq(0);
      });
    },
  );
});
