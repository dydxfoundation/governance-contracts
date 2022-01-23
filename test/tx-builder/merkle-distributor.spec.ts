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

      it('getActiveUsersInEpoch 5', async () => {
        await hre.network.provider.send('evm_increaseTime', [604800]);
        await ctx.merkleDistributor.updateRoot();

        const activeUsers = await txBuilder.merkleDistributorService.getActiveUsersInEpoch(5);
        expect(activeUsers.length).to.be.eq(4877);
      });

      it('getActiveUsersInEpoch for future epoch', async () => {
        const activeUsers = await txBuilder.merkleDistributorService.getActiveUsersInEpoch(5000);
        expect(activeUsers.length).to.be.eq(0);
      });
    },
  );
});
