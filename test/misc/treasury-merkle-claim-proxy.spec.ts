import { BigNumber } from 'ethers';
import { expect } from 'chai';

import BalanceTree from '../../src/merkle-tree-helpers/balance-tree';
import {
  DRE,
  evmRevert,
  evmSnapshot,
  incrementTimeToTimestamp,
  timeLatest,
  toWad,
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
import { MockRewardsOracle } from '../../types/MockRewardsOracle';
import { deployMockRewardsOracle } from '../../helpers/contracts-deployments';
import { TreasuryMerkleClaimProxy } from '../../types/TreasuryMerkleClaimProxy';
import { getTreasuryMerkleClaimProxy } from '../../helpers/contracts-getters';
import { Treasury } from '../../types/Treasury';

const MOCK_IPFS_CID = Buffer.from('0'.repeat(64), 'hex');

const snapshots = new Map<string, string>();

const afterUpdatingMerkleRoot: string = 'afterUpdatingMerkleRoot';

makeSuite('dYdX Treasury Merkle Claim Proxy', deployPhase2, (testEnv: TestEnv) => {
  const treasuryMerkleClaimProxyRewards = toWad(1_000);
  const deployerRewards = toWad(777);

  let deployer: SignerWithAddress;
  let treasuryMerkleClaimProxy: TreasuryMerkleClaimProxy;
  let dydxToken: DydxToken;
  let MD1: MerkleDistributorV1;
  let mockRewardsOracle: MockRewardsOracle;
  let simpleTree: BalanceTree;
  let simpleTreeRoot: string;
  let waitingPeriod: number;
  let rewardsTreasury: Treasury;
  let communityTreasury: Treasury;

  before(async () => {
    ({
      deployer,
      dydxToken,
      merkleDistributor: MD1,
      rewardsTreasury,
      communityTreasury,
    } = testEnv);

    const result = await DRE.run('deploy-treasury-merkle-claim-proxy', {
      skipWalletGeneration: true,
    });

    treasuryMerkleClaimProxy = await getTreasuryMerkleClaimProxy({ address: result.treasuryMerkleClaimProxyAddress });

    // Deploy and use mock rewards oracle.
    mockRewardsOracle = await deployMockRewardsOracle();
    await MD1.connect(deployer.signer).setRewardsOracle(mockRewardsOracle.address);

    // Simple tree example that gives tokens to deployer and treasury merkle claim proxy.
    simpleTree = new BalanceTree({
      [deployer.address]: deployerRewards,
      [treasuryMerkleClaimProxy.address]: treasuryMerkleClaimProxyRewards,
    });
    simpleTreeRoot = simpleTree.getHexRoot();

    // Get the waiting period.
    waitingPeriod = (await MD1.WAITING_PERIOD()).toNumber();

    // Advance to the start of epoch zero.
    const epochParameters = await MD1.getEpochParameters();
    await incrementTimeToTimestamp(epochParameters.offset);

    await mockRewardsOracle.setMockValue(
      simpleTreeRoot,
      0,
      MOCK_IPFS_CID,
    );
    await MD1.proposeRoot();
    await incrementTimeToTimestamp((await timeLatest()).plus(waitingPeriod).toNumber());

    // Update the root.
    await expect(MD1.updateRoot()).to.emit(MD1, 'RootUpdated');

    snapshots.set(afterUpdatingMerkleRoot, await evmSnapshot());
  });

  describe('claimRewards', () => {

    afterEach(async () => {
      await revertTestChanges();
    });

    it('can claim rewards when the merkle root is active', async () => {
      const treasuryMerkleClaimProxyBalanceBefore: BigNumber = await dydxToken.balanceOf(treasuryMerkleClaimProxy.address);
      const communityTreasuryBalanceBefore: BigNumber = await dydxToken.balanceOf(communityTreasury.address);
      const rewardsTreasuryBalanceBefore: BigNumber = await dydxToken.balanceOf(rewardsTreasury.address);

      const proof = simpleTree.getProof(treasuryMerkleClaimProxy.address, treasuryMerkleClaimProxyRewards);
      await expect(treasuryMerkleClaimProxy.claimRewards(treasuryMerkleClaimProxyRewards, proof))
        .to.emit(MD1, 'RewardsClaimed')
        .withArgs(treasuryMerkleClaimProxy.address, treasuryMerkleClaimProxyRewards);

      const treasuryMerkleClaimProxyBalanceAfter: BigNumber = await dydxToken.balanceOf(treasuryMerkleClaimProxy.address);
      const communityTreasuryBalanceAfter: BigNumber = await dydxToken.balanceOf(communityTreasury.address);
      const rewardsTreasuryBalanceAfter: BigNumber = await dydxToken.balanceOf(rewardsTreasury.address);

      expect(communityTreasuryBalanceAfter.sub(communityTreasuryBalanceBefore)).to.equal(treasuryMerkleClaimProxyRewards);
      expect(rewardsTreasuryBalanceBefore.sub(rewardsTreasuryBalanceAfter)).to.equal(treasuryMerkleClaimProxyRewards);
      expect(treasuryMerkleClaimProxyBalanceBefore).to.equal(0);
      expect(treasuryMerkleClaimProxyBalanceAfter).to.equal(0);
    });

    it('can not claim rewards twice', async () => {
      const proof = simpleTree.getProof(treasuryMerkleClaimProxy.address, treasuryMerkleClaimProxyRewards);
      await expect(treasuryMerkleClaimProxy.claimRewards(treasuryMerkleClaimProxyRewards, proof))
        .to.emit(MD1, 'RewardsClaimed')
        .withArgs(treasuryMerkleClaimProxy.address, treasuryMerkleClaimProxyRewards);

      const secondClaimAmount = await treasuryMerkleClaimProxy.callStatic.claimRewards(treasuryMerkleClaimProxyRewards, proof);
      expect(secondClaimAmount).to.equal(0);
    });

    it('can not claim rewards with invalid merkle proof', async () => {
      const invalidProof = simpleTree.getProof(deployer.address, deployerRewards);
      await expect(treasuryMerkleClaimProxy.claimRewards(treasuryMerkleClaimProxyRewards, invalidProof))
        .to.be.revertedWith('MD1Claims: Invalid Merkle proof');
    });
  });
});

async function revertTestChanges(): Promise<void> {
  await evmRevert(snapshots.get(afterUpdatingMerkleRoot)!);
  // retake snapshot since each snapshot can only be used once
  snapshots.set(afterUpdatingMerkleRoot, await evmSnapshot());
}
