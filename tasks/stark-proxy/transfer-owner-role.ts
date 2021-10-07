import { types } from 'hardhat/config';

import { hardhatTask } from '../../src/hre';
import { transferOwnerRole } from '../../src/migrations/transfer-owner-role';

hardhatTask('transfer-owner-role', 'Transfer OWNER_ROLE on a stark proxy to a new address, while revoking deployer ownership.')
  .addParam('starkProxyAddress', 'Stark proxy to change role permissions of', undefined, types.string)
  .addParam('newOwnerRoleAddress', 'Address to grant OWNER_ROLE to', undefined, types.string)
  .setAction(async (args) => {
    await transferOwnerRole(args);
  });
