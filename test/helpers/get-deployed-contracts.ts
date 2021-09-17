import {
  DeployedContracts,
  deployContracts,
} from '../../src/deployment/deploy-contracts';

let deployedContracts: DeployedContracts;

/**
 * Helper to make sure contracts are only deployed once.
 */
export async function getDeployedContracts(): Promise<DeployedContracts> {
  if (!deployedContracts) {
    deployedContracts = await deployContracts();
  }
  return deployedContracts;
}
