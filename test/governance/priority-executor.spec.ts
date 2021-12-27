import { expect, use } from 'chai';
import { solidity } from 'ethereum-waffle';
import { BigNumber, Signer } from 'ethers';
import {
  keccak256,
  defaultAbiCoder,
} from 'ethers/lib/utils';
import {
  makeSuite,
  TestEnv,
  noDeploy,
} from '../test-helpers/make-suite';
import {
  evmRevert,
  evmSnapshot,
  timeLatest,
  increaseTimeAndMine,
} from '../../helpers/misc-utils';
import { getEthersSigners } from '../../helpers/contracts-helpers';
import {
  deployPriorityExecutor,
  deployMintableErc20,
} from '../../helpers/contracts-deployments';
import { PriorityExecutor } from '../../types/PriorityExecutor';
import { MintableErc20 } from '../../types/MintableErc20';
import rawBRE from 'hardhat';

type ExecutorTx = {
  target: string;
  value: string;
  signature: string;
  data: string;
  executionTime: number;
  withDelegatecall: boolean;
}

const snapshots = new Map<string, string>();
const afterDeploy = 'AfterDeploy';
const afterQueueTx = 'AfterQueueTx';

makeSuite('dYdX priority executor tests', noDeploy, (_: TestEnv) => {
  let priorityExecutorWithAdmin: PriorityExecutor;
  let priorityExecutorWithController: PriorityExecutor;
  let adminSigner: Signer;
  let priorityControllerSigner: Signer;
  let testSigner: Signer;
  const delay: BigNumber = BigNumber.from(60);  // 1 minute
  const gracePeriod: BigNumber = BigNumber.from(60 * 2);  // 2 minutes
  const minDelay: BigNumber = BigNumber.from(30);  // 30 seconds
  const maxDelay: BigNumber = BigNumber.from(60);  // 2 minutes
  const priorityPeriod: BigNumber = BigNumber.from(30);  // 30 seconds

  before(async () => {
    [adminSigner, priorityControllerSigner, testSigner] = await getEthersSigners();

    const fillerParam: string = BigNumber.from(1).toString()

    priorityExecutorWithAdmin = await deployPriorityExecutor(
      await adminSigner.getAddress(),
      delay.toString(),
      gracePeriod.toString(),
      minDelay.toString(),
      maxDelay.toString(),
      priorityPeriod.toString(),
      // Following 4 are not relevant to these tests but necessary for
      // creating a priority executor
      fillerParam,
      fillerParam,
      fillerParam,
      fillerParam,
      await priorityControllerSigner.getAddress(),
    );

    priorityExecutorWithController = priorityExecutorWithAdmin.connect(priorityControllerSigner);

    await saveSnapshot(afterDeploy);
  });

  describe('when an action is unlocked for priority execution', () => {
    let testTx: ExecutorTx;
    let actionHash: string;

    before(async () => {
      const testToken: MintableErc20 = await deployMintableErc20(
        'test',
        'TEST',
        18,
      );

      // Make a test transaction and get the action hash.
      const adminAddress = await adminSigner.getAddress();
      const callData = testToken.interface.encodeFunctionData('mint', [adminAddress, BigNumber.from(7)]);
      const now = await timeLatest();
      testTx = {
        target: testToken.address,
        value: '0',
        signature: '',
        data: callData,
        executionTime: now.plus(delay.toString()).plus(10).toNumber(),  // 70 seconds in future
        withDelegatecall: false,
      };
      actionHash = await queueTransaction(priorityExecutorWithAdmin, testTx);

      // Set the priority status to unlocked for execution during the priority window.
      await expect(
        priorityExecutorWithController.setTransactionPriorityStatus(actionHash, true))
        .to
        .emit(priorityExecutorWithController, 'UpdatedActionPriorityStatus')
        .withArgs(actionHash, true);

      expect(await priorityExecutorWithAdmin.hasPriorityStatus(actionHash)).to.be.true;

      await saveSnapshot(afterQueueTx);
    })

    afterEach(async () => {
      await loadSnapshot(afterQueueTx);
    });

    after(async () => {
      await loadSnapshot(afterDeploy);
    });

    it('Allows admin to execute the transaction in priority period', async () => {
      const priorityPeriodStart = BigNumber.from(testTx.executionTime).sub(priorityPeriod);
      await advanceTimeTo(priorityPeriodStart);
      await expect(
        priorityExecutorWithAdmin.executeTransaction(
          testTx.target,
          testTx.value,
          testTx.signature,
          testTx.data,
          testTx.executionTime,
          testTx.withDelegatecall,
        ))
        .to
        .emit(priorityExecutorWithAdmin, 'ExecutedAction')
        .withArgs(
          actionHash,
          testTx.target,
          testTx.value,
          testTx.signature,
          testTx.data,
          testTx.executionTime,
          testTx.withDelegatecall,
          defaultAbiCoder.encode([], []),
        );
    });

    it('Admin cannot execute the transaction before priority window', async () => {
      const priorityPeriodStart = BigNumber.from(testTx.executionTime).sub(priorityPeriod);

      // Advance to just before the start of the priority window.
      await advanceTimeTo(priorityPeriodStart.sub(100));
      await expect(
        priorityExecutorWithAdmin.executeTransaction(
          testTx.target,
          testTx.value,
          testTx.signature,
          testTx.data,
          testTx.executionTime,
          testTx.withDelegatecall,
        ))
        .to.be.revertedWith('NOT_IN_PRIORITY_WINDOW');
    });

    it('Authorized executor cannot set priority status on a transaction that was not queued', async () => {
      const callData = priorityExecutorWithAdmin.interface.encodeFunctionData('setPriorityPeriod', [delay]);
      const now = await timeLatest();

      // Make a new transaction and action hash.
      const tx = {
        target: priorityExecutorWithAdmin.address,
        value: '0',
        signature: '',
        data: callData,
        executionTime: now.plus(delay.toString()).plus(10).toNumber(),  // 70 seconds in future
        withDelegatecall: false,
      };
      const actionHash = keccak256(
        defaultAbiCoder.encode(
          ['address', 'uint256', 'string', 'bytes', 'uint256', 'bool'],
          [tx.target, tx.value, tx.signature, tx.data, tx.executionTime, tx.withDelegatecall],
        )
      );

      await expect(
        priorityExecutorWithController.setTransactionPriorityStatus(actionHash, true))
        .to.be.revertedWith('ACTION_NOT_QUEUED');
      expect(await priorityExecutorWithAdmin.hasPriorityStatus(actionHash)).to.be.false;
    });

    it('Admin cannot execute the transaction in priority period if priority status is revoked', async () => {
      const priorityPeriodStart = BigNumber.from(testTx.executionTime).sub(priorityPeriod);
      await advanceTimeTo(priorityPeriodStart);

      await expect(
        priorityExecutorWithController.setTransactionPriorityStatus(actionHash, false))
        .to
        .emit(priorityExecutorWithController, 'UpdatedActionPriorityStatus')
        .withArgs(actionHash, false);
      expect(await priorityExecutorWithAdmin.hasPriorityStatus(actionHash)).to.be.false;

      await expect(
        priorityExecutorWithAdmin.executeTransaction(
          testTx.target,
          testTx.value,
          testTx.signature,
          testTx.data,
          testTx.executionTime,
          testTx.withDelegatecall,
        ))
        .to.be.revertedWith('TIMELOCK_NOT_FINISHED');
    });
  });

  describe('setPriorityPeriod', () => {
    afterEach(async () => {
      await loadSnapshot(afterDeploy);
    });

    it('The timelock can update its own priority period and set it equal to the delay', async () => {
      const callData = priorityExecutorWithAdmin.interface.encodeFunctionData('setPriorityPeriod', [delay]);

      const now = await timeLatest();

      const testTx = {
        target: priorityExecutorWithAdmin.address,
        value: '0',
        signature: '',
        data: callData,
        executionTime: now.plus(delay.toString()).plus(10).toNumber(),  // 70 seconds in future
        withDelegatecall: false,
      };

      const actionHash = await queueTransaction(priorityExecutorWithAdmin, testTx);

      await advanceTimeTo(BigNumber.from(testTx.executionTime.toString()));
      await expect(
        priorityExecutorWithAdmin.executeTransaction(
          testTx.target,
          testTx.value,
          testTx.signature,
          testTx.data,
          testTx.executionTime,
          testTx.withDelegatecall,
        ))
        .to
        .emit(priorityExecutorWithAdmin, 'ExecutedAction')
        .withArgs(
          actionHash,
          testTx.target,
          testTx.value,
          testTx.signature,
          testTx.data,
          testTx.executionTime,
          testTx.withDelegatecall,
          defaultAbiCoder.encode([], []),
        )
        .emit(priorityExecutorWithAdmin, 'NewPriorityPeriod')
        .withArgs(delay);

      const newPriorityPeriod: BigNumber = await priorityExecutorWithAdmin.getPriorityPeriod();
      expect(newPriorityPeriod).to.equal(delay);
    });

    it('The timelock can update its own priority period and set it equal to 0', async () => {
      const callData = priorityExecutorWithAdmin.interface.encodeFunctionData('setPriorityPeriod', [BigNumber.from(0)]);

      const now = await timeLatest();

      const testTx = {
        target: priorityExecutorWithAdmin.address,
        value: '0',
        signature: '',
        data: callData,
        executionTime: now.plus(delay.toString()).plus(10).toNumber(),  // 70 seconds in future
        withDelegatecall: false,
      };

      const actionHash = await queueTransaction(priorityExecutorWithAdmin, testTx);

      await advanceTimeTo(BigNumber.from(testTx.executionTime.toString()));
      await expect(
        priorityExecutorWithAdmin.executeTransaction(
          testTx.target,
          testTx.value,
          testTx.signature,
          testTx.data,
          testTx.executionTime,
          testTx.withDelegatecall,
        ))
        .to
        .emit(priorityExecutorWithAdmin, 'ExecutedAction')
        .withArgs(
          actionHash,
          testTx.target,
          testTx.value,
          testTx.signature,
          testTx.data,
          testTx.executionTime,
          testTx.withDelegatecall,
          defaultAbiCoder.encode([], []),
        )
        .emit(priorityExecutorWithAdmin, 'NewPriorityPeriod')
        .withArgs(0);

      const newPriorityPeriod: BigNumber = await priorityExecutorWithAdmin.getPriorityPeriod();
      expect(newPriorityPeriod).to.equal(0);
    });

    it('Cannot set a priority period greater than delay', async () => {
      const callData = priorityExecutorWithAdmin.interface.encodeFunctionData('setPriorityPeriod', [delay.add(1)]);

      const now = await timeLatest();

      const testTx = {
        target: priorityExecutorWithAdmin.address,
        value: '0',
        signature: '',
        data: callData,
        executionTime: now.plus(delay.toString()).plus(10).toNumber(),  // 70 seconds in future
        withDelegatecall: false,
      };

      await queueTransaction(priorityExecutorWithAdmin, testTx);

      await advanceTimeTo(BigNumber.from(testTx.executionTime.toString()));
      await expect(
        priorityExecutorWithAdmin.executeTransaction(
          testTx.target,
          testTx.value,
          testTx.signature,
          testTx.data,
          testTx.executionTime,
          testTx.withDelegatecall,
        ))
        .to.be.revertedWith('FAILED_ACTION_EXECUTION');
    });
  });

  describe('updatePriorityController', () => {
    afterEach(async () => {
      await loadSnapshot(afterDeploy);
    });

    it('Priority timelock can add a priority executor', async () => {
      const testSignerAddress = await testSigner.getAddress();
      const callData = priorityExecutorWithAdmin.interface.encodeFunctionData('updatePriorityController', [testSignerAddress, true]);

      const now = await timeLatest();

      const testTx = {
        target: priorityExecutorWithAdmin.address,
        value: '0',
        signature: '',
        data: callData,
        executionTime: now.plus(delay.toString()).plus(10).toNumber(),  // 70 seconds in future
        withDelegatecall: false,
      };

      const actionHash = await queueTransaction(priorityExecutorWithAdmin, testTx);

      await advanceTimeTo(BigNumber.from(testTx.executionTime.toString()));
      await expect(
        priorityExecutorWithAdmin.executeTransaction(
          testTx.target,
          testTx.value,
          testTx.signature,
          testTx.data,
          testTx.executionTime,
          testTx.withDelegatecall,
        ))
        .to
        .emit(priorityExecutorWithAdmin, 'ExecutedAction')
        .withArgs(
          actionHash,
          testTx.target,
          testTx.value,
          testTx.signature,
          testTx.data,
          testTx.executionTime,
          testTx.withDelegatecall,
          defaultAbiCoder.encode([], []),
        )
        .emit(priorityExecutorWithAdmin, 'PriorityControllerUpdated')
        .withArgs(testSignerAddress, true);

      expect(await priorityExecutorWithAdmin.isPriorityController(testSignerAddress)).to.be.true;
    });

    it('Priority timelock can remove a priority executor', async () => {
      const priorityExecutorSignerAddress = await priorityControllerSigner.getAddress();

      const callData = priorityExecutorWithAdmin.interface.encodeFunctionData('updatePriorityController', [await priorityControllerSigner.getAddress(), false]);

      const now = await timeLatest();

      const testTx = {
        target: priorityExecutorWithAdmin.address,
        value: '0',
        signature: '',
        data: callData,
        executionTime: now.plus(delay.toString()).plus(10).toNumber(),  // 70 seconds in future
        withDelegatecall: false,
      };

      const actionHash = await queueTransaction(priorityExecutorWithAdmin, testTx);

      await advanceTimeTo(BigNumber.from(testTx.executionTime.toString()));
      await expect(
        priorityExecutorWithAdmin.executeTransaction(
          testTx.target,
          testTx.value,
          testTx.signature,
          testTx.data,
          testTx.executionTime,
          testTx.withDelegatecall,
        ))
        .to
        .emit(priorityExecutorWithAdmin, 'ExecutedAction')
        .withArgs(
          actionHash,
          testTx.target,
          testTx.value,
          testTx.signature,
          testTx.data,
          testTx.executionTime,
          testTx.withDelegatecall,
          defaultAbiCoder.encode([], []),
        )
        .emit(priorityExecutorWithAdmin, 'PriorityControllerUpdated')
        .withArgs(priorityExecutorSignerAddress, false);

      expect(await priorityExecutorWithAdmin.isPriorityController(priorityExecutorSignerAddress)).to.be.false;
    });
  });

  describe('setDelay', () => {
    afterEach(async () => {
      await loadSnapshot(afterDeploy);
    });

    it('The timelock can update the delay to a value greater than the priority period', async () => {
      const newDelay: BigNumber = delay.sub(1);
      const callData = priorityExecutorWithAdmin.interface.encodeFunctionData('setDelay', [newDelay]);

      const now = await timeLatest();

      const testTx = {
        target: priorityExecutorWithAdmin.address,
        value: '0',
        signature: '',
        data: callData,
        executionTime: now.plus(delay.toString()).plus(10).toNumber(),  // 70 seconds in future
        withDelegatecall: false,
      };

      const actionHash = await queueTransaction(priorityExecutorWithAdmin, testTx);

      await advanceTimeTo(BigNumber.from(testTx.executionTime.toString()));
      await expect(
        priorityExecutorWithAdmin.executeTransaction(
          testTx.target,
          testTx.value,
          testTx.signature,
          testTx.data,
          testTx.executionTime,
          testTx.withDelegatecall,
        ))
        .to
        .emit(priorityExecutorWithAdmin, 'ExecutedAction')
        .withArgs(
          actionHash,
          testTx.target,
          testTx.value,
          testTx.signature,
          testTx.data,
          testTx.executionTime,
          testTx.withDelegatecall,
          defaultAbiCoder.encode([], []),
        )
        .emit(priorityExecutorWithAdmin, 'NewDelay')
        .withArgs(newDelay);
    });

    it('The timelock can update the delay to a value equal to the priority period', async () => {
      const newDelay: BigNumber = priorityPeriod;
      const callData = priorityExecutorWithAdmin.interface.encodeFunctionData('setDelay', [newDelay]);

      const now = await timeLatest();

      const testTx = {
        target: priorityExecutorWithAdmin.address,
        value: '0',
        signature: '',
        data: callData,
        executionTime: now.plus(delay.toString()).plus(10).toNumber(),  // 70 seconds in future
        withDelegatecall: false,
      };

      const actionHash = await queueTransaction(priorityExecutorWithAdmin, testTx);

      await advanceTimeTo(BigNumber.from(testTx.executionTime.toString()));
      await expect(
        priorityExecutorWithAdmin.executeTransaction(
          testTx.target,
          testTx.value,
          testTx.signature,
          testTx.data,
          testTx.executionTime,
          testTx.withDelegatecall,
        ))
        .to
        .emit(priorityExecutorWithAdmin, 'ExecutedAction')
        .withArgs(
          actionHash,
          testTx.target,
          testTx.value,
          testTx.signature,
          testTx.data,
          testTx.executionTime,
          testTx.withDelegatecall,
          defaultAbiCoder.encode([], []),
        )
        .emit(priorityExecutorWithAdmin, 'NewDelay')
        .withArgs(newDelay);
    });

    it('Cannot set a delay less than the priority period', async () => {
      const badDelay: BigNumber = priorityPeriod.sub(1);
      const callData = priorityExecutorWithAdmin.interface.encodeFunctionData('setDelay', [badDelay]);

      const now = await timeLatest();

      const testTx = {
        target: priorityExecutorWithAdmin.address,
        value: '0',
        signature: '',
        data: callData,
        executionTime: now.plus(delay.toString()).plus(10).toNumber(),  // 70 seconds in future
        withDelegatecall: false,
      };

      await queueTransaction(priorityExecutorWithAdmin, testTx);

      await advanceTimeTo(BigNumber.from(testTx.executionTime.toString()));
      await expect(
        priorityExecutorWithAdmin.executeTransaction(
          testTx.target,
          testTx.value,
          testTx.signature,
          testTx.data,
          testTx.executionTime,
          testTx.withDelegatecall,
        ))
        .to.be.revertedWith('FAILED_ACTION_EXECUTION');
    });
  });
});

async function advanceTimeTo(timestamp: BigNumber): Promise<void> {
  const latestBlockTimestamp = await timeLatest();
  const diff = timestamp.sub(latestBlockTimestamp.toString()).toNumber();
  await increaseTimeAndMine(diff);
}

async function saveSnapshot(label: string): Promise<void> {
  snapshots.set(label, await evmSnapshot());
}

async function loadSnapshot(label: string): Promise<void> {
  const snapshot = snapshots.get(label);
  if (!snapshot) {
    throw new Error(`Cannot load since snapshot has not been saved: ${label}`);
  }
  await evmRevert(snapshot);
  snapshots.set(label, await evmSnapshot());
}

// queues a transaction and returns an action hash
async function queueTransaction(
  priorityExecutor: PriorityExecutor,
  tx: ExecutorTx,
): Promise<string> {
    const actionHash = keccak256(
      defaultAbiCoder.encode(
        ['address', 'uint256', 'string', 'bytes', 'uint256', 'bool'],
        [tx.target, tx.value, tx.signature, tx.data, tx.executionTime, tx.withDelegatecall],
      )
    );
    await expect(
      priorityExecutor.queueTransaction(
        tx.target,
        tx.value,
        tx.signature,
        tx.data,
        tx.executionTime,
        tx.withDelegatecall,
      ))
      .to
      .emit(priorityExecutor, 'QueuedAction')
      .withArgs(
        actionHash,
        tx.target,
        tx.value,
        tx.signature,
        tx.data,
        tx.executionTime,
        tx.withDelegatecall,
      );

    return actionHash;
}
