/**
 * Perform all deployments which were used in the dYdX governance mainnet deployment.
 */

import { getDeployConfig } from '../../src/deploy-config';
import { SM_ROLE_HASHES } from '../../src/lib/constants';
import { getRole } from '../../src/lib/util';
import { impersonateAndFundAccount } from '../../src/migrations/helpers/impersonate-account';
import { deployPhase1 } from '../../src/migrations/phase-1';
import { deployPhase2 } from '../../src/migrations/phase-2';
import { deployPhase3 } from '../../src/migrations/phase-3';
import { deploySafetyModuleRecovery } from '../../src/migrations/safety-module-recovery';
import { Role } from '../../src/types';
import { incrementTimeToTimestamp } from '../helpers/evm';
import hre from '../hre';
import { simulateAffectedStakers } from './affected-stakers';
import { executeSafetyModuleUpgrade } from './execute-safety-module-upgrade';

type UnwrapPromise<T> = T extends Promise<infer U> ? U : never;

export type DeployedContracts = (
  UnwrapPromise<ReturnType<typeof deployPhase1>> &
  UnwrapPromise<ReturnType<typeof deployPhase2>> &
  UnwrapPromise<ReturnType<typeof deploySafetyModuleRecovery>>
);

/**
 * Perform all deployments steps for the test environment.
 *
 * We use the mainnet deployments scripts to mimic the mainnet environment as closely as possible.
 */
export async function deployContractsForTest(): Promise<DeployedContracts> {
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
    rewardsTreasuryAddress: phase2Contracts.rewardsTreasury.address,
  });

  // Deploy contracts for Safety Module recovery.
  const smRecoveryContracts = await deploySafetyModuleRecovery({
    dydxTokenAddress: phase1Contracts.dydxToken.address,
    rewardsTreasuryAddress: phase2Contracts.rewardsTreasury.address,
  });

  // Perform the safety module upgrade to recover funds and restore operation.
  await executeSafetyModuleUpgrade({
    longTimelockAddress: phase1Contracts.longTimelock.address,
    safetyModuleAddress: phase2Contracts.safetyModule.address,
    safetyModuleProxyAdminAddress: phase2Contracts.safetyModuleProxyAdmin.address,
    safetyModuleNewImplAddress: smRecoveryContracts.safetyModuleNewImpl.address,
    safetyModuleRecoveryAddress: smRecoveryContracts.safetyModuleRecovery.address,
  });

  const deployedContracts: DeployedContracts = {
    ...phase1Contracts,
    ...phase2Contracts,
    ...smRecoveryContracts,
  };
  await configureForTest(deployedContracts);
  return deployedContracts;
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
  const [deployer] = await hre.ethers.getSigners();

  // Give some tokens back to the deployer to use during testing.
  const foundationAddress = getDeployConfig().TOKEN_ALLOCATIONS.DYDX_FOUNDATION.ADDRESS;
  const foundation = await impersonateAndFundAccount(foundationAddress);
  const balance = await dydxToken.balanceOf(foundationAddress);
  await dydxToken.connect(foundation).transfer(deployer.address, balance);

  // Assign roles to the deployer for use during testing.
  const mockShortTimelock = await impersonateAndFundAccount(shortTimelock.address);
  await safetyModule.connect(mockShortTimelock).grantRole(
    getRole(Role.OWNER_ROLE),
    deployer.address,
  );
  for (const role of SM_ROLE_HASHES) {
    await safetyModule.connect(mockShortTimelock).grantRole(
      role,
      deployer.address,
    );
  }
}
