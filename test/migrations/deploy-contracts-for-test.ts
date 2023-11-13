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
import { fundGrantsProgramV15ViaProposal, fundGrantsProgramV15NoProposal } from './grants-program-v1_5-proposal';
import { fundOpsTrustNoProposal, fundOpsTrustViaProposal } from './ops-trust-proposal';
import { fundOpsTrustV2ViaProposal, fundOpsTrustV2NoProposal } from './ops-trust-v2-proposal';
import { fundSafetyModuleRecoveryNoProposal, fundSafetyModuleRecoveryViaProposal } from './safety-module-compensation';
import { executeSafetyModuleUpgradeNoProposal, executeSafetyModuleUpgradeViaProposal } from './safety-module-fix';
import { executeStarkProxyUpgradeNoProposal, executeStarkProxyUpgradeViaProposal } from './stark-proxy-fix';
import { updateMerkleDistributorRewardsParametersDIP24NoProposal, updateMerkleDistributorRewardsParametersDIP24ViaProposal } from './update-merkle-distributor-rewards-parameters-dip24';
import { updateMerkleDistributorRewardsParametersViaProposal, updateMerkleDistributorRewardsParametersNoProposal } from './update-merkle-distributor-rewards-parameters-proposal';
import { updateMerkleDistributorRewardsParametersV2ViaProposal, updateMerkleDistributorRewardsParametersV2NoProposal } from './update-merkle-distributor-rewards-parameters-v2-proposal';
import { executeV3DataAvailabilityViaProposal, executeV3DataAvailabilityNoProposal } from './v3-data-availability-proposal';
import { executeWindDownBorrowingPoolNoProposal, executeWindDownBorrowingPoolViaProposal } from './wind-down-borrowing-pool';
import { executeWindDownSafetyModuleNoProposal, executeWindDownSafetyModuleViaProposal } from './wind-down-safety-module';
import { executeUpgradeGovernanceStrategyV2NoProposal, executeUpgradeGovernanceStrategyV2ViaProposal } from './upgrade-governance-strategy-v2';
import { deployUpgradeGovernanceStrategyV2Contracts } from '../../src/migrations/deploy-upgrade-governance-strategy-v2-contracts';
import { deployTreasuryBridgeContracts } from '../../src/migrations/deploy-treasury-bridge-contracts';
import { executeTreasuryBridgeNoProposal, executeTreasuryBridgeViaProposal } from './treasury-bridge-proposal';


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
    starkwarePriorityAddress: phase1Contracts.starkwarePriorityTimelock.address,
  });

  // Phase 3: Finalize the deployment w/ actions that cannot be reversed without governance action.
  await deployPhase3({
    // Phase 1 deployed contracts.
    dydxTokenAddress: phase1Contracts.dydxToken.address,
    governorAddress: phase1Contracts.governor.address,
    shortTimelockAddress: phase1Contracts.shortTimelock.address,
    longTimelockAddress: phase1Contracts.longTimelock.address,
    starkwarePriorityAddress: phase1Contracts.starkwarePriorityTimelock.address,

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


  const upgradeGovernanceStrategyV2Contracts = await deployUpgradeGovernanceStrategyV2Contracts({
      dydxTokenAddress: phase1Contracts.dydxToken.address,
      safetyModuleAddress: phase2Contracts.safetyModule.address,
  });

  const treasuryBridgeContracts = await deployTreasuryBridgeContracts({
    wrappedDydxTokenAddress: upgradeGovernanceStrategyV2Contracts.wrappedDydxToken.address,
    rewardsTreasuryVesterAddress: phase2Contracts.rewardsTreasuryVester.address,
    communityTreasuryVesterAddress: phase2Contracts.communityTreasuryVester.address,
  })

  return {
    ...phase1Contracts,
    ...phase2Contracts,
    ...smRecoveryContracts,
    ...starkProxyRecoveryContracts,
    ...upgradeGovernanceStrategyV2Contracts,
    ...treasuryBridgeContracts,
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
  const deployConfig = getDeployConfig();
  if (config.TEST_FUND_GRANTS_PROGRAM_WITH_PROPOSAL) {
    await fundGrantsProgramViaProposal({
      dydxTokenAddress: deployedContracts.dydxToken.address,
      governorAddress: deployedContracts.governor.address,
      shortTimelockAddress: deployedContracts.shortTimelock.address,
      communityTreasuryAddress: deployedContracts.communityTreasury.address,
      dgpMultisigAddress: deployConfig.DGP_MULTISIG_ADDRESS,
    });
  } else {
    await fundGrantsProgramNoProposal({
      dydxTokenAddress: deployedContracts.dydxToken.address,
      shortTimelockAddress: deployedContracts.shortTimelock.address,
      communityTreasuryAddress: deployedContracts.communityTreasury.address,
      dgpMultisigAddress: deployConfig.DGP_MULTISIG_ADDRESS,
    });
  }
}

export async function executeGrantsProgramv15ProposalForTest(
  deployedContracts: AllDeployedContracts,
) {
  const deployConfig = getDeployConfig();
  if (config.TEST_FUND_GRANTS_PROGRAM_v1_5_WITH_PROPOSAL) {
    await fundGrantsProgramV15ViaProposal({
      dydxTokenAddress: deployedContracts.dydxToken.address,
      governorAddress: deployedContracts.governor.address,
      shortTimelockAddress: deployedContracts.shortTimelock.address,
      communityTreasuryAddress: deployedContracts.communityTreasury.address,
      dgpMultisigAddress: deployConfig.DGP_MULTISIG_ADDRESS,
    });
  } else {
    await fundGrantsProgramV15NoProposal({
      dydxTokenAddress: deployedContracts.dydxToken.address,
      shortTimelockAddress: deployedContracts.shortTimelock.address,
      communityTreasuryAddress: deployedContracts.communityTreasury.address,
      dgpMultisigAddress: deployConfig.DGP_MULTISIG_ADDRESS,
    });
  }
}

export async function executeWindDownBorrowingPoolProposalForTest(
  deployedContracts: AllDeployedContracts,
) {
  if (config.WIND_DOWN_BORROWING_POOL_WITH_PROPOSAL) {
    await executeWindDownBorrowingPoolViaProposal({
      dydxTokenAddress: deployedContracts.dydxToken.address,
      governorAddress: deployedContracts.governor.address,
      shortTimelockAddress: deployedContracts.shortTimelock.address,
      liquidityModuleAddress: deployedContracts.liquidityStaking.address,
    });
  } else {
    await executeWindDownBorrowingPoolNoProposal({
      shortTimelockAddress: deployedContracts.shortTimelock.address,
      liquidityModuleAddress: deployedContracts.liquidityStaking.address,
    });
  }
}

export async function executeWindDownSafetyModuleProposalForTest(
  deployedContracts: AllDeployedContracts,
) {
  if (config.TEST_WIND_DOWN_SAFETY_MODULE_WITH_PROPOSAL) {
    await executeWindDownSafetyModuleViaProposal({
      dydxTokenAddress: deployedContracts.dydxToken.address,
      governorAddress: deployedContracts.governor.address,
      shortTimelockAddress: deployedContracts.shortTimelock.address,
      safetyModuleAddress: deployedContracts.safetyModule.address,
    });
  } else {
    await executeWindDownSafetyModuleNoProposal({
      shortTimelockAddress: deployedContracts.shortTimelock.address,
      safetyModuleAddress: deployedContracts.safetyModule.address,
    });
  }
}


export async function executeUpdateMerkleDistributorRewardsParametersProposalForTest(
  deployedContracts: AllDeployedContracts,
) {
  if (config.TEST_UPDATE_MERKLE_DISTRIBUTOR_REWARDS_PARAMETERS_WITH_PROPOSAL) {
    await updateMerkleDistributorRewardsParametersViaProposal({
      dydxTokenAddress: deployedContracts.dydxToken.address,
      governorAddress: deployedContracts.governor.address,
      merkleDistributorAddress: deployedContracts.merkleDistributor.address,
      shortTimelockAddress: deployedContracts.shortTimelock.address,
    });
  } else {
    await updateMerkleDistributorRewardsParametersNoProposal({
      merkleDistributorAddress: deployedContracts.merkleDistributor.address,
      shortTimelockAddress: deployedContracts.shortTimelock.address,
    });
  }
}

export async function executeOpsTrustProposalForTest(
  deployedContracts: AllDeployedContracts,
) {
  const deployConfig = getDeployConfig();
  if (config.TEST_FUND_OPS_TRUST_WITH_PROPOSAL) {
    await fundOpsTrustViaProposal({
      dydxTokenAddress: deployedContracts.dydxToken.address,
      governorAddress: deployedContracts.governor.address,
      shortTimelockAddress: deployedContracts.shortTimelock.address,
      communityTreasuryAddress: deployedContracts.communityTreasury.address,
      dotMultisigAddress: deployConfig.DOT_MULTISIG_ADDRESS,
    });
  } else {
    await fundOpsTrustNoProposal({
      dydxTokenAddress: deployedContracts.dydxToken.address,
      shortTimelockAddress: deployedContracts.shortTimelock.address,
      communityTreasuryAddress: deployedContracts.communityTreasury.address,
      dotMultisigAddress: deployConfig.DOT_MULTISIG_ADDRESS,
    });
  }
}

export async function executeUpdateMerkleDistributorRewardsParametersV2ProposalForTest(
  deployedContracts: AllDeployedContracts,
) {
  if (config.TEST_UPDATE_MERKLE_DISTRIBUTOR_REWARDS_PARAMETERS_v2_WITH_PROPOSAL) {
    await updateMerkleDistributorRewardsParametersV2ViaProposal({
      dydxTokenAddress: deployedContracts.dydxToken.address,
      governorAddress: deployedContracts.governor.address,
      merkleDistributorAddress: deployedContracts.merkleDistributor.address,
      shortTimelockAddress: deployedContracts.shortTimelock.address,
    });
  } else {
    await updateMerkleDistributorRewardsParametersV2NoProposal({
      merkleDistributorAddress: deployedContracts.merkleDistributor.address,
      shortTimelockAddress: deployedContracts.shortTimelock.address,
    });
  }
}

export async function executeV3DataAvailabilityProposalForTest(
  deployedContracts: AllDeployedContracts,
) {
  if (config.TEST_V3_DATA_AVAILABILITY_WITH_PROPOSAL) {
    await executeV3DataAvailabilityViaProposal({
      dydxTokenAddress: deployedContracts.dydxToken.address,
      governorAddress: deployedContracts.governor.address,
      starkwarePriorityAddress: deployedContracts.starkwarePriorityTimelock.address,
      starkPerpetualAddress: deployedContracts.starkPerpetual.address,
    });
  } else {
    await executeV3DataAvailabilityNoProposal({
      starkwarePriorityAddress: deployedContracts.starkwarePriorityTimelock.address,
      starkPerpetualAddress: deployedContracts.starkPerpetual.address,
    });
  }
}

export async function executeOpsTrustV2ProposalForTest(
  deployedContracts: AllDeployedContracts,
) {
  const deployConfig = getDeployConfig();
  if (config.TEST_FUND_OPS_TRUST_v2_WITH_PROPOSAL) {
    await fundOpsTrustV2ViaProposal({
      dydxTokenAddress: deployedContracts.dydxToken.address,
      governorAddress: deployedContracts.governor.address,
      shortTimelockAddress: deployedContracts.shortTimelock.address,
      communityTreasuryAddress: deployedContracts.communityTreasury.address,
      dotMultisigAddress: deployConfig.DOT_MULTISIG_ADDRESS,
    });
  } else {
    await fundOpsTrustV2NoProposal({
      dydxTokenAddress: deployedContracts.dydxToken.address,
      shortTimelockAddress: deployedContracts.shortTimelock.address,
      communityTreasuryAddress: deployedContracts.communityTreasury.address,
      dotMultisigAddress: deployConfig.DOT_MULTISIG_ADDRESS,
    });
  }
}

export async function executeUpdateMerkleDistributorRewardsParametersDIP24ProposalForTest(
  deployedContracts: AllDeployedContracts,
) {
  if (config.TEST_UPDATE_MERKLE_DISTRIBUTOR_REWARDS_PARAMETERS_DIP24_WITH_PROPOSAL) {
    await updateMerkleDistributorRewardsParametersDIP24ViaProposal({
      dydxTokenAddress: deployedContracts.dydxToken.address,
      governorAddress: deployedContracts.governor.address,
      merkleDistributorAddress: deployedContracts.merkleDistributor.address,
      shortTimelockAddress: deployedContracts.shortTimelock.address,
    });
  } else {
    await updateMerkleDistributorRewardsParametersDIP24NoProposal({
      merkleDistributorAddress: deployedContracts.merkleDistributor.address,
      shortTimelockAddress: deployedContracts.shortTimelock.address,
    });
  }
}
export async function executeUpgradeGovernanceStrategyV2ProposalForTest(
  deployedContracts: AllDeployedContracts,
) {
    if (config.TEST_UPGRADE_GOVERNANCE_STRATEGY_WITH_PROPOSAL) {
      await executeUpgradeGovernanceStrategyV2ViaProposal({
        dydxTokenAddress: deployedContracts.dydxToken.address,
        governorAddress: deployedContracts.governor.address,
        governanceStrategyV2Address: deployedContracts.governanceStrategyV2.address,
        longTimelockAddress: deployedContracts.longTimelock.address,
    });
  } else {
      await executeUpgradeGovernanceStrategyV2NoProposal({
        governorAddress: deployedContracts.governor.address,
        governanceStrategyV2Address: deployedContracts.governanceStrategyV2.address,
        longTimelockAddress: deployedContracts.longTimelock.address,
    });
  }
}

export async function executeTreasuryBridgeProposalForTest(
  deployedContracts: AllDeployedContracts,
  ) {
  if (config.TEST_TREASURY_BRIDGE_WITH_PROPOSAL) {
    await executeTreasuryBridgeViaProposal({
      dydxTokenAddress: deployedContracts.dydxToken.address,
      wrappedDydxTokenAddress: deployedContracts.wrappedDydxToken.address,
      governorAddress: deployedContracts.governor.address,
      shortTimelockAddress: deployedContracts.shortTimelock.address,
      rewardsTreasuryAddress: deployedContracts.rewardsTreasury.address,
      communityTreasuryAddress: deployedContracts.communityTreasury.address,
      rewardsTreasuryProxyAdminAddress: deployedContracts.rewardsTreasuryProxyAdmin.address,
      communityTreasuryProxyAdminAddress: deployedContracts.communityTreasuryProxyAdmin.address,
      rewardsTreasuryVesterAddress: deployedContracts.rewardsTreasuryVester.address,
      communityTreasuryVesterAddress: deployedContracts.communityTreasuryVester.address,
      rewardsTreasuryBridgeAddress: deployedContracts.rewardsTreasuryBridge.address,
      communityTreasuryBridgeAddress: deployedContracts.communityTreasuryBridge.address,
    });
  } else {
    await executeTreasuryBridgeNoProposal({
      governorAddress: deployedContracts.governor.address,
      shortTimelockAddress: deployedContracts.shortTimelock.address,
      rewardsTreasuryAddress: deployedContracts.rewardsTreasury.address,
      communityTreasuryAddress: deployedContracts.communityTreasury.address,
      rewardsTreasuryProxyAdminAddress: deployedContracts.rewardsTreasuryProxyAdmin.address,
      communityTreasuryProxyAdminAddress: deployedContracts.communityTreasuryProxyAdmin.address,
      rewardsTreasuryBridgeAddress: deployedContracts.rewardsTreasuryBridge.address,
      communityTreasuryBridgeAddress: deployedContracts.communityTreasuryBridge.address,
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

  // Advance to the next epoch start, to ensure we don't begin the tests in a blackout window.
  const nextEpochStart = (
    await latestBlockTimestamp() +
    Number(await deployedContracts.safetyModule.getTimeRemainingInCurrentEpoch())
  );
  await incrementTimeToTimestamp(nextEpochStart);
}
