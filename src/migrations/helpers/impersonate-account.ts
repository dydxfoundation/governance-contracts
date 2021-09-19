import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';

import { getHre } from '../../hre';

export const IMPERSONATED_ACCOUNT_STIPEND = '0x1000000000000000';

export async function fundAccount(
  address: string,
): Promise<void> {
  const [firstSigner] = await getHre().ethers.getSigners();
  await firstSigner.sendTransaction({
    to: address,
    value: IMPERSONATED_ACCOUNT_STIPEND,
  });
}

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
  await fundAccount(address);
  return impersonateAccount(address);
}
