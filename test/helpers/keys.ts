import _ from 'lodash';

import hre from '../hre';

const HARDHAT_MNEMONIC = 'test test test test test test test test test test test junk';

export function getUserKeys() {
  return _.range(1, 10).map(getKey);
}

function getKey(
  i: number,
): string {
  const wallet = hre.ethers.Wallet.fromMnemonic(HARDHAT_MNEMONIC, `m/44'/60'/0'/0/${i}`);
  return wallet.privateKey;
}
