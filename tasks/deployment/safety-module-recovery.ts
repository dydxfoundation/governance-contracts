import { types } from 'hardhat/config';

import { hardhatTask } from '../../src/hre';
import { log } from '../../src/lib/logging';
import { deploySafetyModuleRecovery } from '../../src/migrations/safety-module-recovery';

hardhatTask('deploy:safety-module-recovery', 'Deploy the Safety Module recovery contracts.')
  .addParam('startStep', 'Which step to start with', 1, types.int)
  .addOptionalParam('onlyStep', 'Which step to run', undefined, types.int)
  .addParam('dydxTokenAddress', 'Previously deployed dYdX token address', undefined, types.string)
  .addParam('shortTimelockAddress', 'Previously deployed short timelock executor address', undefined, types.string)
  .addParam('rewardsTreasuryAddress', 'Previously deployed rewards treasury address', undefined, types.string)
  .addOptionalParam('safetyModuleNewImplAddress', 'Previously deployed SafetyModuleV2 implementation contract', undefined, types.string)
  .addOptionalParam('safetyModuleRecoveryAddress', 'Previously deployed SM2Recovery contract', undefined, types.string)
  .addOptionalParam('safetyModuleRecoveryProxyAdminAddress', 'Previously deployed SM2Recovery Proxy Admin contract', undefined, types.string)
  .setAction(async (args: {
    startStep: number,
    onlyStep?: number,
    dydxTokenAddress: string,
    shortTimelockAddress: string,
    rewardsTreasuryAddress: string,
    safetyModuleNewImplAddress?: string,
    safetyModuleRecoveryAddress?: string,
    safetyModuleRecoveryProxyAdminAddress?: string,
  }) => {
    const {
      safetyModuleNewImpl,
      safetyModuleRecovery,
      safetyModuleRecoveryProxyAdmin,
    } = await deploySafetyModuleRecovery(args);
    log(`New Safety Module implementation deployed to: ${safetyModuleNewImpl.address}`);
    log(`Safety Module recovery contract deployed to: ${safetyModuleRecovery.address}`);
    log(`Safety Module recovery proxy admin deployed to: ${safetyModuleRecoveryProxyAdmin.address}`);
  });
