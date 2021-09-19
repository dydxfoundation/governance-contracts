import {
  DeployedContracts,
  deployContractsForTest,
} from '../migrations/deploy-contracts-for-test';

let deployedContracts: DeployedContracts;

/**
 * Helper to make sure contracts are only deployed once.
 */
export async function getDeployedContractsForTest(): Promise<DeployedContracts> {
  if (!deployedContracts) {
    deployedContracts = await deployContractsForTest();
  }
  return deployedContracts;
}
