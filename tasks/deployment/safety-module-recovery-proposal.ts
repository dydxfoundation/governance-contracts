import { types } from 'hardhat/config';

import { hardhatTask } from '../../src/hre';
import { deploySafetyModuleRecovery } from '../../src/migrations/safety-module-recovery';

hardhatTask('deploy:safety-module-recovery', 'Deploy the Safety Module recovery contracts.')
  .addParam('proposalIpfsHashHex', 'IPFS hash for the uploaded DIP describing the proposal', types.string)
  .addParam('governorAddress', 'Address of the deployed DydxGovernor contract', types.string)
  .addParam('longTimelockAddress', 'Address of the deployed long timelock Executor contract', types.string)
  .addParam('safetyModuleAddress', 'Address of the deployed Safety Module upgradeable contract', types.string)
  .addParam('safetyModuleProxyAdminAddress', 'Address of the deployed ProxyAdmin for the Safety Module', types.string)
  .addParam('safetyModuleNewImplAddress', 'Address of the new deployed SafetyModuleV2 implementation contract', types.string)
  .addParam('safetyModuleRecoveryAddress', 'Address of the deployed SM2Recovery contract', types.string)
  .setAction(async (args) => {
    await deploySafetyModuleRecovery(args);
  });
