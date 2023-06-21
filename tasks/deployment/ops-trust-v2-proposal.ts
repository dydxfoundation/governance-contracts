import { types } from 'hardhat/config';

import mainnetAddresses from '../../src/deployed-addresses/mainnet.json';
import { hardhatTask } from '../../src/hre';
import { DIP_23_IPFS_HASH } from '../../src/lib/constants';
import { createOpsTrustV2Proposal } from '../../src/migrations/ops-trust-v2-proposal';

hardhatTask('deploy:ops-trust-v2-proposal', 'Create proposal to fund DOT 2.0.')
  .addParam('proposalIpfsHashHex', 'IPFS hash for the uploaded DIP describing the proposal', DIP_23_IPFS_HASH, types.string)
  .addParam('dydxTokenAddress', 'Address of the deployed DYDX token contract', mainnetAddresses.dydxToken, types.string)
  .addParam('governorAddress', 'Address of the deployed DydxGovernor contract', mainnetAddresses.governor, types.string)
  .addParam('shortTimelockAddress', 'Address of the deployed short timelock Executor contract', mainnetAddresses.shortTimelock, types.string)
  .addParam('communityTreasuryAddress', 'Address of the deployed community treasury contract', mainnetAddresses.communityTreasury, types.string)
  .setAction(async (args) => {
    await createOpsTrustV2Proposal(args);
  });
