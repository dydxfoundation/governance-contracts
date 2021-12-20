import config from '../../src/config';
import { getMainnetDeployedContracts } from '../../src/migrations/helpers/get-deployed-contracts';
import { AllDeployedContracts } from '../../src/types';
import {
  configureForTest,
  deployContractsForTest,
  executeSafetyModuleRecoveryProposalsForTest,
  executeStarkProxyProposalForTest,
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

    // Put proposals that have already been executed on mainnet here.
    await executeSafetyModuleRecoveryProposalsForTest(deployedContracts);
    await executeStarkProxyProposalForTest(deployedContracts);
  }

  // Put proposals that have not been executed on mainnet here.

  await configureForTest(deployedContracts);
  return deployedContracts;
}
