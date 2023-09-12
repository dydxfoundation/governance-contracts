import {
    WrappedEthereumDydxToken,
    WrappedEthereumDydxToken__factory,
    GovernanceStrategyV2,
    GovernanceStrategyV2__factory,
} from '../../types';
import { getDeployerSigner } from '../deploy-config/get-deployer-address';
import { log } from '../lib/logging';
import { waitForTx } from '../lib/util';

export async function deployUpgradeGovernanceStrategyV2Contracts({
  startStep = 0,
  dydxTokenAddress,
  safetyModuleAddress,
  wrappedDydxTokenAddress,
  governanceStrategyV2Address,
}: {
  startStep?: number,
  dydxTokenAddress: string,
  safetyModuleAddress: string,

  wrappedDydxTokenAddress?: string,
  governanceStrategyV2Address?: string,
}) {
  log('Beginning upgrade governance strategy V2 contracts deployment\n');
  const deployer = await getDeployerSigner();
  const deployerAddress = deployer.address;
  log(`Beginning deployment with deployer ${deployerAddress}\n`);

  let wrappedDydxToken: WrappedEthereumDydxToken;
  let governanceStrategyV2: GovernanceStrategyV2;

  if (startStep <= 1) {
    log('Step 1. Deploy new wrapped DYDX token contract.');
    wrappedDydxToken = await new WrappedEthereumDydxToken__factory(deployer).deploy(
      dydxTokenAddress,
    );
    await waitForTx(wrappedDydxToken.deployTransaction);
    log('\n=== NEW WRAPPED DYDX TOKEN DEPLOYMENT COMPLETE ===\n');
  } else if (!wrappedDydxTokenAddress) {
    throw new Error('Expected parameter wrappedDydxTokenAddress to be specified.');
  } else {
    wrappedDydxToken = new WrappedEthereumDydxToken__factory(deployer).attach(wrappedDydxTokenAddress);
  }

  if (startStep <= 2) {
    log('Step 2. Deploy new governance strategy V2 contract.');
    governanceStrategyV2 = await new GovernanceStrategyV2__factory(deployer).deploy(
      dydxTokenAddress,
      safetyModuleAddress,
      wrappedDydxToken.address,
    );
    await waitForTx(governanceStrategyV2.deployTransaction);
    log('\n=== NEW GOVERNANCE STRATEGY V2 DEPLOYMENT COMPLETE ===\n');
  } else if (!governanceStrategyV2Address) {
    throw new Error('Expected parameter governanceStrategyV2Address to be specified.');
  } else {
    governanceStrategyV2 = new GovernanceStrategyV2__factory(deployer).attach(governanceStrategyV2Address);
  }

  return {
    wrappedDydxToken,
    governanceStrategyV2,
  };
}
