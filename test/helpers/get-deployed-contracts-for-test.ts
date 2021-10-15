import config from '../../src/config';
import { getDeployedContracts } from '../../src/migrations/helpers/get-deployed-contracts';
import { deploySafetyModuleRecovery } from '../../src/migrations/safety-module-recovery';
import { DeployedContracts } from '../../src/types';
import {
  configureForTest,
  deployContractsForTest,
  executeSafetyModuleRecoveryProposalsForTest,
} from '../migrations/deploy-contracts-for-test';

let globalDeployedContracts: DeployedContracts;
let globalDeployError: Error | null = null;

/**
 * Helper to get contracts depending on the network, and make sure contracts are only deployed once
 * when on the test network.
 */
export async function getDeployedContractsOnceForTest(): Promise<DeployedContracts> {
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

async function getDeployedContractsForTest(): Promise<DeployedContracts> {
  if (!config.isHardhat()) {
    return getDeployedContracts();
  }

  let deployedContracts: DeployedContracts;
  if (config.FORK_MAINNET) {
    deployedContracts = await getDeployedContracts();
  } else {
    deployedContracts = await deployContractsForTest();
  }

  await executeSafetyModuleRecoveryProposalsForTest(deployedContracts);
  await configureForTest(deployedContracts);
  return deployedContracts;
}
