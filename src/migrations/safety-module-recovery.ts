import {
  Executor__factory,
  ProxyAdmin,
  ProxyAdmin__factory,
  SafetyModuleV2,
  SafetyModuleV2__factory,
  SM2Recovery,
  SM2Recovery__factory,
} from '../../types';
import { getDeployConfig } from '../deploy-config';
import { getDeployerSigner } from '../deploy-config/get-deployer-address';
import { log } from '../lib/logging';
import { waitForTx } from '../lib/util';
import { deployUpgradeable } from './helpers/deploy-upgradeable';

export async function deploySafetyModuleRecovery({
  startStep = 0,
  onlyStep,

  dydxTokenAddress,
  shortTimelockAddress,
  rewardsTreasuryAddress,

  safetyModuleNewImplAddress,
  safetyModuleRecoveryAddress,
  safetyModuleRecoveryProxyAdminAddress,
}: {
  startStep?: number,
  onlyStep?: number,

  dydxTokenAddress: string,
  shortTimelockAddress: string,
  rewardsTreasuryAddress: string,

  safetyModuleNewImplAddress?: string,
  safetyModuleRecoveryAddress?: string,
  safetyModuleRecoveryProxyAdminAddress?: string,
}) {
  log('Beginning safety module recovery deployment\n');
  const deployConfig = getDeployConfig();
  const deployer = await getDeployerSigner();
  const deployerAddress = deployer.address;
  log(`Beginning deployment with deployer ${deployerAddress}\n`);

  const shortTimelock = new Executor__factory(deployer).attach(shortTimelockAddress);

  let safetyModuleNewImpl: SafetyModuleV2;
  let safetyModuleRecovery: SM2Recovery;
  let safetyModuleRecoveryProxyAdmin: ProxyAdmin;

  if (onlyStep ? onlyStep === 1 : startStep <= 1) {
    log('Step 1. Deploy new safety module implementation contract.');
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

  if (onlyStep ? onlyStep === 2 : startStep <= 2) {
    log('Step 2. Deploy the upgradeable Safety Module recovery contract.');
    [safetyModuleRecovery, , safetyModuleRecoveryProxyAdmin] = await deployUpgradeable(
      SM2Recovery__factory,
      deployer,
      [dydxTokenAddress],
      [],
    );
    safetyModuleRecoveryAddress = safetyModuleRecovery.address;
    safetyModuleRecoveryProxyAdminAddress = safetyModuleRecoveryProxyAdmin.address;
  } else {
    if (!safetyModuleRecoveryAddress) {
      throw new Error('Expected parameter safetyModuleRecoveryAddress to be specified.');
    }
    if (!safetyModuleRecoveryProxyAdminAddress) {
      throw new Error('Expected parameter safetyModuleRecoveryProxyAdminAddress to be specified.');
    }
    safetyModuleRecovery = new SM2Recovery__factory(deployer).attach(safetyModuleRecoveryAddress);
    safetyModuleRecoveryProxyAdmin = new ProxyAdmin__factory(deployer).attach(
      safetyModuleRecoveryProxyAdminAddress,
    );
  }

  if (onlyStep ? onlyStep === 3 : startStep <= 3) {
    log('Step 3. Transfer SM2Recovery proxy admin ownership to the short timelock.');
    await waitForTx(await safetyModuleRecoveryProxyAdmin.transferOwnership(shortTimelock.address));
  }

  log('\n=== SAFETY MODULE RECOVERY DEPLOYMENT COMPLETE ===\n');

  return {
    safetyModuleNewImpl,
    safetyModuleRecovery,
    safetyModuleRecoveryProxyAdmin,
  };
}
