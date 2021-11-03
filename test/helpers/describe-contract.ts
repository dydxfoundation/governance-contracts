import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import chai from 'chai';
import dirtyChai from 'dirty-chai';
import { solidity } from 'ethereum-waffle';

import config from '../../src/config';
import { getDeployConfig } from '../../src/deploy-config';
import { getDeployerSigner } from '../../src/deploy-config/get-deployer-address';
import { DeployConfig, DeployedContracts } from '../../src/types';
import hre from '../hre';
import { evmSnapshot, evmReset } from './evm';
import { getDeployedContractsOnceForTest } from './get-deployed-contracts-for-test';

export interface TestContext extends DeployedContracts {
  config: DeployConfig;
  deployer: SignerWithAddress;
  users: SignerWithAddress[];
}

// Global chai setup.
chai.use(dirtyChai);
chai.use(solidity);

export function mainnetForkTest(
  name: string,
  test: () => Promise<void>,
) {
  if (config.FORK_MAINNET) {
    it(`Running mainnet fork test: ${name}`, test);
  } else {
    it.skip(`Skipping mainnet fork test: ${name}`, test);
  }
}

export function describeContractHardhat(
  name: string,
  init: (ctx: TestContext) => void | Promise<void>,
  tests: (ctx: TestContext) => void,
): void {
  if (!config.isHardhat() || config.FORK_MAINNET) {
    // These tests only run on Hardhat (not including mainnet forks)
    describe.skip(name, () => {});
  } else {
    // Note that the function passed into describe() should not be async.
    describe(name, () => {
      const ctx: TestContext = {
        config: getDeployConfig(),
      } as TestContext;

      let preInitSnapshotId: string;

      // Runs before any before() calls made within the describeContract() call.
      before(async () => {
        const accounts = await hre.ethers.getSigners();
        ctx.deployer = await getDeployerSigner();
        ctx.users = accounts.slice(1);

        // Deploy contracts before taking the pre-init snapshot.
        const deployedContracts = await getDeployedContractsOnceForTest();
        Object.assign(
          ctx,
          deployedContracts,
        );

        preInitSnapshotId = await evmSnapshot();
        await init(ctx);
      });

      // Runs before any after() calls made within the describeContract() call.
      after(async () => {
        await evmReset(preInitSnapshotId);
      });

      tests(ctx);
    });
  }
}

export function describeContract(
  name: string,
  init: (ctx: TestContext) => void | Promise<void>,
  tests: (ctx: TestContext) => void,
): void {
  // Note that the function passed into describe() should not be async.
  describe(name, () => {
    const ctx: TestContext = {
      config: getDeployConfig(),
    } as TestContext;

    let preInitSnapshotId: string;
    let postInitSnapshotId: string;

    // Runs before any before() calls made within the describeContract() call.
    before(async () => {
      const accounts = await hre.ethers.getSigners();
      ctx.deployer = await getDeployerSigner();
      ctx.users = accounts.slice(1);

      // Deploy contracts before taking the pre-init snapshot.
      const deployedContracts = await getDeployedContractsOnceForTest();
      Object.assign(
        ctx,
        deployedContracts,
      );

      preInitSnapshotId = await maybeEvmSnapshot();
      await init(ctx);
      postInitSnapshotId = await maybeEvmSnapshot();
    });

    // Runs before any beforeEach() calls made within the describeContract() call.
    beforeEach(async () => {
      await maybeEvmReset(postInitSnapshotId);
      postInitSnapshotId = await maybeEvmSnapshot();
    });

    // Runs before any after() calls made within the describeContract() call.
    after(async () => {
      if (typeof preInitSnapshotId !== 'undefined') {
        await maybeEvmReset(preInitSnapshotId);
        preInitSnapshotId = await maybeEvmSnapshot();
      }
    });

    tests(ctx);
  });
}

async function maybeEvmSnapshot(): Promise<string> {
  if (config.isHardhat()) {
    return evmSnapshot();
  }
  return '';
}

async function maybeEvmReset(
  id: string,
): Promise<void> {
  if (config.isHardhat()) {
    await evmReset(id);
  }
}
