/**
 * Perform all deployments which were used in the dYdX governance mainnet deployment.
 */

import config from '../../src/config';
import { getDeployConfig } from '../../src/deploy-config';
import { getDeployerSigner } from '../../src/deploy-config/get-deployer-address';
import { SM_ROLE_HASHES } from '../../src/lib/constants';
import { impersonateAndFundAccount } from '../../src/migrations/helpers/impersonate-account';
import { deployPhase1 } from '../../src/migrations/phase-1';
import { deployPhase2 } from '../../src/migrations/phase-2';
import { deployPhase3 } from '../../src/migrations/phase-3';
import { deploySafetyModuleRecovery } from '../../src/migrations/safety-module-recovery';
import { DeployedContracts } from '../../src/types';
import { incrementTimeToTimestamp, latestBlockTimestamp } from '../helpers/evm';
import { simulateAffectedStakers } from './affected-stakers';
import { executeSafetyModuleUpgradeNoProposal, executeSafetyModuleUpgradeViaProposal } from './execute-safety-module-upgrade';

/**
 * Perform all deployments steps for the test environment.
 *
 * We use the mainnet deployments scripts to mimic the mainnet environment as closely as possible.
 */
export async function deployContractsForTest(): Promise<
  Omit<DeployedContracts, 'safetyModuleNewImpl' | 'safetyModuleRecovery'>
> {
  // Phase 1: Deploy core governance contracts.
  const phase1Contracts = await deployPhase1();

  // Phase 2: Deploy and configure governance and incentive contracts.
  const phase2Contracts = await deployPhase2({
    dydxTokenAddress: phase1Contracts.dydxToken.address,
    governorAddress: phase1Contracts.governor.address,
    shortTimelockAddress: phase1Contracts.shortTimelock.address,
    longTimelockAddress: phase1Contracts.longTimelock.address,
  });

  // Phase 3: Finalize the deployment w/ actions that cannot be reversed without governance action.
  await deployPhase3({
    // Phase 1 deployed contracts.
    dydxTokenAddress: phase1Contracts.dydxToken.address,
    governorAddress: phase1Contracts.governor.address,
    shortTimelockAddress: phase1Contracts.shortTimelock.address,
    longTimelockAddress: phase1Contracts.longTimelock.address,

    // Phase 2 deployed contracts.
    rewardsTreasuryAddress: phase2Contracts.rewardsTreasury.address,
    rewardsTreasuryProxyAdminAddress: phase2Contracts.rewardsTreasuryProxyAdmin.address,
    safetyModuleAddress: phase2Contracts.safetyModule.address,
    safetyModuleProxyAdminAddress: phase2Contracts.safetyModuleProxyAdmin.address,
    communityTreasuryAddress: phase2Contracts.communityTreasury.address,
    communityTreasuryProxyAdminAddress: phase2Contracts.communityTreasuryProxyAdmin.address,
    rewardsTreasuryVesterAddress: phase2Contracts.rewardsTreasuryVester.address,
    communityTreasuryVesterAddress: phase2Contracts.communityTreasuryVester.address,
  });

  // Simulate mainnet staking activity with the broken Safety Module.
  const deployConfig = getDeployConfig();
  await incrementTimeToTimestamp(deployConfig.TRANSFERS_RESTRICTED_BEFORE);
  await simulateAffectedStakers({
    dydxTokenAddress: phase1Contracts.dydxToken.address,
    safetyModuleAddress: phase2Contracts.safetyModule.address,
  });

  // Use type assertion since we're missing the return values from deploySafetyModuleRecovery().
  return {
    ...phase1Contracts,
    ...phase2Contracts,
  };
}

export async function applySafetyModuleRecoveryForTest(
  deployedContracts: Omit<DeployedContracts, 'safetyModuleNewImpl' | 'safetyModuleRecovery'>,
) {
  // Deploy contracts for Safety Module recovery.
  const smRecoveryContracts = await deploySafetyModuleRecovery({
    dydxTokenAddress: deployedContracts.dydxToken.address,
    rewardsTreasuryAddress: deployedContracts.rewardsTreasury.address,
  });

  // Perform the safety module upgrade to recover funds and restore operation.
  if (config.TEST_SM_RECOVERY_WITH_PROPOSAL) {
    await executeSafetyModuleUpgradeViaProposal({
      dydxTokenAddress: deployedContracts.dydxToken.address,
      governorAddress: deployedContracts.governor.address,
      longTimelockAddress: deployedContracts.longTimelock.address,
      safetyModuleAddress: deployedContracts.safetyModule.address,
      safetyModuleProxyAdminAddress: deployedContracts.safetyModuleProxyAdmin.address,
      safetyModuleNewImplAddress: smRecoveryContracts.safetyModuleNewImpl.address,
      safetyModuleRecoveryAddress: smRecoveryContracts.safetyModuleRecovery.address,
    });
  } else {
    await executeSafetyModuleUpgradeNoProposal({
      longTimelockAddress: deployedContracts.longTimelock.address,
      safetyModuleAddress: deployedContracts.safetyModule.address,
      safetyModuleProxyAdminAddress: deployedContracts.safetyModuleProxyAdmin.address,
      safetyModuleNewImplAddress: smRecoveryContracts.safetyModuleNewImpl.address,
      safetyModuleRecoveryAddress: smRecoveryContracts.safetyModuleRecovery.address,
    });
  }
  return smRecoveryContracts;
}

/**
 * After the deploy scripts have run, this functon configures the contracts for testing.
 */
export async function configureForTest(
  deployedContracts: DeployedContracts,
): Promise<void> {
  const {
    dydxToken,
    shortTimelock,
    safetyModule,
  } = deployedContracts;
  const deployer = await getDeployerSigner();

  // Give some tokens back to the deployer to use during testing.
  const foundationAddress = getDeployConfig().TOKEN_ALLOCATIONS.DYDX_FOUNDATION.ADDRESS;
  const foundation = await impersonateAndFundAccount(foundationAddress);
  const balance = await dydxToken.balanceOf(foundationAddress);
  await dydxToken.connect(foundation).transfer(deployer.address, balance);

  // Assign roles to the deployer for use during testing.
  const mockShortTimelock = await impersonateAndFundAccount(shortTimelock.address);
  for (const role of SM_ROLE_HASHES) {
    await safetyModule.connect(mockShortTimelock).grantRole(
      role,
      deployer.address,
    );
  }

  // Advance to the the next epoch start, to ensure we don't begin the tests in a blackout window.
  const nextEpochStart = (
    await latestBlockTimestamp() +
    Number(await deployedContracts.safetyModule.getTimeRemainingInCurrentEpoch())
  );
  await incrementTimeToTimestamp(nextEpochStart);
}
