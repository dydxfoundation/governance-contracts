import { Interface } from 'ethers/lib/utils';

import {
  StarkProxyV1__factory,
  StarkProxyV3,
  StarkProxyV3__factory,
} from '../../types';
import { getDeployerSigner } from '../deploy-config/get-deployer-address';
import { log } from '../lib/logging';
import { getRole, waitForTx } from '../lib/util';
import { Role } from '../types';
import { deployUpgradeable } from './helpers/deploy-upgradeable';

export async function deployStarkProxyV3({
  liquidityStakingAddress,
  merkleDistributorAddress,
  starkPerpetualAddress,
  dydxCollateralTokenAddress,
  ownerRoleAddress,
}: {
  liquidityStakingAddress: string,
  merkleDistributorAddress: string,
  starkPerpetualAddress: string,
  dydxCollateralTokenAddress: string,
  ownerRoleAddress?: string
}) {
  log('Beginning Stark Proxy V3 implementation deployment\n');
  const deployer = await getDeployerSigner();
  const deployerAddress = deployer.address;
  log(`Beginning deployment with deployer ${deployerAddress}\n`);

  log('Step 1. Deploy new StarkProxyV1 implementation contract.');
  const [starkProxyV1, , starkProxyProxyAdmin] = await deployUpgradeable(
    StarkProxyV1__factory,
    deployer,
    [
      liquidityStakingAddress,
      starkPerpetualAddress,
      dydxCollateralTokenAddress,
      merkleDistributorAddress,
    ],
    [deployerAddress],
  );

  log('Step 2. Deploy new StarkProxyV3 implementation contract.');
  const starkProxyV3: StarkProxyV3 = await new StarkProxyV3__factory(deployer).deploy(
    liquidityStakingAddress,
    starkPerpetualAddress,
    dydxCollateralTokenAddress,
    merkleDistributorAddress,
  );
  await waitForTx(starkProxyV3.deployTransaction);

  log('Step 3. Upgrade StarkProxyV1 contract with StarkProxyV3 contract.');
  const initializeCalldata = new Interface(StarkProxyV3__factory.abi).encodeFunctionData(
    'initialize',
    [],
  );

  await waitForTx(
    await starkProxyProxyAdmin.upgradeAndCall(
      starkProxyV1.address,
      starkProxyV3.address,
      initializeCalldata,
    ),
  );

  if (ownerRoleAddress !== undefined) {
    log(`Step 4. Set OWNER_ROLE to address ${ownerRoleAddress}`);
    await waitForTx(
      await starkProxyV1.grantRole(
        getRole(Role.OWNER_ROLE),
        ownerRoleAddress,
      ),
    );
  }

  log(`starkProxy contract address: ${starkProxyV1.address}`);
  log('\n=== NEW STARK PROXY IMPLEMENTATION DEPLOYMENT COMPLETE ===\n');

  return {
    starkProxyV1WithV3Impl: starkProxyV1,
  };
}
