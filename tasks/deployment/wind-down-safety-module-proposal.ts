import { types } from 'hardhat/config';

import mainnetAddresses from '../../src/deployed-addresses/mainnet.json';
import { hardhatTask } from '../../src/hre';
import { DIP_17_IPFS_HASH } from '../../src/lib/constants';
import { createWindDownSafetyModuleProposal } from '../../src/migrations/wind-down-safety-module-proposal';

hardhatTask('deploy:wind-down-safety-module-proposal', 'Create proposal to wind down the borrowing pool.')
  .addParam('proposalIpfsHashHex', 'IPFS hash for the uploaded DIP describing the proposal', DIP_17_IPFS_HASH, types.string)
  .addParam('governorAddress', 'Address of the deployed DydxGovernor contract', mainnetAddresses.governor, types.string)
  .addParam('shortTimelockAddress', 'Address of the deployed short timelock Executor contract', mainnetAddresses.shortTimelock, types.string)
  .addParam('safetyModuleAddress', 'Address of the deployed safety module contract', mainnetAddresses.safetyModule, types.string)
  .setAction(async (args) => {
    await createWindDownSafetyModuleProposal(args);
  });
