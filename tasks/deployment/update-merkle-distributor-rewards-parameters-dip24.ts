import { types } from 'hardhat/config';

import mainnetAddresses from '../../src/deployed-addresses/mainnet.json';
import { hardhatTask } from '../../src/hre';
import { DIP_24_IPFS_HASH } from '../../src/lib/constants';
import { updateMerkleDistributorRewardsParametersDIP24Proposal } from '../../src/migrations/update-merkle-distributor-rewards-parameters-dip24';

hardhatTask('deploy:update-merkle-distributor-rewards-parameters-dip24-proposal', 'Create DIP24 proposal to update merkle distributor rewards parameters')
  .addParam('proposalIpfsHashHex', 'IPFS hash for the uploaded DIP describing the proposal', DIP_24_IPFS_HASH, types.string)
  .addParam('governorAddress', 'Address of the deployed DydxGovernor contract', mainnetAddresses.governor, types.string)
  .addParam('shortTimelockAddress', 'Address of the deployed short timelock Executor contract', mainnetAddresses.shortTimelock, types.string)
  .addParam('merkleDistributorAddress', 'Address of the deployed merkle distributor contract', mainnetAddresses.merkleDistributor, types.string)
  .setAction(async (args) => {
    await updateMerkleDistributorRewardsParametersDIP24Proposal(args);
  });

