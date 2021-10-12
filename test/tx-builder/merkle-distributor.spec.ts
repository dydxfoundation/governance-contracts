import axios from 'axios';
import BNJS from 'bignumber.js';
import { expect } from 'chai';
import { BigNumber } from 'ethers';
import { formatEther } from 'ethers/lib/utils';
import sinon from 'sinon';

import { ipfsBytesHash, ipfsBytesHash2 } from '../../helpers/constants';
import { deployMockRewardsOracle } from '../../helpers/contracts-deployments';
import {
  evmSnapshot,
  evmRevert,
  incrementTimeToTimestamp,
  timeLatest,
} from '../../helpers/misc-utils';
import { DRE } from '../../helpers/misc-utils';
import {
  MerkleProof,
  tStringDecimalUnits,
  Network,
  TxBuilder,
} from '../../src';
import BalanceTree from '../../src/merkle-tree-helpers/balance-tree';
import { UserRewardsData } from '../../src/tx-builder/types/GovernanceReturnTypes';
import { EthereumTransactionTypeExtended } from '../../src/tx-builder/types/index';
import { DydxToken } from '../../types/DydxToken';
import { MerkleDistributorV1 } from '../../types/MerkleDistributorV1';
import { MockRewardsOracle } from '../../types/MockRewardsOracle';
import {
  makeSuite,
  TestEnv,
  deployPhase2,
  SignerWithAddress,
} from '../helpers/make-suite';
import { sendTransactions } from '../helpers/tx-builder';

const snapshots = new Map<string, string>();
const beforeEpochZero: string = 'beforeEpochZero';
const afterEpochZero: string = 'afterEpochZero';
const afterProposingMerkleRoot: string = 'afterProposingMerkleRoot';
const afterUpdatingMerkleRoot: string = 'afterUpdatingMerkleRoot';

makeSuite('TxBuilder.merkleDistributor', deployPhase2, (testEnv: TestEnv) => {
  // Contracts.
  let deployer: SignerWithAddress;
  let user1: SignerWithAddress;
  let dydxToken: DydxToken;
  let merkleDistributor: MerkleDistributorV1;
  let mockRewardsOracle: MockRewardsOracle;
  let simpleTree: BalanceTree;
  let simpleTreeRoot: string;
  let waitingPeriod: number;
  let axiosStub: sinon.SinonStub;
  let epochLength: BigNumber;
  let epochZeroStart: BigNumber;

  let txBuilder: TxBuilder;

  before(async () => {
    ({
      deployer,
      dydxToken,
      merkleDistributor,
    } = testEnv);

    user1 = testEnv.users[0];

    // Deploy and use mock rewards oracle.
    mockRewardsOracle = await deployMockRewardsOracle();
    await merkleDistributor.setRewardsOracle(mockRewardsOracle.address);

    // Create TxBuilder for sending transactions.
    txBuilder = new TxBuilder({
      network: Network.hardhat,
      hardhatMerkleDistributorAddresses: {
        MERKLE_DISTRIBUTOR_ADDRESS: merkleDistributor.address,
      },
      injectedProvider: DRE.ethers.provider,
    });

    // Simple tree example that gives 1 token to deployer and 2 tokens to user1.
    simpleTree = new BalanceTree({
      [deployer.address]: 1,
      [user1.address]: 2,
    });
    simpleTreeRoot = simpleTree.getHexRoot();

    // Get the waiting period.
    waitingPeriod = (await merkleDistributor.WAITING_PERIOD()).toNumber();

    // Advance to the start of epoch zero.
    const epochParameters: { interval: BigNumber, offset: BigNumber } = await merkleDistributor.getEpochParameters();

    epochZeroStart = epochParameters.offset;
    epochLength = epochParameters.interval;

    await incrementTimeToTimestamp(epochZeroStart);

    axiosStub = sinon.stub(axios, 'get');
      
    snapshots.set(beforeEpochZero, await evmSnapshot());
  });

  after(() => {
    axiosStub.restore();
  });

  describe('at epoch zero (before transfer restriction)', () => {

    before(async () => {
      await advanceToEpoch(0);

      snapshots.set(afterEpochZero, await evmSnapshot());
    });

    beforeEach(async () => {
      txBuilder.merkleDistributorService.clearCachedRewardsData();

      await loadSnapshot(afterEpochZero);
    });

    it('Can read rewards with no proposed root set', async () => {
      const rewards = await txBuilder.merkleDistributorService.getUserRewardsData(deployer.address);
      await verifyUserRewardsMetadata({
        rewardsData: rewards,
        rewardsPerEpoch: [],
      });
    });

    it('Deployer has empty active root merkle proof', async () => {
      const merkleProof: MerkleProof = await txBuilder.merkleDistributorService.getActiveRootMerkleProof(deployer.address);

      expect(merkleProof.merkleProof).to.be.empty;
      expect(merkleProof.cumulativeAmount).to.equal(0);
    });
  });

  describe('after proposing root', () => {

    before(async () => {
      await loadSnapshot(afterEpochZero);

      await advanceToEpoch(2); // after transfer restriction

      await mockRewardsOracle.setMockValue(
        simpleTreeRoot,
        0,
        ipfsBytesHash,
      );

      await expect(merkleDistributor.proposeRoot()).to.emit(merkleDistributor, 'RootProposed');

      snapshots.set(afterProposingMerkleRoot, await evmSnapshot());
    });

    beforeEach(async () => {
      txBuilder.merkleDistributorService.clearCachedRewardsData();

      axiosStub.returns({ data: [[deployer.address, 1], [user1.address, 2]] });

      await loadSnapshot(afterProposingMerkleRoot);
    });

    it('Can read proposed root rewards with proposed root (but no active root) set', async () => {
      const rewards = await txBuilder.merkleDistributorService.getUserRewardsData(deployer.address);
      await verifyUserRewardsMetadata({
        rewardsData: rewards,
        rewardsPerEpoch: [],
        hasPendingRoot: true,
        pendingRootRewards: formatEther(1),
      });

      const rewards1 = await txBuilder.merkleDistributorService.getUserRewardsData(user1.address);
      await verifyUserRewardsMetadata({
        rewardsData: rewards1,
        rewardsPerEpoch: [],
        hasPendingRoot: true,
        pendingRootRewards: formatEther(2),
      });
    });

    it('Proposed root rewards refresh if new root is proposed', async () => {
      const simpleTree2 = new BalanceTree({
        [deployer.address]: 7,
        [user1.address]: 77,
      });
      const simpleTreeRoot2 = simpleTree2.getHexRoot();

      await mockRewardsOracle.setMockValue(
        simpleTreeRoot2,
        0,
        ipfsBytesHash2,
      );

      await expect(merkleDistributor.proposeRoot()).to.emit(merkleDistributor, 'RootProposed');

      axiosStub.returns({ data: [[deployer.address, 7], [user1.address, 77]] });

      const rewards = await txBuilder.merkleDistributorService.getUserRewardsData(deployer.address);
      await verifyUserRewardsMetadata({
        rewardsData: rewards,
        rewardsPerEpoch: [],
        hasPendingRoot: true,
        pendingRootRewards: formatEther(7),
      });

      const rewards1 = await txBuilder.merkleDistributorService.getUserRewardsData(user1.address);
      await verifyUserRewardsMetadata({
        rewardsData: rewards1,
        rewardsPerEpoch: [],
        hasPendingRoot: true,
        pendingRootRewards: formatEther(77),
      });
    });

    it('Deployer has empty active root merkle proof', async () => {
      const merkleProof: MerkleProof = await txBuilder.merkleDistributorService.getActiveRootMerkleProof(deployer.address);

      expect(merkleProof.merkleProof).to.be.empty;
      expect(merkleProof.cumulativeAmount).to.equal(0);
    });
  });

  describe('after updating root', () => {

    let user2: SignerWithAddress;
    let user3: SignerWithAddress;

    before(async () => {
      await loadSnapshot(afterEpochZero);

      await advanceToEpoch(2); // after transfer restriction

      user2 = testEnv.users[1];
      user3 = testEnv.users[2];

      await mockRewardsOracle.setMockValue(
        simpleTreeRoot,
        0,
        ipfsBytesHash,
      );

      // Propose the root.
      await expect(merkleDistributor.proposeRoot()).to.emit(merkleDistributor, 'RootProposed');

      await incrementTimeToTimestamp((await timeLatest()).plus(waitingPeriod).toNumber());

      // Update the root.
      await expect(merkleDistributor.updateRoot()).to.emit(merkleDistributor, 'RootUpdated');

      snapshots.set(afterUpdatingMerkleRoot, await evmSnapshot());
    });

    beforeEach(async () => {
      txBuilder.merkleDistributorService.clearCachedRewardsData();

      axiosStub.returns({ data: [[deployer.address, 1], [user1.address, 2]] });

      await loadSnapshot(afterUpdatingMerkleRoot);
    });

    it('User not in merkle tree has no rewards', async () => {
      const rewards4 = await txBuilder.merkleDistributorService.getUserRewardsData(user3.address);
      await verifyUserRewardsMetadata({
        rewardsData: rewards4,
        rewardsPerEpoch: [formatEther(0)],
      });
    });

    it('Can read rewards per epoch with active root set', async () => {
      const rewards1: UserRewardsData = await txBuilder.merkleDistributorService.getUserRewardsData(deployer.address);
      await verifyUserRewardsMetadata({
        rewardsData: rewards1,
        rewardsPerEpoch: [formatEther(1)],
      });

      const rewards2 = await txBuilder.merkleDistributorService.getUserRewardsData(user1.address);
      await verifyUserRewardsMetadata({
        rewardsData: rewards2,
        rewardsPerEpoch: [formatEther(2)],
      });
    });


    it('Can read rewards per epoch with new proposed root set', async () => {
      // get proposed root rewards for current merkle root so it caches the current user balances
      const oldRewards1 = await txBuilder.merkleDistributorService.getUserRewardsData(deployer.address);
      await verifyUserRewardsMetadata({
        rewardsData: oldRewards1,
        rewardsPerEpoch: [formatEther(1)],
      });

      // give an additional token to user 1 and add another user to merkle tree
      const simpleTree2 = new BalanceTree({
        [deployer.address]: 1,
        [user1.address]: 3,
        [user2.address]: 4,
      });
      const simpleTreeRoot2 = simpleTree2.getHexRoot();

      await advanceToEpoch(3);

      await mockRewardsOracle.setMockValue(
        simpleTreeRoot2,
        1,
        ipfsBytesHash2,
      );

      axiosStub.returns({ data: [[deployer.address, 1], [user1.address, 3], [user2.address, 4]] });

      // Propose the root.
      await expect(merkleDistributor.proposeRoot()).to.emit(merkleDistributor, 'RootProposed');

      const rewards1 = await txBuilder.merkleDistributorService.getUserRewardsData(deployer.address);
      await verifyUserRewardsMetadata({
        rewardsData: rewards1,
        rewardsPerEpoch: [formatEther(1)],
        hasPendingRoot: true,
      });

      const rewards2 = await txBuilder.merkleDistributorService.getUserRewardsData(user1.address);
      await verifyUserRewardsMetadata({
        rewardsData: rewards2,
        rewardsPerEpoch: [formatEther(2)],
        hasPendingRoot: true,
        pendingRootRewards: formatEther(1),
      });

      // can read rewards with lowercased address (not checksummed)
      const rewards3 = await txBuilder.merkleDistributorService.getUserRewardsData(user2.address.toLowerCase());
      await verifyUserRewardsMetadata({
        rewardsData: rewards3,
        rewardsPerEpoch: [formatEther(0)],
        hasPendingRoot: true,
        pendingRootRewards: formatEther(4),
      });
    });

    it('Can read active root rewards with new active root set', async () => {
      // get active root rewards for current merkle root so it caches the current user balances
      const oldRewards1 = await txBuilder.merkleDistributorService.getUserRewardsData(deployer.address);
      await verifyUserRewardsMetadata({
        rewardsData: oldRewards1,
        rewardsPerEpoch: [formatEther(1)],
      });

      // give an additional token to user 1 and add another user to merkle tree
      const simpleTree2 = new BalanceTree({
        [deployer.address]: 1,
        [user1.address]: 3,
        [user2.address]: 4,
      });
      const simpleTreeRoot2 = simpleTree2.getHexRoot();
      await mockRewardsOracle.setMockValue(
        simpleTreeRoot2,
        1,
        ipfsBytesHash2,
      );

      axiosStub.returns({ data: [[deployer.address, 1], [user1.address, 3], [user2.address, 4]] });

      await advanceToEpoch(3);

      // Propose the root.
      await expect(merkleDistributor.proposeRoot()).to.emit(merkleDistributor, 'RootProposed');

      await incrementTimeToTimestamp((await timeLatest()).plus(waitingPeriod).toNumber());

      // Update the root.
      await expect(merkleDistributor.updateRoot()).to.emit(merkleDistributor, 'RootUpdated');

      // verify new merkle tree overwrites old cached merkle tree
      const rewards1 = await txBuilder.merkleDistributorService.getUserRewardsData(deployer.address);
      await verifyUserRewardsMetadata({
        rewardsData: rewards1,
        rewardsPerEpoch: [formatEther(1), formatEther(1)],
      });

      const rewards2 = await txBuilder.merkleDistributorService.getUserRewardsData(user1.address);
      await verifyUserRewardsMetadata({
        rewardsData: rewards2,
        rewardsPerEpoch: [formatEther(2), formatEther(3)],
      });

      const rewards3 = await txBuilder.merkleDistributorService.getUserRewardsData(user2.address);
      await verifyUserRewardsMetadata({
        rewardsData: rewards3,
        rewardsPerEpoch: [formatEther(0), formatEther(4)],
      });
    });

    it('Deployer can claim rewards', async () => {
      const balanceBefore: BigNumber = await dydxToken.balanceOf(deployer.address);

      const txs: EthereumTransactionTypeExtended[] = await txBuilder.merkleDistributorService.claimRewards(deployer.address);

      await sendTransactions(txs, deployer);

      const balanceAfter: BigNumber = await dydxToken.balanceOf(deployer.address);

      // deployer should have claimed 1 wei of tokens as a reward
      expect(balanceAfter.sub(balanceBefore)).to.equal(1);
    });
  });

  async function verifyUserRewardsMetadata({
    rewardsData,
    rewardsPerEpoch,
    claimedRewards = '0.0',
    pendingRootRewards = '0.0',
  }: {
    rewardsData: UserRewardsData,
    rewardsPerEpoch: tStringDecimalUnits[],
    hasPendingRoot?: boolean,
    claimedRewards?: tStringDecimalUnits,
    pendingRootRewards?: tStringDecimalUnits,
  }): Promise<void> {
    const [
      hasPendingRoot,
      waitingPeriodEndBN,
      contractCurrentEpoch,
      epochParams,
      waitingPeriodLength,
      currentBlocktime,
    ]: [
      boolean,
      BigNumber,
      BigNumber,
      { interval: BigNumber, offset: BigNumber },
      BigNumber,
      BNJS,
    ] = await Promise.all([
      merkleDistributor.hasPendingRoot(),
      merkleDistributor.getWaitingPeriodEnd(),
      merkleDistributor.getCurrentEpoch(),
      merkleDistributor.getEpochParameters(),
      merkleDistributor.WAITING_PERIOD(),
      timeLatest(),
    ]);

    // verify rewards data
    expect(rewardsData.newPendingRootRewards).to.equal(hasPendingRoot ? pendingRootRewards : '0.0');
    expect(rewardsData.claimedRewards).to.equal(claimedRewards);

    const numRootUpdates: number = Object.keys(rewardsData.rewardsPerEpoch).length;
    expect(numRootUpdates).to.equal(rewardsPerEpoch.length);

    for (let i = 0; i < numRootUpdates; i++) {
      expect(rewardsData.rewardsPerEpoch[i]).to.equal(rewardsPerEpoch[i]);
    }

    // verify pending root data
    expect(rewardsData.pendingRootData.hasPendingRoot).to.equal(hasPendingRoot);
    expect(rewardsData.pendingRootData.waitingPeriodEnd).to.equal(
      hasPendingRoot
        ? waitingPeriodEndBN.toNumber()
        : 0,
    );

    // verify epoch data
    const expectedCurrentEpoch: number = contractCurrentEpoch.toNumber();

    const secondsSinceEpochZero: BNJS = currentBlocktime.minus(epochZeroStart.toNumber());
    const epochLength: number = epochParams.interval.toNumber();

    const currentEpoch: number = secondsSinceEpochZero
      .dividedToIntegerBy(epochLength)
      .toNumber();

    const startOfEpochTimestamp: number = epochZeroStart.add(epochParams.interval.mul(currentEpoch)).toNumber();
    const endOfEpochTimestamp: number = epochZeroStart.add(epochParams.interval.mul(currentEpoch + 1)).toNumber();

    expect(rewardsData.epochData.currentEpoch).to.equal(expectedCurrentEpoch);
    expect(rewardsData.epochData.startOfEpochTimestamp).to.equal(startOfEpochTimestamp);
    expect(rewardsData.epochData.endOfEpochTimestamp).to.equal(endOfEpochTimestamp);
    expect(rewardsData.epochData.waitingPeriodLength).to.equal(waitingPeriodLength.toNumber());
    expect(rewardsData.epochData.epochLength).to.equal(epochLength);
  }

  async function advanceToEpoch(epoch: number): Promise<void> {
    await incrementTimeToTimestamp(epochZeroStart.add(epochLength.mul(epoch)));
  }

  async function loadSnapshot(label: string): Promise<void> {
    const snapshot = snapshots.get(label);
    if (!snapshot) {
      throw new Error(`Cannot load since snapshot has not been saved: ${label}`);
    }
    await evmRevert(snapshot);
    snapshots.set(label, await evmSnapshot());
  }
});
