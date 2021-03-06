import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import chai from 'chai';
import dirtyChai from 'dirty-chai';
import { solidity } from 'ethereum-waffle';

import config from '../../src/config';
import { getDeployConfig } from '../../src/deploy-config';
import { getDeployerSigner } from '../../src/deploy-config/get-deployer-address';
import { getNetworkName } from '../../src/hre';
import { DeployConfig, NetworkName, AllDeployedContracts } from '../../src/types';
import hre from '../hre';
import { evmSnapshot, evmReset } from './evm';
import { getDeployedContractsOnceForTest } from './get-deployed-contracts-for-test';

export interface TestContext extends AllDeployedContracts {
  config: DeployConfig;
  deployer: SignerWithAddress;
  users: SignerWithAddress[];
}

// Global chai setup.
chai.use(dirtyChai);
chai.use(solidity);

export function describeContractForNetwork(
  name: string,
  ctx: TestContext,
  networkForTest: NetworkName,
  mainnetForkTest: boolean,
  tests: (ctx: TestContext) => void,
) {
  if (networkForTest === getNetworkName() && mainnetForkTest === config.FORK_MAINNET) {
    describe(`Running test on ${networkForTest} ${mainnetForkTest ? 'fork' : ''}: ${name}`, () => {
      tests(ctx);
    });
  } else {
    describe.skip(`Skipping test on ${networkForTest} ${mainnetForkTest ? 'fork' : ''}: ${name}`, () => {});
  }
}

/**
 * @notice Used for running tests on the Hardhat network (excluding mainnet forks). The tests
 *  will be skipped if on a non-Hardhat network or mainnet fork.
 *
 *  IMPORTANT: This method is different than `describeContractHardhatRevertBeforeEach` because it does _not_
 *  revert snapshots after each test (only after all tests have run). This is useful if you want the contracts
 *  to persist state into nested `describe` blocks.
 *
 * @param  name   The name of the test.
 * @param  init   The function to run before running the tests.
 * @param  tests  The tests to run.
 */
export function describeContractHardhatRevertBefore(
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

/**
 * @notice Used for running tests on the Hardhat network (excluding mainnet forks). The tests
 *  will be skipped if on a non-Hardhat network or mainnet fork.
 *
 *  IMPORTANT: This method is different than `describeContractHardhatRevertBefore` because it _does_
 *  revert snapshots after each test. This is useful if you don't want the contracts to persist state
 *  into nested `describe` blocks.
 *
 * @param  name   The name of the test.
 * @param  init   The function to run before running the tests.
 * @param  tests  The tests to run.
 */
export function describeContractHardhatRevertBeforeEach(
  name: string,
  init: (ctx: TestContext) => void | Promise<void>,
  tests: (ctx: TestContext) => void,
): void {
  if (config.FORK_MAINNET) {
    // Skip tests that do not run on mainnet forks when forking mainnet.
    describe.skip(name, () => {});
  } else {
    describeContract(name, init, tests);
  }
}
