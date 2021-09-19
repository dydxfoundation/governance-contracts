import { Interface } from 'ethers/lib/utils';

import { getDeployConfig } from '../../src/deploy-config';
import { log } from '../../src/lib/logging';
import { waitForTx } from '../../src/lib/util';
import { impersonateAndFundAccount } from '../../src/migrations/helpers/impersonate-account';
import {
  ProxyAdmin__factory,
  SafetyModuleV2__factory,
} from '../../types';

export async function executeSafetyModuleUpgrade({
  longTimelockAddress,
  safetyModuleAddress,
  safetyModuleProxyAdminAddress,
  safetyModuleNewImplAddress,
  safetyModuleRecoveryAddress,
}: {
  longTimelockAddress: string,
  safetyModuleAddress: string,
  safetyModuleProxyAdminAddress: string,
  safetyModuleNewImplAddress: string,
  safetyModuleRecoveryAddress: string,
}): Promise<void> {
  const deployConfig = getDeployConfig();

  // NOTE: On mainnet, the upgrade and the call to the initializer are performed atomically
  // via a governance proposal. It's important that these steps are atomic or else the
  // initializer can be called to extract funds from the contract.
  const mockLongTimelock = await impersonateAndFundAccount(longTimelockAddress);
  const safetyModuleProxyAdmin = new ProxyAdmin__factory(mockLongTimelock).attach(safetyModuleProxyAdminAddress);
  const initializeCalldata = new Interface(SafetyModuleV2__factory.abi).encodeFunctionData(
    'initialize',
    [
      safetyModuleRecoveryAddress,
      deployConfig.SM_RECOVERY_COMPENSATION_AMOUNT,
    ],
  );
  await waitForTx(
    await safetyModuleProxyAdmin.upgradeAndCall(
      safetyModuleAddress,
      safetyModuleNewImplAddress,
      initializeCalldata,
    ),
  );
  console.log('upgraded address', safetyModuleAddress);

  log('\n=== SAFETY MODULE RECOVERY COMPLETE ===\n');
}
