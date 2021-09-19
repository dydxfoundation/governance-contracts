import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';

import { getHre } from '../../hre';

const IMPERSONATED_ACCOUNT_STIPEND = '0x1000000000000000';

export async function impersonateAccount(
  address: string,
): Promise<SignerWithAddress> {
  await getHre().network.provider.request({
    method: 'hardhat_impersonateAccount',
    params: [address],
  });
  return getHre().ethers.getSigner(address);
}

export async function impersonateAndFundAccount(
  address: string,
): Promise<SignerWithAddress> {
  const [deployer] = await getHre().ethers.getSigners();
  await deployer.sendTransaction({
    to: address,
    value: IMPERSONATED_ACCOUNT_STIPEND,
  });
  return impersonateAccount(address);
}
