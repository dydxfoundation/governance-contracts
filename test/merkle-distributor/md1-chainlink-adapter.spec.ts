import { BigNumber } from 'ethers';
import { expect } from 'chai';

import BalanceTree from '../../src/merkle-tree-helpers/balance-tree';
import {
  evmRevert,
  evmSnapshot,
  incrementTimeToTimestamp,
  timeLatest,
} from '../../helpers/misc-utils';
import {
  makeSuite,
  TestEnv,
  deployPhase2,
  SignerWithAddress,
} from '../test-helpers/make-suite';
import { MerkleDistributorV1 } from '../../types/MerkleDistributorV1';
import { DydxToken } from '../../types/DydxToken';
import { before } from 'mocha';
import { Treasury } from '../../types/Treasury';
import { Md1ChainlinkAdapter } from '../../types/Md1ChainlinkAdapter';
import { MockChainlinkToken } from '../../types/MockChainlinkToken';
import { DEPLOY_CONFIG, HARDHAT_MOCK_CHAINLINK_ORACLE_ADDRESS } from '../../tasks/helpers/deploy-config';

const FEE_AMOUNT = BigNumber.from(1e17.toFixed());
const CHAINLINK_JOB_ID = DEPLOY_CONFIG.CHAINLINK_ADAPTER.JOB_ID;
const MOCK_IPFS_CID = `0x${'0123'.repeat(16)}`;

const snapshots = new Map<string, string>();

const beforeSettingMerkleRoot: string = 'beforeSettingMerkleRoot';

makeSuite('Merkle Distributor Chainlink Adapter', deployPhase2, (testEnv: TestEnv) => {
  let deployer: SignerWithAddress;
  let rewardsTreasury: Treasury;
  let dydxToken: DydxToken;
  let mockChainlinkToken: MockChainlinkToken;
  let chainlinkAdapter: Md1ChainlinkAdapter;
  let merkleDistributor: MerkleDistributorV1;
  let oracleExternalAdapter: SignerWithAddress;
  let user: SignerWithAddress;
  let otherUser: SignerWithAddress;
  let tokenSupply: BigNumber;
  let simpleTree: BalanceTree;
  let simpleTreeRoot: string;
  let waitingPeriod: number;

  before(async () => {
    ({
      deployer,
      chainlinkAdapter,
      rewardsTreasury,
      dydxToken,
      mockChainlinkToken,
      merkleDistributor,
    } = testEnv);

    ([oracleExternalAdapter, user, otherUser] = testEnv.users);

    // Send all tokens to the rewards treasury, and set allowance on the Merkle distributor contract.
    const distributorBalance: BigNumber = await dydxToken.balanceOf(rewardsTreasury.address);
    await dydxToken.connect(deployer.signer).transfer(rewardsTreasury.address, distributorBalance);
    tokenSupply = await dydxToken.balanceOf(rewardsTreasury.address);

    // Mint some LINK to the user so they can pay a fee when making a request.
    await mockChainlinkToken.mint(user.address, FEE_AMOUNT);
    await mockChainlinkToken.connect(user.signer).approve(chainlinkAdapter.address, FEE_AMOUNT.mul(100));

    // Simple tree example that gives all tokens to a single address.
    simpleTree = new BalanceTree({
      [user.address]: tokenSupply,
    });
    simpleTreeRoot = simpleTree.getHexRoot();

    // Get the waiting period.
    waitingPeriod = (await merkleDistributor.WAITING_PERIOD()).toNumber();

    // Advance to the start of epoch zero.
    const epochParameters = await merkleDistributor.getEpochParameters();
    await incrementTimeToTimestamp(epochParameters.offset);
    snapshots.set(beforeSettingMerkleRoot, await evmSnapshot());
  });

  afterEach(async () => {
    await revertTestChanges();
  });

  describe('initialization', () => {

    it('Has Chainlink token', async () => {
      expect(await chainlinkAdapter.CHAINLINK_TOKEN()).to.equal(mockChainlinkToken.address);
    });

    it('Has Merkle Distributor', async () => {
      expect(await chainlinkAdapter.MERKLE_DISTRIBUTOR()).to.equal(merkleDistributor.address);
    });

    it('Has Chainlink oracle contract address', async () => {
      expect(await chainlinkAdapter.ORACLE_CONTRACT()).to.equal(HARDHAT_MOCK_CHAINLINK_ORACLE_ADDRESS);
    });

    it('Has oracle external (off-chain) adapter address', async () => {
      expect(await chainlinkAdapter.ORACLE_EXTERNAL_ADAPTER()).to.equal(oracleExternalAdapter.address);
    });

    it('Has Chainlink job ID', async () => {
      expect(await chainlinkAdapter.JOB_ID()).to.equal(
        `0x` + Buffer.from(CHAINLINK_JOB_ID).toString('hex'),
      );
    });
  });

  describe('Basic operation', () => {

    it('Transfers fee and makes a request', async () => {
      // Make the request.
      await chainlinkAdapter.connect(user.signer).transferAndRequestOracleData(FEE_AMOUNT);
      expect(await mockChainlinkToken.balanceOf(user.address)).to.equal(0);

      // Expect the request to have been made via the LINK token transferAndCall() function.
      expect(await mockChainlinkToken._CALLED_WITH_TO_()).to.equal(HARDHAT_MOCK_CHAINLINK_ORACLE_ADDRESS);
      expect(await mockChainlinkToken._CALLED_WITH_VALUE_()).to.equal(FEE_AMOUNT)
    });
  });

  describe('End-to-end Merkle root updates', () => {

    it('Cannot propose root if oracle has not provided a root yet', async () => {
      await expect(merkleDistributor.proposeRoot()).to.be.revertedWith(
        'MD1RootUpdates: Oracle root is zero (unset)',
      );
    });

    it('Updates the root in epoch zero', async () => {
      expect(
        BigNumber.from((await merkleDistributor.getProposedRoot()).merkleRoot)
      ).to.equal(0);

      // Request oracle data.
      await chainlinkAdapter.connect(user.signer).transferAndRequestOracleData(FEE_AMOUNT);

      // The external (off-chain) adapter is expected to call the callback.
      await chainlinkAdapter.connect(oracleExternalAdapter.signer).writeOracleData(
        simpleTreeRoot,
        0,
        MOCK_IPFS_CID,
      );

      // It should now be possible to update the proposed root to the oracle value.
      await expect(merkleDistributor.proposeRoot()).to.emit(merkleDistributor, 'RootProposed');
      const proposedRoot = await merkleDistributor.getProposedRoot();
      expect(proposedRoot.merkleRoot).to.equal(simpleTreeRoot);
      expect(proposedRoot.epoch).to.equal(0);
      expect(proposedRoot.ipfsCid).to.equal(MOCK_IPFS_CID);

      // Allow the waiting period to elapse.
      await incrementTimeToTimestamp((await timeLatest()).plus(waitingPeriod).toNumber());

      // Update the active root.
      await expect(merkleDistributor.updateRoot()).to.emit(merkleDistributor, 'RootUpdated');
      const activeRoot = await merkleDistributor.getActiveRoot();
      expect(activeRoot.merkleRoot).to.equal(simpleTreeRoot);
      expect(activeRoot.epoch).to.equal(0);
      expect(activeRoot.ipfsCid).to.equal(MOCK_IPFS_CID);

      // Make a claim based on the active root.
      const proof = simpleTree.getProof(user.address, tokenSupply);
      await expect(merkleDistributor.connect(user.signer).claimRewards(tokenSupply, proof))
        .to.emit(merkleDistributor, 'RewardsClaimed')
        .withArgs(user.address, tokenSupply);

      // Check balances after.
      expect(await dydxToken.balanceOf(user.address)).to.equal(tokenSupply);
      expect(await dydxToken.balanceOf(rewardsTreasury.address)).to.equal(0);
    });

    it('Proposes the root multiple times in epoch zero', async () => {
      await chainlinkAdapter.connect(user.signer).transferAndRequestOracleData(FEE_AMOUNT);
      await chainlinkAdapter.connect(oracleExternalAdapter.signer).writeOracleData(
        simpleTreeRoot,
        0,
        MOCK_IPFS_CID,
      );
      await expect(merkleDistributor.proposeRoot()).to.emit(merkleDistributor, 'RootProposed');

      // Should throw if oracle root has not changed.
      await expect(merkleDistributor.proposeRoot()).to.be.revertedWith(
        'MD1RootUpdates: Oracle root was already proposed',
      );

      // Update the oracle and proposed root with a different IPFS CID.
      const newIpfsCid = `0x${'0101'.repeat(16)}`;
      await chainlinkAdapter.connect(oracleExternalAdapter.signer).writeOracleData(
        simpleTreeRoot,
        0,
        newIpfsCid,
      );
      await merkleDistributor.proposeRoot();
      expect((await merkleDistributor.getProposedRoot()).ipfsCid).to.equal(newIpfsCid);

      // Should throw when proposing root if oracle epoch number is not correct.
      await chainlinkAdapter.connect(oracleExternalAdapter.signer).writeOracleData(
        simpleTreeRoot,
        1,
        MOCK_IPFS_CID,
      );
      await expect(merkleDistributor.proposeRoot()).to.be.revertedWith(
        'MD1RootUpdates: Oracle epoch is not next root epoch',
      );

      // Promote the proposed root to active root.
      await incrementTimeToTimestamp((await timeLatest()).plus(waitingPeriod).toNumber());
      await merkleDistributor.updateRoot();
      const activeRoot = await merkleDistributor.getActiveRoot();
      expect(activeRoot.merkleRoot).to.equal(simpleTreeRoot);
      expect(activeRoot.epoch).to.equal(0);
      expect(activeRoot.ipfsCid).to.equal(newIpfsCid);
    });

    it('Proposes the root for multiple epochs in sequence', async () => {
      // Tree 1: Give some tokens to two users.
      const tree_1 = new BalanceTree({
        [user.address]: 150,
        [otherUser.address]: 250,
      });
      await chainlinkAdapter.connect(user.signer).transferAndRequestOracleData(FEE_AMOUNT);
      await chainlinkAdapter.connect(oracleExternalAdapter.signer).writeOracleData(
        tree_1.getHexRoot(),
        0,
        MOCK_IPFS_CID,
      );
      await merkleDistributor.proposeRoot();
      await incrementTimeToTimestamp((await timeLatest()).plus(waitingPeriod).toNumber());
      await merkleDistributor.updateRoot();

      // Make a claim for user 1 from tree 1.
      const proof_1_1 = tree_1.getProof(user.address, 150);
      await expect(merkleDistributor.connect(user.signer).claimRewards(150, proof_1_1))
        .to.emit(merkleDistributor, 'RewardsClaimed')
        .withArgs(user.address, 150);
      expect(await dydxToken.balanceOf(user.address)).to.equal(150);

      // Tree 2: Give more tokens to the first user.
      const tree_2 = new BalanceTree({
        [user.address]: 350,
        [otherUser.address]: 250,
      });
      await mockChainlinkToken.mint(user.address, FEE_AMOUNT);
      await chainlinkAdapter.connect(user.signer).transferAndRequestOracleData(FEE_AMOUNT);
      await chainlinkAdapter.connect(oracleExternalAdapter.signer).writeOracleData(
        tree_2.getHexRoot(),
        1,
        MOCK_IPFS_CID,
      );
      await merkleDistributor.proposeRoot();
      await incrementTimeToTimestamp((await timeLatest()).plus(waitingPeriod).toNumber());
      await merkleDistributor.updateRoot();

      // Make a claim for user 1 from tree 2.
      const proof_2_1 = tree_2.getProof(user.address, 350);
      await expect(merkleDistributor.connect(user.signer).claimRewards(350, proof_2_1))
        .to.emit(merkleDistributor, 'RewardsClaimed')
        .withArgs(user.address, 200);
      expect(await dydxToken.balanceOf(user.address)).to.equal(350);

      // Tree 3: Give more tokens to both users.
      const tree_3 = new BalanceTree({
        [user.address]: 500,
        [otherUser.address]: 1000,
      });
      await mockChainlinkToken.mint(user.address, FEE_AMOUNT);
      await chainlinkAdapter.connect(user.signer).transferAndRequestOracleData(FEE_AMOUNT);
      await chainlinkAdapter.connect(oracleExternalAdapter.signer).writeOracleData(
        tree_3.getHexRoot(),
        2,
        MOCK_IPFS_CID,
      );
      await merkleDistributor.proposeRoot();
      await incrementTimeToTimestamp((await timeLatest()).plus(waitingPeriod).toNumber());
      await merkleDistributor.updateRoot();

      // Make a claim for user 2 from tree 3.
      const proof_3_2 = tree_3.getProof(otherUser.address, 1000);
      await expect(merkleDistributor.connect(otherUser.signer).claimRewards(1000, proof_3_2))
        .to.emit(merkleDistributor, 'RewardsClaimed')
        .withArgs(otherUser.address, 1000);
      expect(await dydxToken.balanceOf(otherUser.address)).to.equal(1000);

      // Make a claim for user 1 from tree 3.
      const proof_3_1 = tree_3.getProof(user.address, 500);
      await expect(merkleDistributor.connect(user.signer).claimRewards(500, proof_3_1))
        .to.emit(merkleDistributor, 'RewardsClaimed')
        .withArgs(user.address, 150);
      expect(await dydxToken.balanceOf(user.address)).to.equal(500);
    });
  });
});

async function revertTestChanges(): Promise<void> {
  await evmRevert(snapshots.get(beforeSettingMerkleRoot)!);
  // retake snapshot since each snapshot can only be used once
  snapshots.set(beforeSettingMerkleRoot, await evmSnapshot());
}
