import { types } from 'hardhat/config';

import mainnetAddresses from '../../src/deployed-addresses/mainnet.json';
import { hardhatTask } from '../../src/hre';
import { DIP_14_IPFS_HASH } from '../../src/lib/constants';
import { createWindDownBorrowingPoolProposal } from '../../src/migrations/wind-down-borrowing-pool-proposal';

hardhatTask('deploy:wind-down-borrowing-pool-proposal', 'Create proposal to wind down the borrowing pool.')
  .addParam('proposalIpfsHashHex', 'IPFS hash for the uploaded DIP describing the proposal', DIP_14_IPFS_HASH, types.string)
  .addParam('governorAddress', 'Address of the deployed DydxGovernor contract', mainnetAddresses.governor, types.string)
  .addParam('shortTimelockAddress', 'Address of the deployed short timelock Executor contract', mainnetAddresses.shortTimelock, types.string)
  .addParam('liquidityModuleAddress', 'Address of the deployed liquidity module contract', mainnetAddresses.liquidityStaking, types.string)
  .setAction(async (args) => {
    await createWindDownBorrowingPoolProposal(args);
  });
