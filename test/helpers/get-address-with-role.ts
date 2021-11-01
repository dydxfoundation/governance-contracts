import _ from 'lodash';

import { getRole } from '../../src/lib/util';
import { Role } from '../../src/types';
import { StarkProxyV1 } from '../../types/StarkProxyV1';

export async function findAddressesWithRole(
  starkProxy: StarkProxyV1,
  role: Role,
): Promise<string> {
  const roleHash = getRole(role);
  const roleGrantedEvents = await starkProxy.queryFilter(
    starkProxy.filters.RoleGranted(roleHash, null, null),
  );

  const owners: string[] = _.uniq(_.map(roleGrantedEvents, 'args.account'));
  const roleOwners = (await Promise.all(
    owners.map(
      async (account: string): Promise<string> => {
        const hasRole: boolean = await starkProxy.hasRole(roleHash, account);
        return hasRole ? account : '';
      },
    ),
  )).filter((account: string | boolean) => !!account);
  if (!roleOwners.length) {
    throw new Error(`StarkProxy has no accounts that own role ${role.toString()}`);
  }

  return roleOwners[0];
}
