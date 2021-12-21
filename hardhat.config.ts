import fs from 'fs';
import path from 'path';

import * as dotenv from 'dotenv';
import { HardhatUserConfig } from 'hardhat/config';
import {
  HardhatNetworkUserConfig,
  HttpNetworkUserConfig,
} from 'hardhat/types';

import config from './src/config';
import { NetworkName } from './src/types';

import '@typechain/hardhat';
import '@nomiclabs/hardhat-ethers';
import '@nomiclabs/hardhat-waffle';
import 'solidity-coverage';
import 'hardhat-abi-exporter';

dotenv.config();

// Should be set when running hardhat compile or hardhat typechain.
const SKIP_LOAD = process.env.SKIP_LOAD === 'true';

// Testnet and mainnet configuration.
const ALCHEMY_KEY = process.env.ALCHEMY_KEY || '';
const MNEMONIC = process.env.MNEMONIC || '';
const MNEMONIC_PATH = "m/44'/60'/0'/0";
const HARDHAT_PRIVATE_KEY = process.env.HARDHAT_PRIVATE_KEY || '';

// Load hardhat tasks.
if (!SKIP_LOAD) {
  console.log('Loading scripts...');
  const tasksDir = path.join(__dirname, 'tasks');
  const tasksDirs = fs.readdirSync(tasksDir);
  tasksDirs.forEach((dirName) => {
    const tasksDirPath = path.join(tasksDir, dirName);
    const tasksFiles = fs.readdirSync(tasksDirPath);
    tasksFiles.forEach((fileName) => {
      const tasksFilePath = path.join(tasksDirPath, fileName);
      /* eslint-disable-next-line global-require */
      require(tasksFilePath);
    });
  });
}

function getRemoteNetworkConfig(
  networkName: NetworkName,
  networkId: number,
): HttpNetworkUserConfig {
  let accounts;
  if (MNEMONIC) {
    accounts = {
      mnemonic: MNEMONIC,
      path: MNEMONIC_PATH,
      initialIndex: 0,
      count: 10,
    };
  } else if (HARDHAT_PRIVATE_KEY) {
    accounts = [HARDHAT_PRIVATE_KEY];
  } else {
    throw new Error(
      'hardhat.config.ts: Network requires either MNEMONIC or HARDHAT_PRIVATE_KEY ' +
      'to be specified',
    );
  }
  return {
    url: `https://eth-${networkName}.alchemyapi.io/v2/${ALCHEMY_KEY}`,
    chainId: networkId,
    accounts,
  };
}

function getHardhatConfig(): HardhatNetworkUserConfig {
  const networkConfig: HardhatNetworkUserConfig = {
    hardfork: 'berlin',
    blockGasLimit: 15000000,
    chainId: 31337,
    throwOnTransactionFailures: true,
    throwOnCallFailures: true,
  };

  if (config.FORK_MAINNET) {
    networkConfig.forking = {
      url: `https://eth-mainnet.alchemyapi.io/v2/${ALCHEMY_KEY}`,
      blockNumber: config.FORK_BLOCK_NUMBER,
    };
  }

  return networkConfig;
}

const hardhatConfig: HardhatUserConfig = {
  solidity: {
    compilers: [
      {
        version: '0.7.5',
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
          evmVersion: 'berlin',
        },
      },
    ],
  },
  typechain: {
    outDir: 'types',
    target: 'ethers-v5',
    alwaysGenerateOverloads: false,
  },
  mocha: {
    timeout: 0,
  },
  networks: {
    kovan: getRemoteNetworkConfig(NetworkName.kovan, 42),
    ropsten: getRemoteNetworkConfig(NetworkName.ropsten, 3),
    mainnet: getRemoteNetworkConfig(NetworkName.mainnet, 1),
    hardhat: getHardhatConfig(),
  },
  abiExporter: {
    clear: true,
  },
};

export default hardhatConfig;
