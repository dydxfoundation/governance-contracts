import { types } from 'hardhat/config';

import mainnetAddresses from '../../src/deployed-addresses/mainnet.json';
import { hardhatTask } from '../../src/hre';
import { createStarkProxyFixProposal } from '../../src/migrations/stark-proxy-fix-proposal';

hardhatTask('deploy:stark-proxy-fix-proposal', 'Create proposal to fix the Stark Proxy.')
  .addParam('proposalIpfsHashHex', 'IPFS hash for the uploaded DIP describing the proposal', undefined, types.string)
  .addParam('starkProxyNewImplAddress', 'Addresses of the new deployed StarkProxyV2 implementation contract', undefined, types.string)
  .addParam('governorAddress', 'Address of the deployed DydxGovernor contract', mainnetAddresses.governor, types.string)
  .addParam('shortTimelockAddress', 'Address of the deployed short timelock Executor contract', mainnetAddresses.shortTimelock, types.string)
  .addParam('starkProxyAddresses', 'Addresses of the deployed Stark Proxy upgradeable contracts', mainnetAddresses.starkProxies, types.json)
  .addParam('starkProxyProxyAdminAddresses', 'Addresses of the deployed ProxyAdmin for the Stark Proxies', mainnetAddresses.starkProxyProxyAdmins, types.json)
  .setAction(async (args) => {
    await createStarkProxyFixProposal(args);
  });
