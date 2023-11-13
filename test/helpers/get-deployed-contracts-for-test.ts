import config from '../../src/config';
import { getMainnetDeployedContracts } from '../../src/migrations/helpers/get-deployed-contracts';
import { AllDeployedContracts } from '../../src/types';
import {
  configureForTest,
  deployContractsForTest,
  executeSafetyModuleRecoveryProposalsForTest,
  executeStarkProxyProposalForTest,
  executeGrantsProgramProposalForTest,
  executeGrantsProgramv15ProposalForTest,
  executeWindDownBorrowingPoolProposalForTest,
  executeUpdateMerkleDistributorRewardsParametersProposalForTest,
  executeWindDownSafetyModuleProposalForTest,
  executeOpsTrustProposalForTest,
  executeUpdateMerkleDistributorRewardsParametersV2ProposalForTest,
  executeV3DataAvailabilityProposalForTest,
  executeOpsTrustV2ProposalForTest,
  executeUpdateMerkleDistributorRewardsParametersDIP24ProposalForTest,
  executeUpgradeGovernanceStrategyV2ProposalForTest,
  executeTreasuryBridgeProposalForTest,
} from '../migrations/deploy-contracts-for-test';

let globalDeployedContracts: AllDeployedContracts;
let globalDeployError: Error | null = null;

/**
 * Helper to get contracts depending on the network, and make sure contracts are only deployed once
 * when on the test network.
 */
export async function getDeployedContractsOnceForTest(): Promise<AllDeployedContracts> {
  if (globalDeployError) {
    throw globalDeployError;
  }
  if (!globalDeployedContracts) {
    try {
      globalDeployedContracts = await getDeployedContractsForTest();
    } catch (error) {
      globalDeployError = error as Error;
      throw error;
    }
  }
  return globalDeployedContracts;
}

async function getAllContracts(): Promise<AllDeployedContracts> {
  return getMainnetDeployedContracts();
}

async function getDeployedContractsForTest(): Promise<AllDeployedContracts> {
  if (!config.isHardhat()) {
    return getAllContracts();
  }

  let deployedContracts: AllDeployedContracts;
  if (config.FORK_MAINNET) {
    deployedContracts = await getAllContracts();
  } else {
    deployedContracts = await deployContractsForTest();
    // Execute the proposals which have already been executed on mainnet.
    //
    // The proposals will be executed when running on a local test network,
    // but will not be executed when running on a mainnet fork.
    await executeSafetyModuleRecoveryProposalsForTest(deployedContracts);
    await executeStarkProxyProposalForTest(deployedContracts);
    await executeGrantsProgramProposalForTest(deployedContracts);
    await executeGrantsProgramv15ProposalForTest(deployedContracts);
    await executeWindDownBorrowingPoolProposalForTest(deployedContracts);
    await executeUpdateMerkleDistributorRewardsParametersProposalForTest(deployedContracts);
    await executeWindDownSafetyModuleProposalForTest(deployedContracts);
    await executeOpsTrustProposalForTest(deployedContracts);
    await executeUpdateMerkleDistributorRewardsParametersV2ProposalForTest(deployedContracts);
    await executeV3DataAvailabilityProposalForTest(deployedContracts);
    await executeOpsTrustV2ProposalForTest(deployedContracts);
    await executeUpdateMerkleDistributorRewardsParametersDIP24ProposalForTest(deployedContracts);
    await executeUpgradeGovernanceStrategyV2ProposalForTest(deployedContracts);
  }

  // Execute the proposals which have not yet been executed on mainnet.
  await executeTreasuryBridgeProposalForTest(deployedContracts);
  
  await configureForTest(deployedContracts);
  return deployedContracts;
}
