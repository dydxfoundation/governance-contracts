import { types } from 'hardhat/config';

import { DIP_12_IPFS_HASH } from '../../src/lib/constants';
import mainnetAddresses from '../../src/deployed-addresses/mainnet.json';
import { hardhatTask } from '../../src/hre';
import { createNewMarketsProposal } from '../../src/migrations/new-markets';

hardhatTask('deploy:new-markets-proposal', 'Create proposal to add 15 new markets to dYdX.')
  .addParam('proposalIpfsHashHex', 'IPFS hash for the uploaded DIP describing the proposal', DIP_12_IPFS_HASH, types.string)
  .addParam('governorAddress', 'Address of the deployed DydxGovernor contract', mainnetAddresses.governor, types.string)
  .addParam('priorityExecutorStarkware', 'Address of the deployed Starkware Priority Executor contract', mainnetAddresses.starkwarePriorityTimelock, types.string)
  .addParam('starkexHelperGovernor', 'Address of the deployed StarkEx Helper Governor contract', mainnetAddresses.starkexHelperGovernor, types.string)
  .setAction(async (args) => {
    await createNewMarketsProposal(args);
  });