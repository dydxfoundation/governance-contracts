import { types } from 'hardhat/config';

import mainnetAddresses from '../../src/deployed-addresses/mainnet.json';
import { hardhatTask } from '../../src/hre';
import { DIP_21_IPFS_HASH } from '../../src/lib/constants';
import { createV3DataAvailabilityProposal } from '../../src/migrations/v3-data-availability-proposal';

hardhatTask('deploy:v3-data-availability-proposal', 'Create proposal to fix data availability bug on v3 perp contract.')
  .addParam('proposalIpfsHashHex', 'IPFS hash for the uploaded DIP describing the proposal', DIP_21_IPFS_HASH, types.string)
  .addParam('governorAddress', 'Address of the deployed DydxGovernor contract', mainnetAddresses.governor, types.string)
  .addParam('starkwarePriorityAddress', 'Address of the deployed short timelock Executor contract', mainnetAddresses.starkwarePriorityTimelock, types.string)
  .addParam('starkPerpetualAddress', 'Address of the deployed liquidity module contract', mainnetAddresses.starkPerpetual, types.string)
  .setAction(async (args) => {
    await createV3DataAvailabilityProposal(args);
  });
