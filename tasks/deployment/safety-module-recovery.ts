import { types } from 'hardhat/config';

import { hardhatTask } from '../../src/hre';
import { deploySafetyModuleRecovery } from '../../src/migrations/safety-module-recovery';

hardhatTask('deploy:safety-module-recovery', 'Deploy the Safety Module recovery contracts.')
  .addParam('startStep', 'Which step to start with', 1, types.int)
  .addParam('dydxTokenAddress', 'Previously deployed dYdX token address', '', types.string)
  .addParam('rewardsTreasuryAddress', 'Previously deployed rewards treasury address', '', types.string)
  .addOptionalParam('safetyModuleNewImplAddress', 'Previously deployed SafetyModuleV2 implementation contract', '', types.string)
  .setAction(async (args) => {
    await deploySafetyModuleRecovery(args);
  });
