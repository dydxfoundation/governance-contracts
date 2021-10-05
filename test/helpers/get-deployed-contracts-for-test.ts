import config from '../../src/config';
import { getDeployedContracts } from '../../src/migrations/helpers/get-deployed-contracts';
import { DeployedContracts, UnwrapPromise } from '../../src/types';
import {
  applySafetyModuleRecoveryForTest,
  configureForTest,
  deployContractsForTest,
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

  let partialDeployedContracts: UnwrapPromise<ReturnType<typeof deployContractsForTest>>;
  if (config.FORK_MAINNET) {
    partialDeployedContracts = await getDeployedContracts();
  } else {
    partialDeployedContracts = await deployContractsForTest();
  }

  const smRecoveryContracts = await applySafetyModuleRecoveryForTest(partialDeployedContracts);
  const deployedContracts: DeployedContracts = {
    ...partialDeployedContracts,
    ...smRecoveryContracts,
  };
  await configureForTest(deployedContracts);

  return deployedContracts;
}
