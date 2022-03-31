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
  dydxCollateralTokenAddress,
  liquidityStakingAddress,
  merkleDistributorAddress,
  merkleTimelockAddress,
  shortTimelockAddress,
  starkPerpetualAddress,

  borrowerAddress,
  onlyDeployStarkProxyV3Impl,
}: {
  dydxCollateralTokenAddress: string,
  liquidityStakingAddress: string,
  merkleDistributorAddress: string,
  merkleTimelockAddress: string,
  shortTimelockAddress: string,
  starkPerpetualAddress: string,

  borrowerAddress: string,
  onlyDeployStarkProxyV3Impl?: boolean
}) {
  const deployer = await getDeployerSigner();
  const deployerAddress = deployer.address;
  log(`Beginning Stark Proxy V3 deployment with deployer ${deployerAddress}\n`);

  log('Step 1. Deploy StarkProxyV3 implementation contract.');
  const starkProxyV3Impl: StarkProxyV3 = await new StarkProxyV3__factory(deployer).deploy(
    liquidityStakingAddress,
    starkPerpetualAddress,
    dydxCollateralTokenAddress,
    merkleDistributorAddress,
  );
  await waitForTx(starkProxyV3Impl.deployTransaction);

  log(`starkProxyV3 implementation contract deployed: ${starkProxyV3Impl.address}.`);
  log('Step 1 done.\n');
  if (onlyDeployStarkProxyV3Impl) {
    log('Early return: only deploying starkProxyV3 implementation contract.');
    return {
      starkProxyV3Impl,
    };
  }

  const starkProxyV3ImplAddress: string = starkProxyV3Impl.address;

  log('Step 2. Deploy new StarkProxyV1 (proxy + implementation + admin) contract. Implementation contract ignored.');
  const [starkProxyContract, , starkProxyProxyAdmin] = await deployUpgradeable(
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

  log(`StarkProxy proxy contract deployed: ${starkProxyContract.address}.`);
  log(`StarkProxy proxy admin contract deployed: ${starkProxyProxyAdmin.address}.`);
  log('Step 2 done.\n');

  log('Step 3. Upgrade StarkProxyV1 contract to use StarkProxyV3 implementation contract.');
  const initializeCalldata = new Interface(StarkProxyV3__factory.abi).encodeFunctionData(
    'initialize',
    [],
  );

  await waitForTx(
    await starkProxyProxyAdmin.upgradeAndCall(
      starkProxyContract.address,
      starkProxyV3ImplAddress,
      initializeCalldata,
    ),
  );
  log('Step 3 done.\n');

  log(`Step 4. Grant GUARDIAN_ROLE to short timelock, VETO_GUARDIAN_ROLE to Merkle timelock, and all other roles to borrower ${borrowerAddress}.`);
  // taken from Step 22 of phase-2
  const grantTxns = await Promise.all([
    starkProxyContract.grantRole(getRole(Role.GUARDIAN_ROLE), shortTimelockAddress),
    starkProxyContract.grantRole(getRole(Role.VETO_GUARDIAN_ROLE), merkleTimelockAddress),
    starkProxyContract.grantRole(getRole(Role.OWNER_ROLE), borrowerAddress),
    starkProxyContract.grantRole(getRole(Role.DELEGATION_ADMIN_ROLE), borrowerAddress),
    starkProxyContract.grantRole(getRole(Role.WITHDRAWAL_OPERATOR_ROLE), borrowerAddress),
    starkProxyContract.grantRole(getRole(Role.BORROWER_ROLE), borrowerAddress),
    starkProxyContract.grantRole(getRole(Role.EXCHANGE_OPERATOR_ROLE), borrowerAddress),
  ]);
  await Promise.all(grantTxns.map((txn) => waitForTx(txn)));
  log('Step 4 done.\n');

  log('Step 5. Revoke all roles for the deployer address on the StarkProxy contract.');
  // taken from step 15 of phase-3
  const revokeTxns = await Promise.all([
    await starkProxyContract.revokeRole(getRole(Role.DELEGATION_ADMIN_ROLE), deployerAddress),
    await starkProxyContract.revokeRole(getRole(Role.OWNER_ROLE), deployerAddress),
    await starkProxyContract.revokeRole(getRole(Role.GUARDIAN_ROLE), deployerAddress),
  ]);
  await Promise.all(revokeTxns.map((txn) => waitForTx(txn)));
  log('Step 5 done.\n');

  log('Step 6. Transfer Stark Proxy Admin ownership to short timelock.');
  // Taken from step 4-8 of phase-3
  await waitForTx(await starkProxyProxyAdmin.transferOwnership(shortTimelockAddress));
  log('Step 6 done.\n');

  log(`starkProxy proxy contract address: ${starkProxyContract.address}.`);
  log('\n=== NEW STARK PROXY IMPLEMENTATION DEPLOYMENT COMPLETE ===\n');

  return {
    starkProxyContract,
    starkProxyProxyAdmin,
    starkProxyV3Impl,
  };
}
