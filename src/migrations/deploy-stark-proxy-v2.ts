import {
  StarkProxyV2,
  StarkProxyV2__factory,
} from '../../types';
import { getDeployerSigner } from '../deploy-config/get-deployer-address';
import { log } from '../lib/logging';
import { waitForTx } from '../lib/util';

export async function deployStarkProxyV2({
  startStep = 0,
  liquidityStakingAddress,
  merkleDistributorAddress,
  starkPerpetualAddress,
  dydxCollateralTokenAddress,

  starkProxyNewImplAddress,
}: {
  startStep?: number,

  liquidityStakingAddress: string,
  merkleDistributorAddress: string,
  starkPerpetualAddress: string,
  dydxCollateralTokenAddress: string,

  starkProxyNewImplAddress?: string,
}) {
  log('Beginning stark proxy implementation deployment\n');
  const deployer = await getDeployerSigner();
  const deployerAddress = deployer.address;
  log(`Beginning deployment with deployer ${deployerAddress}\n`);

  let starkProxyNewImpl: StarkProxyV2;

  if (startStep <= 1) {
    log('Step 1. Deploy new stark proxy implementation contract.');
    starkProxyNewImpl = await new StarkProxyV2__factory(deployer).deploy(
      liquidityStakingAddress,
      starkPerpetualAddress,
      dydxCollateralTokenAddress,
      merkleDistributorAddress,
    );
    await waitForTx(starkProxyNewImpl.deployTransaction);
  } else {
    if (!starkProxyNewImplAddress) {
      throw new Error('Expected parameter starkProxyNewImplAddress to be specified.');
    }
    starkProxyNewImpl = new StarkProxyV2__factory(deployer).attach(starkProxyNewImplAddress);
  }

  log('\n=== NEW STARK PROXY IMPLEMENTATION DEPLOYMENT COMPLETE ===\n');

  return {
    starkProxyNewImpl,
  };
}
