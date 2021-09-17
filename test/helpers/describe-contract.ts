import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import chai from 'chai';
import dirtyChai from 'dirty-chai';
import { solidity } from 'ethereum-waffle';

import { DeployConfig, getDeployConfig } from '../../src/deploy-config';
import { DeployedContracts } from '../../src/deployment/deploy-contracts';
import hre from '../hre';
import { evmSnapshot, evmReset } from './evm';
import { getDeployedContracts } from './get-deployed-contracts';

export interface TestContext extends DeployedContracts {
  config: DeployConfig;
  deployer: SignerWithAddress;
  users: SignerWithAddress[];
}

// Global chai setup.
chai.use(dirtyChai);
chai.use(solidity);

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
      ctx.deployer = accounts[0];
      ctx.users = accounts.slice(1);

      // Deploy contracts before taking the pre-init snapshot.
      const deployedContracts = await getDeployedContracts();
      Object.assign(
        ctx,
        deployedContracts,
      );

      preInitSnapshotId = await evmSnapshot();
      await init(ctx);
      postInitSnapshotId = await evmSnapshot();
    });

    // Runs before any beforeEach() calls made within the describeContract() call.
    beforeEach(async () => {
      await evmReset(postInitSnapshotId);
      postInitSnapshotId = await evmSnapshot();
    });

    // Runs before any after() calls made within the describeContract() call.
    after(async () => {
      await evmReset(preInitSnapshotId);
      preInitSnapshotId = await evmSnapshot();
    });

    tests(ctx);
  });
}
