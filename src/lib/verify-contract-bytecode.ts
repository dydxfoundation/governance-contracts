/* eslint-disable @typescript-eslint/no-var-requires */
/* eslint-disable global-require */
/* eslint-disable no-unexpected-multiline */

import path from 'path';

import {
  BigNumberish,
  utils,
} from 'ethers';
import _ from 'lodash';

import { getHre } from '../hre';
import { stripHexPrefix } from './hex';
import { log } from './logging';

interface ImmutableReference {
  length: number;
  start: number;
}

type Immutables = { [key: string]: BigNumberish };

const ARTIFACTS_DIR = '../../artifacts';

export async function verifyContract(
  contractPath: string,
  contractName: string,
  deployedAddress: string,
  immutableValues: Immutables = {},
): Promise<void> {
  const hre = getHre();

  // Load-in compiled JSON files.
  const solidityPath = path.join(contractPath, `${contractName}.sol`);
  const contractJson = require(path.join(ARTIFACTS_DIR, `${solidityPath}/${contractName}.json`));
  const dbgJson = require(path.join(ARTIFACTS_DIR, `${solidityPath}/${contractName}.dbg.json`));
  const buildInfoJson = require(path.join(ARTIFACTS_DIR, `build-info/${dbgJson.buildInfo.split('/').pop()}`));

  // Get the deployed and expected bytecodes.
  const deployedBytecodeString: string = await hre.ethers.provider.getCode(deployedAddress);
  const deployedBytecode: Buffer = Buffer.from(stripHexPrefix(deployedBytecodeString), 'hex');
  const expectedBytecode: Buffer = Buffer.from(stripHexPrefix(contractJson.deployedBytecode), 'hex');

  // Find information for immutable values in contract.
  const immutableReferences: { [immutableId: string]: ImmutableReference[] } = buildInfoJson
    .output
    .contracts
    [solidityPath]
    [contractName]
    .evm
    .deployedBytecode
    .immutableReferences;

  // For each immutable variable in the contract...
  Object.keys(immutableReferences).forEach((immutableId: string) => {
    // Find the key associated with this immutableId.
    // Find an object, `o`, at `sources.*.ast.nodes[*].nodes[*]` where `o.id == immutableId`.
    // Return `o.name` which is the name of the immutable variable in solidity.
    const immutableKey: string | undefined = _.chain(buildInfoJson.output.sources)
      .values()
      .map('ast.nodes')
      .filter() // remove any without `ast.nodes`
      .flatten()
      .map('nodes')
      .filter()
      .flatten()
      .find((o) => (
        o.mutability === 'immutable' &&
        typeof o.id === 'number' &&
        o.id.toString() === immutableId
      ))
      .value()
      ?.name;
    if (!immutableKey) {
      throw new Error(`cannot find key for immutableId: ${immutableId}`);
    }

    // Get expected value of the immutable.
    const immutableValue: BigNumberish | undefined = immutableValues[immutableKey];
    if (!immutableValue) {
      throw new Error(`did not pass-in value for immutableKey: ${immutableKey}`);
    }

    // Place the value of the immutable in the expectedBytecode.
    const bytecodeLocations: ImmutableReference[] = immutableReferences[immutableId];
    bytecodeLocations.forEach((loc) => {
      const expectedValueHex: string = utils.hexValue(immutableValue);
      const expectedValueHexPadded: string = utils.hexZeroPad(expectedValueHex, loc.length);
      const stringifiedValue: Buffer = Buffer.from(stripHexPrefix(expectedValueHexPadded), 'hex');
      for (let i = 0; i < loc.length; i += 1) {
        expectedBytecode[loc.start + i] = stringifiedValue[i];
      }
    });
  });

  log(`Using network: ${(await hre.ethers.provider.getNetwork()).chainId}\n`);
  log(
    `Checking bytecode deployed at ${deployedAddress} against ` +
    `the locally compiled bytecode for contract '${solidityPath}'.`,
  );

  if (deployedBytecode.length !== expectedBytecode.length) {
    throw new Error(
      `Deployed bytecode length: ${deployedBytecode.length}, ` +
      `Expected bytecode length: ${expectedBytecode.length}`,
    );
  }

  const deployedMetadata: Buffer = getMetadata(deployedBytecode);
  const expectedMetadata: Buffer = getMetadata(expectedBytecode);

  if (deployedMetadata.length !== expectedMetadata.length) {
    throw new Error(
      `Deployed bytecode metadata length: ${deployedMetadata.length}, ` +
      `Expected bytecode metadata length: ${expectedMetadata.length}`,
    );
  }

  const metadataLength: number = deployedMetadata.length;
  const codeLength: number = deployedBytecode.length - metadataLength;
  const metadataMatch: boolean = deployedMetadata.equals(expectedMetadata);
  const deployedCode: Buffer = deployedBytecode.slice(0, codeLength);
  const expectedCode: Buffer = expectedBytecode.slice(0, codeLength);
  const bytecodeMatch: boolean = deployedCode.equals(expectedCode);

  log('\n');
  log(`Metadata length: ${metadataLength} bytes`);
  log(`Bytecode length (non-metadata): ${codeLength} bytes`);
  log(`Metadata match: ${metadataMatch}`);
  log(`Bytecode match: ${bytecodeMatch}`);

  // Do not throw error on Metadata mismatch since it may be different depending on the local filesystem.
  // https://docs.soliditylang.org/en/develop/metadata.html#encoding-of-the-metadata-hash-in-the-bytecode
  // https://github.com/trufflesuite/truffle-compile/issues/77

  if (!bytecodeMatch) {
    throw new Error('Bytecode mismatch.');
  }

  log('\nPassed all checks.');
}

function getMetadata(bytecode: Buffer): Buffer {
  // The last two bytes should represent the metadata length.
  const length = bytecode.length;
  const metadataLength = bytecode[length - 2] * 2 ** 8 + bytecode[length - 1];
  return bytecode.slice(length - metadataLength);
}
