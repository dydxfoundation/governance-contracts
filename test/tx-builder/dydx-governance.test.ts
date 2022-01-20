import { expect } from 'chai';
import hre from 'hardhat';

import { Network, TxBuilder } from '../../src';
import config from '../../src/config';

describe('DydxGovernance', () => {
  const txBuilder: TxBuilder = new TxBuilder(
    {
      network: Network.hardhat,
      injectedProvider: hre.ethers.provider,
    },
  );

  it('getGovernanceVoters', async () => {
    if (!config.FORK_MAINNET) {
      return;
    }
    const voters = await txBuilder.dydxGovernanceService.getGovernanceVoters(
      '0x7E9B1672616FF6D6629Ef2879419aaE79A9018D2',
      13678600,
    );
    expect(voters.size).to.be.eq(790);

    const emptyVoters = await txBuilder.dydxGovernanceService.getGovernanceVoters(
      '0x7E9B1672616FF6D6629Ef2879419aaE79A9018D2',
      13678600,
      13678600,
    );
    expect(emptyVoters.size).to.be.eq(0);
  });
});
