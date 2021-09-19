import { BigNumberish } from 'ethers';
import { formatEther } from 'ethers/lib/utils';

import { DydxToken } from '../../../types';
import { getHre } from '../../hre';

export async function expectDeployerBalance(
  dydxToken: DydxToken,
  expectedBalance: BigNumberish,
): Promise<void> {
  const [deployer] = await getHre().ethers.getSigners();
  const actualBalance = await dydxToken.balanceOf(deployer.address);

  if (!actualBalance.eq(expectedBalance)) {
    throw new Error(
      `Expected deployer to have a balance of ${formatEther(expectedBalance)} DYDX ` +
      `but actual balance was ${formatEther(actualBalance)} DYDX`,
    );
  }
}
