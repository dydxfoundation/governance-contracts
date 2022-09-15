import { types } from 'hardhat/config';

import mainnetAddresses from '../../src/deployed-addresses/mainnet.json';
import { hardhatTask } from '../../src/hre';
import { DIP_UPDATE_REWARDS_IPFS_HASH } from '../../src/lib/constants';
import { updateMerkleDistributorRewardsParametersProposal } from '../../src/migrations/update-merkle-distributor-rewards-parameters-proposal';

hardhatTask('deploy:update-merkle-distributor-rewards-parameters-proposal', 'Create proposal to update merkle distributor rewards parameters')
  // TODO: Specify the correct DIP IPFS hash.
  .addParam('proposalIpfsHashHex', 'IPFS hash for the uploaded DIP describing the proposal', DIP_UPDATE_REWARDS_IPFS_HASH, types.string)
  .addParam('governorAddress', 'Address of the deployed DydxGovernor contract', mainnetAddresses.governor, types.string)
  .addParam('shortTimelockAddress', 'Address of the deployed short timelock Executor contract', mainnetAddresses.shortTimelock, types.string)
  .addParam('merkleDistributorAddress', 'Address of the deployed merkle distributor contract', mainnetAddresses.merkleDistributor, types.string)
  .setAction(async (args) => {
    await updateMerkleDistributorRewardsParametersProposal(args);
  });

