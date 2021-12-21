/**
 * Perform all deployments which were used in the dYdX governance mainnet deployment.
 */

import config from '../../src/config';
import { getDeployConfig } from '../../src/deploy-config';
import { getDeployerSigner } from '../../src/deploy-config/get-deployer-address';
import { SM_ROLE_HASHES } from '../../src/lib/constants';
import { deployStarkProxyV2 } from '../../src/migrations/deploy-stark-proxy-v2';
import { deployMocks } from '../../src/migrations/helpers/deploy-mocks';
import { impersonateAndFundAccount } from '../../src/migrations/helpers/impersonate-account';
import { deployPhase1 } from '../../src/migrations/phase-1';
import { deployPhase2 } from '../../src/migrations/phase-2';
import { deployPhase3 } from '../../src/migrations/phase-3';
import { deploySafetyModuleRecovery } from '../../src/migrations/safety-module-recovery';
import { AllDeployedContracts } from '../../src/types';
import { incrementTimeToTimestamp, latestBlockTimestamp } from '../helpers/evm';
import { simulateAffectedStakers } from './affected-stakers';
import { fundGrantsProgramViaProposal, fundGrantsProgramNoProposal } from './grants-program-proposal';
import { fundSafetyModuleRecoveryNoProposal, fundSafetyModuleRecoveryViaProposal } from './safety-module-compensation';
import { executeSafetyModuleUpgradeNoProposal, executeSafetyModuleUpgradeViaProposal } from './safety-module-fix';
import { executeStarkProxyUpgradeNoProposal, executeStarkProxyUpgradeViaProposal } from './stark-proxy-fix';

/**
 * Perform all deployments steps for the test environment.
 *
 * We use the mainnet deployments scripts to mimic the mainnet environment as closely as possible.
 */
export async function deployContractsForTest(): Promise<AllDeployedContracts> {
  // Phase 1: Deploy core governance contracts.
  const phase1Contracts = await deployPhase1();

  const mockContracts = await deployMocks();

  // Phase 2: Deploy and configure governance and incentive contracts.
  const phase2Contracts = await deployPhase2({
    // Mock contracts.
    starkPerpetualAddress: mockContracts.starkPerpetual.address,
    dydxCollateralTokenAddress: mockContracts.dydxCollateralToken.address,

    // Phase 1 contracts.
    dydxTokenAddress: phase1Contracts.dydxToken.address,
    governorAddress: phase1Contracts.governor.address,
    shortTimelockAddress: phase1Contracts.shortTimelock.address,
    merklePauserTimelockAddress: phase1Contracts.merklePauserTimelock.address,
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
    liquidityStakingAddress: phase2Contracts.liquidityStaking.address,
    liquidityStakingProxyAdminAddress: phase2Contracts.liquidityStakingProxyAdmin.address,
    merkleDistributorAddress: phase2Contracts.merkleDistributor.address,
    merkleDistributorProxyAdminAddress: phase2Contracts.merkleDistributorProxyAdmin.address,
    starkProxyAddresses: phase2Contracts.starkProxies.map((sp) => sp.address),
    starkProxyProxyAdminAddresses: phase2Contracts.starkProxyProxyAdmins.map((spa) => spa.address),
  });

  // Simulate mainnet staking activity with the broken Safety Module.
  const deployConfig = getDeployConfig();
  await incrementTimeToTimestamp(deployConfig.TRANSFERS_RESTRICTED_BEFORE);
  await simulateAffectedStakers({
    dydxTokenAddress: phase1Contracts.dydxToken.address,
    safetyModuleAddress: phase2Contracts.safetyModule.address,
  });

  // Deploy contracts for Safety Module recovery.
  const smRecoveryContracts = await deploySafetyModuleRecovery({
    dydxTokenAddress: phase1Contracts.dydxToken.address,
    shortTimelockAddress: phase1Contracts.shortTimelock.address,
    rewardsTreasuryAddress: phase2Contracts.rewardsTreasury.address,
  });

  // Deploy contracts for Stark Proxy recovery.
  const starkProxyRecoveryContracts = await deployStarkProxyV2({
    liquidityStakingAddress: phase2Contracts.liquidityStaking.address,
    merkleDistributorAddress: phase2Contracts.merkleDistributor.address,
    starkPerpetualAddress: mockContracts.starkPerpetual.address,
    dydxCollateralTokenAddress: mockContracts.dydxCollateralToken.address,
  });

  return {
    ...phase1Contracts,
    ...phase2Contracts,
    ...smRecoveryContracts,
    ...starkProxyRecoveryContracts,
    ...mockContracts,
  };
}

export async function executeSafetyModuleRecoveryProposalsForTest(
  deployedContracts: AllDeployedContracts,
) {
  // Perform the safety module upgrade to recover funds and restore operation.
  if (config.TEST_SM_RECOVERY_WITH_PROPOSAL) {
    await executeSafetyModuleUpgradeViaProposal({
      dydxTokenAddress: deployedContracts.dydxToken.address,
      governorAddress: deployedContracts.governor.address,
      longTimelockAddress: deployedContracts.longTimelock.address,
      safetyModuleAddress: deployedContracts.safetyModule.address,
      safetyModuleProxyAdminAddress: deployedContracts.safetyModuleProxyAdmin.address,
      safetyModuleNewImplAddress: deployedContracts.safetyModuleNewImpl.address,
    });
    await fundSafetyModuleRecoveryViaProposal({
      dydxTokenAddress: deployedContracts.dydxToken.address,
      governorAddress: deployedContracts.governor.address,
      shortTimelockAddress: deployedContracts.shortTimelock.address,
      rewardsTreasuryAddress: deployedContracts.rewardsTreasury.address,
      safetyModuleRecoveryAddress: deployedContracts.safetyModuleRecovery.address,
    });
  } else {
    // Simulate the execution of the proposals without actually using the governance process.
    await executeSafetyModuleUpgradeNoProposal({
      longTimelockAddress: deployedContracts.longTimelock.address,
      safetyModuleAddress: deployedContracts.safetyModule.address,
      safetyModuleProxyAdminAddress: deployedContracts.safetyModuleProxyAdmin.address,
      safetyModuleNewImplAddress: deployedContracts.safetyModuleNewImpl.address,
    });
    await fundSafetyModuleRecoveryNoProposal({
      dydxTokenAddress: deployedContracts.dydxToken.address,
      shortTimelockAddress: deployedContracts.shortTimelock.address,
      rewardsTreasuryAddress: deployedContracts.rewardsTreasury.address,
      safetyModuleRecoveryAddress: deployedContracts.safetyModuleRecovery.address,
    });
  }
}

export async function executeStarkProxyProposalForTest(
  deployedContracts: AllDeployedContracts,
) {
  // Perform the safety module upgrade to recover funds and restore operation.
  if (config.TEST_SP_FIX_WITH_PROPOSAL) {
    await executeStarkProxyUpgradeViaProposal({
      dydxTokenAddress: deployedContracts.dydxToken.address,
      governorAddress: deployedContracts.governor.address,
      shortTimelockAddress: deployedContracts.shortTimelock.address,
      starkProxyAddresses: deployedContracts.starkProxies.map((sp) => sp.address),
      starkProxyProxyAdminAddresses: deployedContracts.starkProxyProxyAdmins.map((sp) => sp.address),
      starkProxyNewImplAddress: deployedContracts.starkProxyNewImpl.address,
    });
  } else {
    // Simulate the execution of the proposals without actually using the governance process.
    await executeStarkProxyUpgradeNoProposal({
      shortTimelockAddress: deployedContracts.shortTimelock.address,
      starkProxyAddresses: deployedContracts.starkProxies.map((sp) => sp.address),
      starkProxyProxyAdminAddresses: deployedContracts.starkProxyProxyAdmins.map((sp) => sp.address),
      starkProxyNewImplAddress: deployedContracts.starkProxyNewImpl.address,
    });
  }
}

export async function executeGrantsProgramProposalForTest(
  deployedContracts: AllDeployedContracts,
) {
  if (config.TEST_FUND_GRANTS_PROGRAM_WITH_PROPOSAL) {
    await fundGrantsProgramViaProposal({
      dydxTokenAddress: deployedContracts.dydxToken.address,
      governorAddress: deployedContracts.governor.address,
      shortTimelockAddress: deployedContracts.shortTimelock.address,
      communityTreasuryAddress: deployedContracts.communityTreasury.address,
    });
  } else {
    await fundGrantsProgramNoProposal({
      dydxTokenAddress: deployedContracts.dydxToken.address,
      shortTimelockAddress: deployedContracts.shortTimelock.address,
      communityTreasuryAddress: deployedContracts.communityTreasury.address,
    });
  }
}

/**
 * After the deploy scripts have run, this function configures the contracts for testing.
 */
export async function configureForTest(
  deployedContracts: AllDeployedContracts,
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
