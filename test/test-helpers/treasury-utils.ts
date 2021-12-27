import { BigNumber } from 'ethers';

import { TestEnv } from './make-suite';

export async function sendAllTokensToTreasury(
  testEnv: TestEnv,
): Promise<BigNumber> {
  const {
    deployer,
    dydxToken,
    rewardsTreasury,
  } = testEnv;
  const deployerBalance = await dydxToken.connect(deployer.signer).balanceOf(deployer.address);
  await dydxToken.connect(deployer.signer).transfer(rewardsTreasury.address, deployerBalance);
  return deployerBalance;
};
