import { expect } from 'chai';
import hre from 'hardhat';

import {
  Network,
  TxBuilder,
} from '../../src';
import { NetworkName } from '../../src/types';
import { describeContract, describeContractForNetwork, TestContext } from '../helpers/describe-contract';

let txBuilder: TxBuilder;

function init(ctx: TestContext): void {
  txBuilder = new TxBuilder(
    {
      network: Network.hardhat,
      hardhatMerkleDistributorAddresses: {
        MERKLE_DISTRIBUTOR_ADDRESS: ctx.merkleDistributor.address,
      },
      injectedProvider: hre.ethers.provider,
    },
  );
}

describeContract('MerkleDistributor', init, (ctx: TestContext) => {
  describeContractForNetwork(
    'MerkleDistributor',
    ctx,
    NetworkName.hardhat,
    true,
    () => {
      it('getActiveUsersInEpoch 0', async () => {
        const activeUsers = await txBuilder.merkleDistributorService.getActiveUsersInEpoch(0);
        expect(activeUsers.length).to.be.eq(32457);
      });

      it('getActiveUsersInEpoch 1', async () => {
        const activeUsers = await txBuilder.merkleDistributorService.getActiveUsersInEpoch(1);
        expect(activeUsers.length).to.be.eq(9979);
      });

      it('getActiveUsersInEpoch 5000 - this is way in the future', async () => {
        const activeUsers = await txBuilder.merkleDistributorService.getActiveUsersInEpoch(5000);
        expect(activeUsers.length).to.be.eq(0);
      });
    },
  );
});
