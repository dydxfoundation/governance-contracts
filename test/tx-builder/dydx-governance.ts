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

let txBuilder: TxBuilder;

function init(ctx: TestContext): void {
  txBuilder = new TxBuilder(
    {
      network: Network.hardhat,
      hardhatGovernanceAddresses: { DYDX_GOVERNANCE: ctx.governor.address } as tDistinctGovernanceAddresses,
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
          13679600,
        );
        expect(emptyVoters.size).to.be.eq(0);
      });
    },
  );
});
