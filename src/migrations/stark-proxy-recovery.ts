import {
  StarkProxyV2,
  StarkProxyV2__factory,
} from '../../types';
import { getDeployConfig } from '../deploy-config';
import { getDeployerSigner } from '../deploy-config/get-deployer-address';
import { log } from '../lib/logging';
import { waitForTx } from '../lib/util';

export async function deployStarkProxyRecovery({
  startStep = 0,
  liquidityStakingAddress,
  merkleDistributorAddress,
  numStarkProxiesToDeploy,

  starkProxyNewImplAddresses,
}: {
  startStep?: number,

  liquidityStakingAddress: string,
  merkleDistributorAddress: string,
  numStarkProxiesToDeploy: number,

  starkProxyNewImplAddresses?: string[],
}) {
  log('Beginning stark proxy implementation deployment\n');
  const deployConfig = getDeployConfig();
  const deployer = await getDeployerSigner();
  const deployerAddress = deployer.address;
  log(`Beginning deployment with deployer ${deployerAddress}\n`);

  let starkProxyNewImpls: StarkProxyV2[] = [];

  if (startStep <= 1) {
    log('Step 1. Deploy new stark proxy implementation contracts.');
    for (let i = 0; i < numStarkProxiesToDeploy; i++) {
      const starkProxyNewImpl = await new StarkProxyV2__factory(deployer).deploy(
        liquidityStakingAddress,
        deployConfig.STARK_PERPETUAL_ADDRESS,
        deployConfig.DYDX_COLLATERAL_TOKEN_ADDRESS,
        merkleDistributorAddress,
      );
      await waitForTx(starkProxyNewImpl.deployTransaction);
      starkProxyNewImpls.push(starkProxyNewImpl);
    }
    starkProxyNewImplAddresses = starkProxyNewImpls.map((sp) => sp.address);
  } else {
    if (!starkProxyNewImplAddresses || starkProxyNewImplAddresses.length !== numStarkProxiesToDeploy) {
      throw new Error(`Expected parameter starkProxyNewImplAddresses to be specified and have length ${numStarkProxiesToDeploy}.`);
    }
    starkProxyNewImpls = starkProxyNewImplAddresses.map((sp) => new StarkProxyV2__factory(deployer).attach(sp));
  }

  log('\n=== NEW STARK PROXY IMPLEMENTATIONS DEPLOYMENT COMPLETE ===\n');

  return {
    starkProxyNewImpls,
  };
}
