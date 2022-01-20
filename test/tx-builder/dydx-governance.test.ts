import { expect } from 'chai';
import hre from 'hardhat';

import { Network, tDistinctGovernanceAddresses, TxBuilder } from '../../src';
import config from '../../src/config';

describe('DydxGovernance', () => {
  const blockAtWhichVotersAreExpected: number = 13678600;
  const governanceAddress: string = '0x7E9B1672616FF6D6629Ef2879419aaE79A9018D2';

  const txBuilder: TxBuilder = new TxBuilder(
    {
      network: Network.hardhat,
      hardhatGovernanceAddresses: { DYDX_GOVERNANCE: governanceAddress } as tDistinctGovernanceAddresses,
      injectedProvider: hre.ethers.provider,
    },
  );

  if (!config.FORK_MAINNET) {
    return;
  }

  it('getGovernanceVoters with large range and expected votes', async () => {
    const voters = await txBuilder.dydxGovernanceService.getGovernanceVoters(
      blockAtWhichVotersAreExpected,
    );
    expect(voters.size).to.be.eq(790);
  });

  it('getGovernanceVoters with no range and no expected votes', async () => {
    const emptyVoters = await txBuilder.dydxGovernanceService.getGovernanceVoters(
      blockAtWhichVotersAreExpected,
      blockAtWhichVotersAreExpected,
    );
    expect(emptyVoters.size).to.be.eq(0);
  });

  it('getGovernanceVoters with range and no expected votes', async () => {
    const emptyVoters = await txBuilder.dydxGovernanceService.getGovernanceVoters(
      blockAtWhichVotersAreExpected,
      13679600,
    );
    expect(emptyVoters.size).to.be.eq(0);
  });
});
