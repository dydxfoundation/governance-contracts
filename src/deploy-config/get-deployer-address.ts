/**
 * Get the deployer address that was used for the deployment on a given network.
 */

import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';

import config from '../config';
import { getHre, getNetworkName } from '../hre';
import { impersonateAndFundAccount } from '../migrations/helpers/impersonate-account';

const MAINNET_DEPLOYER_ADDRESS = '0x301DF37d653b281AF83a1DDf4464eF21A622eC83';

export async function getDeployerSigner(): Promise<SignerWithAddress> {
  const hre = getHre();
  if (config.isHardhat()) {
    if (config.FORK_MAINNET) {
      return impersonateAndFundAccount(MAINNET_DEPLOYER_ADDRESS);
    } else {
      const accounts = await hre.ethers.getSigners();
      return accounts[0];
    }
  } else if (config.isMainnet()) {
    // Return default signer.
    return hre.ethers.getSigner(MAINNET_DEPLOYER_ADDRESS);
  } else {
    throw new Error(`Deployer address not known for network ${getNetworkName()}`);
  }
}
