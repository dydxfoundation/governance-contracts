import { types } from 'hardhat/config';

import { hardhatTask } from '../../src/hre';
import { createSafetyModuleRecoveryProposal } from '../../src/migrations/safety-module-recovery-proposal';

hardhatTask('deploy:safety-module-recovery-proposal', 'Deploy the Safety Module recovery contracts.')
  .addParam('proposalIpfsHashHex', 'IPFS hash for the uploaded DIP describing the proposal', undefined, types.string)
  .addParam('governorAddress', 'Address of the deployed DydxGovernor contract', undefined, types.string)
  .addParam('longTimelockAddress', 'Address of the deployed long timelock Executor contract', undefined, types.string)
  .addParam('safetyModuleAddress', 'Address of the deployed Safety Module upgradeable contract', undefined, types.string)
  .addParam('safetyModuleProxyAdminAddress', 'Address of the deployed ProxyAdmin for the Safety Module', undefined, types.string)
  .addParam('safetyModuleNewImplAddress', 'Address of the new deployed SafetyModuleV2 implementation contract', undefined, types.string)
  .addParam('safetyModuleRecoveryAddress', 'Address of the deployed SM2Recovery contract', undefined, types.string)
  .setAction(async (args) => {
    await createSafetyModuleRecoveryProposal(args);
  });
