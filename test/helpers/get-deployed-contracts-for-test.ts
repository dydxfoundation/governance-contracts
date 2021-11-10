import config from '../../src/config';
import { deployStarkProxyV2 } from '../../src/migrations/deploy-stark-proxy-v2';
import { getMainnetDeployedContracts } from '../../src/migrations/helpers/get-deployed-contracts';
import { AllDeployedContracts, MainnetDeployedContracts } from '../../src/types';
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
  const currentDeployedContracts: MainnetDeployedContracts = await getMainnetDeployedContracts();

  // Deploy contract for Stark Proxy recovery.
  const { starkProxyNewImpl } = await deployStarkProxyV2({
    liquidityStakingAddress: currentDeployedContracts.liquidityStaking.address,
    merkleDistributorAddress: currentDeployedContracts.merkleDistributor.address,
    starkPerpetualAddress: currentDeployedContracts.starkPerpetual.address,
    dydxCollateralTokenAddress: currentDeployedContracts.dydxCollateralToken.address,
  });

  return {
    ...currentDeployedContracts,
    starkProxyNewImpl,
  };
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
  }

  await executeSafetyModuleRecoveryProposalsForTest(deployedContracts);
  await executeStarkProxyProposalForTest(deployedContracts);
  await configureForTest(deployedContracts);
  return deployedContracts;
}
