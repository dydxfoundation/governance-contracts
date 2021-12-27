import { BigNumber, utils } from 'ethers';
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
import { EPOCH_LENGTH, ONE_DAY } from '../../helpers/constants';
import { Treasury } from '../../types/Treasury';
import { MockRewardsOracle } from '../../types/MockRewardsOracle';
import { deployMockRewardsOracle } from '../../helpers/contracts-deployments';
import { sendAllTokensToTreasury } from '../test-helpers/treasury-utils';

const MOCK_IPFS_CID = Buffer.from('0'.repeat(64), 'hex');

const snapshots = new Map<string, string>();

const beforeSettingMerkleRoot: string = 'beforeSettingMerkleRoot';

makeSuite('dYdX Merkle Distributor', deployPhase2, (testEnv: TestEnv) => {
  let deployer: SignerWithAddress;
  let rewardsTreasury: Treasury;
  let dydxToken: DydxToken;
  let MD1: MerkleDistributorV1;
  let mockRewardsOracle: MockRewardsOracle;
  let users: SignerWithAddress[];
  let addrs: string[];
  let treasurySupply: BigNumber;
  let simpleTree: BalanceTree;
  let simpleTreeRoot: string;
  let waitingPeriod: number;

  before(async () => {
    ({
      deployer,
      deployer,
      rewardsTreasury,
      dydxToken,
      merkleDistributor: MD1,
      users,
    } = testEnv);

    addrs = users.map(u => u.address);

    // Deploy and use mock rewards oracle.
    mockRewardsOracle = await deployMockRewardsOracle();
    await MD1.connect(deployer.signer).setRewardsOracle(mockRewardsOracle.address);

    // Send all tokens to the rewards treasury.
    await sendAllTokensToTreasury(testEnv);
    treasurySupply = await dydxToken.balanceOf(rewardsTreasury.address)

    // Simple tree example that gives all tokens to a single address.
    simpleTree = new BalanceTree({
      [addrs[1]]: treasurySupply,
    });
    simpleTreeRoot = simpleTree.getHexRoot();

    // Get the waiting period.
    waitingPeriod = (await MD1.WAITING_PERIOD()).toNumber();

    // Advance to the start of epoch zero.
    const epochParameters = await MD1.getEpochParameters();
    await incrementTimeToTimestamp(epochParameters.offset);
    snapshots.set(beforeSettingMerkleRoot, await evmSnapshot());
  });

  describe('initialization', () => {

    it('Has DYDX as the rewards token', async () => {
      expect(await MD1.REWARDS_TOKEN()).to.equal(dydxToken.address);
    });

    it('Has epoch of zero, after advancing to the offset timestamp', async () => {
      expect(await MD1.getCurrentEpoch()).to.equal(0);
    });

    it('Has waiting period of seven days', async () => {
      expect(await MD1.WAITING_PERIOD()).to.equal(ONE_DAY.times(7).toString());
    });

    it('Deployer has roles, and owner is admin of all roles', async () => {
      const roles: string[] = await Promise.all([
        MD1.OWNER_ROLE(),
        MD1.PAUSER_ROLE(),
        MD1.UNPAUSER_ROLE(),
      ]);

      // Deployer should have owner role
      expect(await MD1.hasRole(await MD1.OWNER_ROLE(), deployer.address)).to.be.true;

      // OWNER_ROLE should be admin for all other roles.
      const ownerRole: string = roles[0];
      for (const role of roles) {
        expect(await MD1.getRoleAdmin(role)).to.equal(ownerRole);
      }
    });
  });

  describe('proposeRoot', () => {

    afterEach(async () => {
      await revertTestChanges();
    });

    it('succeeds for the epoch zero root', async () => {
      // Check getters.
      expect(await MD1.hasPendingRoot()).to.be.false;
      expect(await MD1.canUpdateRoot()).to.be.false;
      expect(await MD1.getNextRootEpoch()).to.equal(0);

      await mockRewardsOracle.setMockValue(
        simpleTreeRoot,
        0,
        MOCK_IPFS_CID,
      );
      await expect(MD1.proposeRoot()).to.emit(MD1, 'RootProposed');

      // Check getters.
      expect(await MD1.hasPendingRoot()).to.be.true;
      expect(await MD1.canUpdateRoot()).to.be.false;
      expect(await MD1.getNextRootEpoch()).to.equal(0);

      // Do it again with a different IPFS CID.
      await mockRewardsOracle.setMockValue(
        simpleTreeRoot,
        0,
        Buffer.from('1'.repeat(64), 'hex'),
      );
      await expect(MD1.proposeRoot()).to.emit(MD1, 'RootProposed');

      // Check getters.
      expect(await MD1.hasPendingRoot()).to.be.true;
      expect(await MD1.canUpdateRoot()).to.be.false;
      expect(await MD1.getNextRootEpoch()).to.equal(0);
    });

    it('reverts if the same params were already proposed', async () => {
      await mockRewardsOracle.setMockValue(
        simpleTreeRoot,
        0,
        MOCK_IPFS_CID,
      );
      await MD1.proposeRoot();
      await expect(MD1.proposeRoot()).to.be.revertedWith(
        'MD1RootUpdates: Oracle root was already proposed',
      );
    });

    it('reverts if the oracle root is zero', async () => {
      await expect(MD1.proposeRoot()).to.be.revertedWith(
        'MD1RootUpdates: Oracle root is zero'
      );
    });

    it('reverts, for the first proposed root, if the epoch number is not zero', async () => {
      await mockRewardsOracle.setMockValue(
        simpleTreeRoot,
        1,
        MOCK_IPFS_CID,
      );
      await expect(MD1.proposeRoot()).to.be.revertedWith(
        'MD1RootUpdates: Oracle epoch is not next root epoch',
      );
    });
  });

  describe('updateRoot', () => {

    afterEach(async () => {
      await revertTestChanges();
    });

    it('can update the root after the waiting period has elapsed', async () => {
      await mockRewardsOracle.setMockValue(
        simpleTreeRoot,
        0,
        MOCK_IPFS_CID,
      );
      await MD1.proposeRoot();
      await incrementTimeToTimestamp((await timeLatest()).plus(waitingPeriod).toNumber());

      // Check getters.
      expect(await MD1.hasPendingRoot()).to.be.true;
      expect(await MD1.canUpdateRoot()).to.be.true;
      expect(await MD1.getNextRootEpoch()).to.equal(0);

      // Update the root.
      await expect(MD1.updateRoot()).to.emit(MD1, 'RootUpdated');

      // Check getters.
      expect(await MD1.hasPendingRoot()).to.be.false;
      expect(await MD1.canUpdateRoot()).to.be.false;
      expect(await MD1.getNextRootEpoch()).to.equal(1);
    });

    it('reverts if no root was proposed', async () => {
      await expect(MD1.updateRoot()).to.be.revertedWith(
        'MD1RootUpdates: Proposed root is zero',
      );
    });

    it('reverts if the waiting period has not elapsed', async () => {
      await mockRewardsOracle.setMockValue(
        simpleTreeRoot,
        0,
        MOCK_IPFS_CID,
      );
      await MD1.proposeRoot();
      await expect(MD1.updateRoot()).to.be.revertedWith(
        'MD1RootUpdates: Waiting period has not elapsed',
      );

      // Check that it also fails after waiting a while, less than the waiting period.
      const waitDuration = waitingPeriod - 300;
      await incrementTimeToTimestamp((await timeLatest()).plus(waitDuration).toNumber());
      await expect(MD1.updateRoot()).to.be.revertedWith(
        'MD1RootUpdates: Waiting period has not elapsed',
      );
    });

    it('reverts if the root was already updated for that epoch', async () => {
      // Should succeed first, after the waiting period.
      await mockRewardsOracle.setMockValue(simpleTreeRoot, 0, MOCK_IPFS_CID);
      await MD1.proposeRoot();
      await incrementTimeToTimestamp((await timeLatest()).plus(waitingPeriod).toNumber());
      await MD1.updateRoot();

      // Second call should fail.
      await expect(MD1.updateRoot()).to.be.revertedWith(
        'MD1RootUpdates: Proposed epoch is not next root epoch',
      );
    });
  });

  describe('setAlwaysAllowClaimsFor', () => {

    afterEach(async () => {
      await revertTestChanges();
    });

    it('Allows user to set their status on the allowlist', async () => {
      await expect(
        MD1.connect(users[1].signer).setAlwaysAllowClaimsFor(true)
      ).to.emit(MD1, 'AlwaysAllowClaimForUpdated').withArgs(addrs[1], true);
      expect(await MD1.getAlwaysAllowClaimsFor(addrs[1])).to.be.true;
      await expect(
        MD1.connect(users[1].signer).setAlwaysAllowClaimsFor(false)
      ).to.emit(MD1, 'AlwaysAllowClaimForUpdated').withArgs(addrs[1], false);
      expect(await MD1.getAlwaysAllowClaimsFor(addrs[1])).to.be.false;
    });
  });

  describe('setEpochParameters', () => {

    afterEach(async () => {
      await revertTestChanges();
    });

    it('Allows CONFIG_UPDATER_ROLE to set the epoch parameters', async () => {
      const configUpdaterRoleHash: string = utils.keccak256(utils.toUtf8Bytes('CONFIG_UPDATER_ROLE'));
      const configUpdater: SignerWithAddress = users[0];
      await MD1.grantRole(configUpdaterRoleHash, configUpdater.address);

      const currentEpoch = await MD1.getCurrentEpoch();
      const currentTimestamp = await timeLatest();
      expect(currentEpoch).to.equal(0);
      const newOffset = currentTimestamp.minus(EPOCH_LENGTH.toNumber() * 3).toNumber();
      await expect(MD1.connect(configUpdater.signer).setEpochParameters(
        EPOCH_LENGTH,
        newOffset,
      )).to.emit(MD1, 'EpochScheduleUpdated').withArgs([ EPOCH_LENGTH, newOffset ]);
      const newEpoch = await MD1.getCurrentEpoch();
      expect(newEpoch).to.equal(3);
    });
  });

  describe('setRewardsOracle', () => {

    afterEach(async () => {
      await revertTestChanges();
    });

    it('Allow owner to set the rewards oracle address', async () => {
      await expect(MD1.connect(deployer.signer).setRewardsOracle(
        users[1].address,
      )).to.emit(MD1, 'RewardsOracleChanged').withArgs(users[1].address);
      const newOracle = await MD1.getRewardsOracle();
      expect(newOracle).to.equal(users[1].address);
      await expect(MD1.proposeRoot()).to.be.revertedWith('function call to a non-contract account');
    });
  });

  describe('while root updates are paused', () => {

    afterEach(async () => {
      await revertTestChanges();
    });

    beforeEach(async () => {
      // Set a proposed root.
      await mockRewardsOracle.setMockValue(
        simpleTreeRoot,
        0,
        MOCK_IPFS_CID,
      );
      await expect(MD1.proposeRoot()).to.emit(MD1, 'RootProposed');

      // Advance past the waiting period.
      await incrementTimeToTimestamp((await timeLatest()).plus(waitingPeriod).toNumber());

      // Then, pause root updates.
      await MD1.grantRole(await MD1.PAUSER_ROLE(), deployer.address);
      await MD1.pauseRootUpdates();
    });

    it('can update the proposed root', async () => {
      // Set a new IPFS CID.
      await mockRewardsOracle.setMockValue(
        simpleTreeRoot,
        0,
        Buffer.from('1'.repeat(64), 'hex'),
      );
      await expect(MD1.proposeRoot()).to.emit(MD1, 'RootProposed');
    });

    it('cannot update the active root', async () => {
      await expect(MD1.updateRoot()).to.be.revertedWith('MD1Pausable: Updates paused');
    });

    it('returns false from canUpdateRoot()', async () => {
      expect(await MD1.canUpdateRoot()).to.be.false;
    });

    it('can update the active root immediately after unpausing', async () => {
      await MD1.grantRole(await MD1.UNPAUSER_ROLE(), deployer.address);
      await MD1.unpauseRootUpdates();
      await expect(MD1.updateRoot()).to.emit(MD1, 'RootUpdated');
    });
  });

  describe('claimRewards', () => {

    afterEach(async () => {
      await revertTestChanges();
    });

    it('Fails when rewards treasury does not have enough tokens to send user', async () => {
      // Set up Merkle tree.
      const amount = treasurySupply.add(1);
      const tree = new BalanceTree({
        [addrs[1]]: amount,
      });
      await mockRewardsOracle.setMockValue(tree.getHexRoot(), 0, MOCK_IPFS_CID);
      await MD1.proposeRoot();
      await incrementTimeToTimestamp((await timeLatest()).plus(waitingPeriod).toNumber());
      await MD1.updateRoot();

      // Try to claim rewards.
      const proof = tree.getProof(addrs[1], amount);
      await expect(MD1.connect(users[1].signer).claimRewards(amount, proof))
        .to.be.revertedWith('SafeERC20: low-level call failed')
    });

    describe('Default empty merkle tree', () => {

      it('cannot claim rewards', async () => {
        await expect(MD1.connect(users[1].signer).claimRewards(0, [])).to.be.revertedWith(
          'MD1Claims: Invalid Merkle proof',
        );
      });
    });

    describe('One-account merkle tree', () => {

      let proof: Buffer[]

      beforeEach(async () => {
        // Set the root on the contract.
        await mockRewardsOracle.setMockValue(simpleTreeRoot, 0, MOCK_IPFS_CID);
        await MD1.proposeRoot();
        await incrementTimeToTimestamp((await timeLatest()).plus(waitingPeriod).toNumber());
        await MD1.updateRoot();
        proof = simpleTree.getProof(addrs[1], treasurySupply);
      });

      afterEach(async () => {
        await revertTestChanges();
      });

      it('Succeeds when merkle tree sends all tokens to user', async () => {
        await expect(MD1.connect(users[1].signer).claimRewards(treasurySupply, proof))
          .to.emit(MD1, 'RewardsClaimed')
          .withArgs(addrs[1], treasurySupply);

        // Check balances after.
        expect(await dydxToken.balanceOf(addrs[1])).to.equal(treasurySupply);
        expect(await dydxToken.balanceOf(rewardsTreasury.address)).to.equal(0);
      });

      it('Cannot normally claim on behalf of another user', async () => {
        await expect(
          MD1.connect(users[2].signer).claimRewardsFor(addrs[1], treasurySupply, proof),
        ).to.be.revertedWith(
          'MD1Claims: Do not have permission to claim for this user',
        );
      });

      it('Can claim on behalf of a user on the allowlist', async () => {
        await MD1.connect(users[1].signer).setAlwaysAllowClaimsFor(true);
        await MD1.connect(users[2].signer).claimRewardsFor(addrs[1], treasurySupply, proof);
        expect(await dydxToken.balanceOf(addrs[1])).to.equal(treasurySupply);
      });

      it('Cannot claim on behalf of a user removed from the allowlist', async () => {
        await MD1.connect(users[1].signer).setAlwaysAllowClaimsFor(true);
        await MD1.connect(users[1].signer).setAlwaysAllowClaimsFor(false);
        await expect(
          MD1.connect(users[2].signer).claimRewardsFor(addrs[1], treasurySupply, proof),
        ).to.be.revertedWith(
          'MD1Claims: Do not have permission to claim for this user',
        );
      });
    });

    describe('Four-account merkle tree', () => {
      let tree: BalanceTree;
      let merkleRoot: string;

      before(() => {
        tree = new BalanceTree({
          [addrs[1]]: BigNumber.from(100),
          [addrs[2]]: BigNumber.from(101),
          [addrs[3]]: BigNumber.from(102),
          [addrs[4]]: BigNumber.from(103),
        })
        merkleRoot = tree.getHexRoot();
      });

      beforeEach(async () => {
        // Set the root on the contract.
        await mockRewardsOracle.setMockValue(tree.getHexRoot(), 0, MOCK_IPFS_CID);
        await MD1.proposeRoot();
        await incrementTimeToTimestamp((await timeLatest()).plus(waitingPeriod).toNumber());
        await MD1.updateRoot();
      });

      it('successful claim for multiple users', async () => {
        const proof0 = tree.getProof(addrs[1], BigNumber.from(100));
        await expect(MD1.connect(users[1].signer).claimRewards(100, proof0))
          .to.emit(MD1, 'RewardsClaimed')
          .withArgs(addrs[1], 100);
        const proof1 = tree.getProof(addrs[2], BigNumber.from(101));
        await expect(MD1.connect(users[2].signer).claimRewards(101, proof1))
          .to.emit(MD1, 'RewardsClaimed')
          .withArgs(addrs[2], 101);

        expect(await dydxToken.balanceOf(addrs[1])).to.equal(100);
        expect(await dydxToken.balanceOf(addrs[2])).to.equal(101);
        expect(await dydxToken.balanceOf(addrs[3])).to.equal(0);
        expect(await dydxToken.balanceOf(addrs[4])).to.equal(0);
        expect(await dydxToken.balanceOf(rewardsTreasury.address)).to.equal(treasurySupply.sub(201));
      })

      it('successful claim for multiple users after setting new root', async () => {
        // claim addrs[1] and addrs[3] tokens
        const proof0 = tree.getProof(addrs[1], BigNumber.from(100));
        await expect(MD1.connect(users[1].signer).claimRewards(100, proof0))
          .to.emit(MD1, 'RewardsClaimed')
          .withArgs(addrs[1], 100);

        const proof2 = tree.getProof(addrs[3], BigNumber.from(102));
        await expect(MD1.connect(users[3].signer).claimRewards(102, proof2))
          .to.emit(MD1, 'RewardsClaimed')
          .withArgs(addrs[3], 102);

        // create new merkle tree and verify the following scenarios:
        // addrs[1] can claim and receives more tokens in epoch 2 after claiming tokens in epoch 1
        // addrs[2] can claim after not claiming tokens in epoch 1
        // addrs[3] has nothing to claim after claiming tokens in epoch 1
        // addrs[4] can claim and receives more tokens in epoch 2 after not claiming tokens in epoch 1
        // addrs[5] can claim tokens and receives tokens in epoch 2 after not receiving tokens in epoch 1
        const newTree = new BalanceTree({
          // addrs[1] got 100 in epoch 1 + 100 in epoch 2
          [addrs[1]]: BigNumber.from(200),
          // addrs[2] got 101 in epoch 1 + 0 in epoch 2
          [addrs[2]]: BigNumber.from(101),
          // addrs[3] got 102 in epoch 1 + 0 in epoch 2
          [addrs[3]]: BigNumber.from(102),
          // addrs[4] got 103 in epoch 1 + 100 in epoch 2
          [addrs[4]]: BigNumber.from(203),
          // addrs[4] got 0 in epoch 1 + 104 in epoch 2
          [addrs[5]]: BigNumber.from(104),
        })
        const merkleRoot = newTree.getHexRoot();

        // Set new root.
        await mockRewardsOracle.setMockValue(merkleRoot, 1, MOCK_IPFS_CID);
        await MD1.proposeRoot();
        await incrementTimeToTimestamp((await timeLatest()).plus(waitingPeriod).toNumber());
        await MD1.updateRoot();

        const newProof0 = newTree.getProof(addrs[1], BigNumber.from(200));
        await expect(MD1.connect(users[1].signer).claimRewards(200, newProof0))
          .to.emit(MD1, 'RewardsClaimed')
          .withArgs(addrs[1], 100);
        const newProof1 = newTree.getProof(addrs[2], BigNumber.from(101));
        await expect(MD1.connect(users[2].signer).claimRewards(101, newProof1))
          .to.emit(MD1, 'RewardsClaimed')
          .withArgs(addrs[2], 101);
        const newProof2 = newTree.getProof(addrs[3], BigNumber.from(102));
        await expect(MD1.connect(users[3].signer).claimRewards(102, newProof2))
          .not.to.emit(MD1, 'RewardsClaimed')
        const newProof3 = newTree.getProof(addrs[4], BigNumber.from(203));
        await expect(MD1.connect(users[4].signer).claimRewards(203, newProof3))
          .to.emit(MD1, 'RewardsClaimed')
          .withArgs(addrs[4], 203);
        const newProof4 = newTree.getProof(addrs[5], BigNumber.from(104));
        await expect(MD1.connect(users[5].signer).claimRewards(104, newProof4))
          .to.emit(MD1, 'RewardsClaimed')
          .withArgs(addrs[5], 104);

        expect(await dydxToken.balanceOf(addrs[1])).to.equal(200);
        expect(await dydxToken.balanceOf(addrs[2])).to.equal(101);
        expect(await dydxToken.balanceOf(addrs[3])).to.equal(102);
        expect(await dydxToken.balanceOf(addrs[4])).to.equal(203);
        expect(await dydxToken.balanceOf(addrs[5])).to.equal(104);
        expect(await dydxToken.balanceOf(rewardsTreasury.address))
        .to.equal(treasurySupply.sub(200 + 101 + 102 + 203 + 104));
      })

      it('user cannot claim with invalid cumulativeAmount', async () => {
        const proof0 = tree.getProof(addrs[1], BigNumber.from(100));

        await expect(MD1.connect(users[1].signer).claimRewards(101, proof0))
          .to.be.revertedWith('MD1Claims: Invalid Merkle proof');
      })

      it('user cannot claim with invalid merkle proof', async () => {
        const proof1 = tree.getProof(addrs[2], BigNumber.from(101));

        await expect(MD1.connect(users[1].signer).claimRewards(101, proof1))
          .to.be.revertedWith('MD1Claims: Invalid Merkle proof');
      })
    });
  });
});

async function revertTestChanges(): Promise<void> {
  await evmRevert(snapshots.get(beforeSettingMerkleRoot)!);
  // retake snapshot since each snapshot can only be used once
  snapshots.set(beforeSettingMerkleRoot, await evmSnapshot());
}
