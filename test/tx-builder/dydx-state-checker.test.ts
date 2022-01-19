import { expect } from 'chai';
import hre from 'hardhat';

import { Network } from '../../src';
import config from '../../src/config';
import { DydxStateChecker } from '../../src/tx-builder/services/DydxStateChecker';

describe('DydxStateChecker', () => {
  const governanceClient: DydxStateChecker = new DydxStateChecker(
    {
      network: Network.hardhat,
      provider: hre.ethers.provider,
    },
  );

  it('getGovernanceVoters', async () => {
    if (!config.FORK_MAINNET) {
      return;
    }
    const voters = await governanceClient.getGovernanceVoters(
      '0x7E9B1672616FF6D6629Ef2879419aaE79A9018D2',
      13678600,
    );
    expect(voters.size).to.be.eq(790);
  });
});
