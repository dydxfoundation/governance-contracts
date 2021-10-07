import { id } from 'ethers/lib/utils';

import { StarkProxyV1__factory } from '../../types';
import { getDeployerSigner } from '../deploy-config/get-deployer-address';
import { log } from '../lib/logging';
import { promptYes } from '../lib/prompt';
import { waitForTx } from '../lib/util';

export async function transferOwnerRole({
  starkProxyAddress,
  newOwnerRoleAddress,
}: {
  starkProxyAddress: string,
  newOwnerRoleAddress: string,
}) {
  log(`*WARNING*: If you run this script and do not have ownership of address ${newOwnerRoleAddress}, you will not ` +
      `be able to perform actions that require OWNER_ROLE on stark proxy ${starkProxyAddress}.\n`);

  const deployer = await getDeployerSigner();
  const deployerAddress = deployer.address;
  const ownerRoleHash = id('OWNER_ROLE');
  const starkProxy = new StarkProxyV1__factory(deployer).attach(starkProxyAddress);
  const deployerHasOwnerRole: boolean = await starkProxy.hasRole(ownerRoleHash, deployerAddress);

  if (!deployerHasOwnerRole) {
    throw new Error(`Deployer ${deployerAddress} does not have OWNER_ROLE on stark proxy ${starkProxyAddress}.`);
  }

  await promptYes(`Grant OWNER_ROLE on stark proxy ${starkProxyAddress} to ${newOwnerRoleAddress} (type yes to continue)?`);
  await waitForTx(await starkProxy.grantRole(ownerRoleHash, newOwnerRoleAddress));

  const newAddressHasOwnerRole: boolean = await starkProxy.hasRole(ownerRoleHash, newOwnerRoleAddress);
  if (!newAddressHasOwnerRole) {
    throw new Error(`Failed to grant OWNER_ROLE on stark proxy ${starkProxyAddress} to ${newOwnerRoleAddress}.`);
  }
  log(`Granted OWNER_ROLE on stark proxy ${starkProxyAddress} to ${newOwnerRoleAddress}.\n`);

  await promptYes(`Revoke OWNER_ROLE on stark proxy ${starkProxyAddress} from ${deployerAddress} (type yes to continue)?`);
  await waitForTx(await starkProxy.revokeRole(ownerRoleHash, deployerAddress));

  const deployerHasOwnerRoleAfterRevoke: boolean = await starkProxy.hasRole(ownerRoleHash, deployerAddress);
  if (deployerHasOwnerRoleAfterRevoke) {
    throw new Error(`Failed to revoke OWNER_ROLE on stark proxy ${starkProxyAddress} from ${deployerAddress}.`);
  }
  log(`Revoked OWNER_ROLE on stark proxy ${starkProxyAddress} from ${deployerAddress}.`);
}
