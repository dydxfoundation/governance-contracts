import {
  SafetyModuleV2,
  SafetyModuleV2__factory,
  SM2Recovery,
  SM2Recovery__factory,
} from '../../types';
import { getDeployConfig } from '../deploy-config';
import { getHre } from '../hre';
import { log } from '../lib/logging';
import { waitForTx } from '../lib/util';
import { deployUpgradeable } from './helpers/deploy-upgradeable';

export async function deploySafetyModuleRecovery({
  startStep = 0,

  dydxTokenAddress,
  rewardsTreasuryAddress,

  safetyModuleNewImplAddress,
  safetyModuleRecoveryAddress,
}: {
  startStep?: number,

  dydxTokenAddress: string,
  rewardsTreasuryAddress: string,

  safetyModuleNewImplAddress?: string,
  safetyModuleRecoveryAddress?: string,
}) {
  log('Beginning safety module recovery deployment\n');
  const deployConfig = getDeployConfig();

  const [deployer] = await getHre().ethers.getSigners();
  const deployerAddress = deployer.address;
  log(`Beginning deployment with deployer ${deployerAddress}\n`);

  let safetyModuleNewImpl: SafetyModuleV2;
  let safetyModuleRecovery: SM2Recovery;

  if (startStep <= 1) {
    console.log('Step 1. Deploy new safety module implementation contract.');
    safetyModuleNewImpl = await new SafetyModuleV2__factory(deployer).deploy(
      dydxTokenAddress,
      dydxTokenAddress,
      rewardsTreasuryAddress,
      deployConfig.SM_RECOVERY_DISTRIBUTION_START,
      deployConfig.SM_RECOVERY_DISTRIBUTION_END,
    );
    await waitForTx(safetyModuleNewImpl.deployTransaction);
    safetyModuleNewImplAddress = safetyModuleNewImpl.address;
  } else {
    if (!safetyModuleNewImplAddress) {
      throw new Error('Expected parameter safetyModuleNewImplAddress to be specified.');
    }
    safetyModuleNewImpl = new SafetyModuleV2__factory(deployer).attach(safetyModuleNewImplAddress);
  }

  if (startStep <= 2) {
    console.log('Step 2. Deploy the upgradeable Safety Module recovery contract.');
    [safetyModuleRecovery] = await deployUpgradeable(
      SM2Recovery__factory,
      deployer,
      [dydxTokenAddress],
      [],
    );
    safetyModuleRecoveryAddress = safetyModuleRecovery.address;
  } else {
    if (!safetyModuleRecoveryAddress) {
      throw new Error('Expected parameter safetyModuleRecoveryAddress to be specified.');
    }
    safetyModuleRecovery = new SM2Recovery__factory(deployer).attach(safetyModuleRecoveryAddress);
  }

  log('\n=== SAFETY MODULE RECOVERY DEPLOYMENT COMPLETE ===\n');

  return {
    safetyModuleNewImpl,
    safetyModuleRecovery,
  };
}
