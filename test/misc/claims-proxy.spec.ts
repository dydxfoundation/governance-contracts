import { expect, use } from 'chai';
import { BigNumber, BigNumberish } from 'ethers';
import { solidity } from 'ethereum-waffle';

import BalanceTree from '../../src/merkle-tree-helpers/balance-tree';
import {
  evmRevert,
  evmSnapshot,
  increaseTimeAndMine,
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
import { ClaimsProxy } from '../../types/ClaimsProxy';
import { DydxToken } from '../../types/DydxToken';
import { LiquidityStakingV1 } from '../../types/LiquidityStakingV1';
import { MAX_UINT_AMOUNT } from '../../helpers/constants';
import { SafetyModuleV1 } from '../../types/SafetyModuleV1';
import { MintableErc20 } from '../../types/MintableErc20';
import { deployMockRewardsOracle } from '../../helpers/contracts-deployments';
import { MockRewardsOracle } from '../../types/MockRewardsOracle';

const MOCK_IPFS_CID = Buffer.from('0'.repeat(64), 'hex');

const snapshots = new Map<string, string>();
const afterSetup: string = 'afterSetup';

const SAFETY_STAKE: number = 400_000;
const LIQUIDITY_STAKE: number = 1_000_000;
const MERKLE_DISTRIBUTOR_BALANCE: number = 1_600_000;

makeSuite('Claims Proxy', deployPhase2, (testEnv: TestEnv) => {
  let deployer: SignerWithAddress;
  let rewardsTreasury: SignerWithAddress;
  let mockRewardsOracle: MockRewardsOracle;
  let claimsProxy: ClaimsProxy;
  let dydxToken: DydxToken;
  let users: SignerWithAddress[];
  let addrs: string[];

  // Safety module.
  let safetyModule: SafetyModuleV1;
  let safetyDistributionStart: string;

  // Liquidity staking.
  let liquidityStaking: LiquidityStakingV1;
  let mockStakedToken: MintableErc20;

  // Merkle distributor.
  let merkleDistributor: MerkleDistributorV1;
  let merkleSimpleTree: BalanceTree;
  let merkleWaitingPeriod: number;

  before(async () => {
    ({
      deployer,
      rewardsTreasury,
      claimsProxy,
      dydxToken,
      safetyModule,
      mockStakedToken,
      merkleDistributor,
      liquidityStaking,
      users,
    } = testEnv);

    addrs = users.map(u => u.address);

    // ============ Safety Module ============

    expect(await safetyModule.STAKED_TOKEN()).to.be.equal(dydxToken.address);
    expect(await safetyModule.REWARDS_TOKEN()).to.be.equal(dydxToken.address);

    safetyDistributionStart = (await safetyModule.DISTRIBUTION_START()).toString();

    // Mint token to the user and set their allowance on the contract.
    await dydxToken.connect(deployer.signer).transfer(addrs[1], SAFETY_STAKE);
    await dydxToken.connect(users[1].signer).approve(safetyModule.address, SAFETY_STAKE);

    // Set allowance for safety module to pull from the rewards vault.
    await dydxToken.connect(rewardsTreasury.signer).approve(safetyModule.address, MAX_UINT_AMOUNT)

    // Set rewards emission rate.
    await safetyModule.setRewardsPerSecond(15);

    await safetyModule.grantRole(await safetyModule.CLAIM_OPERATOR_ROLE(), claimsProxy.address);

    // ============ Liquidity Staking ============

    expect(await liquidityStaking.REWARDS_TOKEN()).to.be.equal(dydxToken.address);

    // Mint token to the user and set their allowance on the contract.
    await mockStakedToken.mint(addrs[1], LIQUIDITY_STAKE);
    await mockStakedToken.connect(users[1].signer).approve(liquidityStaking.address, LIQUIDITY_STAKE);

    // Set rewards emission rate.
    await liquidityStaking.setRewardsPerSecond(25);

    await liquidityStaking.grantRole(await liquidityStaking.CLAIM_OPERATOR_ROLE(), claimsProxy.address);

    // ============ Merkle Distributor ============

    // Deploy and use mock rewards oracle.
    mockRewardsOracle = await deployMockRewardsOracle();
    await merkleDistributor.connect(deployer.signer).setRewardsOracle(mockRewardsOracle.address);

    expect(await merkleDistributor.REWARDS_TOKEN()).to.be.equal(dydxToken.address);

    // Simple tree example that gives all tokens to a single address.
    merkleSimpleTree = new BalanceTree({
      [addrs[1]]: BigNumber.from(MERKLE_DISTRIBUTOR_BALANCE),
    });

    // Get the waiting period.
    merkleWaitingPeriod = (await merkleDistributor.WAITING_PERIOD()).toNumber();

    await merkleDistributor.grantRole(await merkleDistributor.CLAIM_OPERATOR_ROLE(), claimsProxy.address);

    // Send tokens to rewards treasury vester
    await dydxToken.transfer(testEnv.rewardsTreasuryVester.address, toWad(100_000_000));

    // Advance to the start of safety module rewards (safety module rewards start after liquidity module rewards).
    await incrementTimeToTimestamp(safetyDistributionStart);

    snapshots.set(afterSetup, await evmSnapshot());
  });

  describe('claimRewards', () => {
    afterEach(async () => {
      await revertTestChanges();
    });

    it('claims from safety module only', async () => {
      await safetyModule.connect(users[1].signer).stake(SAFETY_STAKE)
      await increaseTimeAndMine(1000);

      const balanceBefore = await dydxToken.balanceOf(addrs[1]);
      await expect(
        claimsProxy.connect(users[1].signer).claimRewards(
          true,
          false,
          0,
          [],
          false,
        ))
        .to.emit(safetyModule, 'ClaimedRewards');

      // Check balance after.
      const balanceAfter = await dydxToken.balanceOf(addrs[1]);
      const diff = balanceAfter.sub(balanceBefore);
      expect(diff).not.to.equal(0);
    });

    it('claims from liquidity module only', async () => {
      await liquidityStaking.connect(users[1].signer).stake(LIQUIDITY_STAKE);
      await increaseTimeAndMine(1000);

      const balanceBefore = await dydxToken.balanceOf(addrs[1]);
      await expect(
        claimsProxy.connect(users[1].signer).claimRewards(
          false,
          true,
          0,
          [],
          false,
        ))
        .to.emit(liquidityStaking, 'ClaimedRewards');

      // Check balance after.
      const balanceAfter = await dydxToken.balanceOf(addrs[1]);
      const diff = balanceAfter.sub(balanceBefore);
      const error = diff.sub(25000).abs().toNumber();
      expect(error).to.be.lte(50);
    });

    it('claims from Merkle distributor only', async () => {
      // Set up Merkle tree.
      await mockRewardsOracle.setMockValue(merkleSimpleTree.getHexRoot(), 0, MOCK_IPFS_CID);
      await merkleDistributor.proposeRoot();
      await incrementTimeToTimestamp((await timeLatest()).plus(merkleWaitingPeriod).toNumber());
      await merkleDistributor.updateRoot();

      // Claim rewards.
      const balanceBefore = await dydxToken.balanceOf(addrs[1]);
      const proof = merkleSimpleTree.getProof(addrs[1], BigNumber.from(MERKLE_DISTRIBUTOR_BALANCE));
      await expect(
        claimsProxy.connect(users[1].signer).claimRewards(
          false,
          false,
          MERKLE_DISTRIBUTOR_BALANCE,
          proof,
          false,
        ))
        .to.emit(merkleDistributor, 'RewardsClaimed')
        .withArgs(addrs[1], MERKLE_DISTRIBUTOR_BALANCE);

      // Check balance after.
      const balanceAfter = await dydxToken.balanceOf(addrs[1]);
      const diff = balanceAfter.sub(balanceBefore);
      expect(diff).to.equal(MERKLE_DISTRIBUTOR_BALANCE);
    });

    it('claims from all contracts', async () => {
      // Set up Merkle tree.
      await mockRewardsOracle.setMockValue(merkleSimpleTree.getHexRoot(), 0, MOCK_IPFS_CID);
      await merkleDistributor.proposeRoot();
      await incrementTimeToTimestamp((await timeLatest()).plus(merkleWaitingPeriod).toNumber());
      await merkleDistributor.updateRoot();

      // Stake in both staking contracts and elapse time.
      await safetyModule.connect(users[1].signer).stake(SAFETY_STAKE)
      await liquidityStaking.connect(users[1].signer).stake(LIQUIDITY_STAKE);
      await increaseTimeAndMine(1000);

      // Claim rewards.
      const balanceBefore = await dydxToken.balanceOf(addrs[1]);
      const proof = merkleSimpleTree.getProof(addrs[1], BigNumber.from(MERKLE_DISTRIBUTOR_BALANCE));
      await expect(
        claimsProxy.connect(users[1].signer).claimRewards(
          true,
          true,
          MERKLE_DISTRIBUTOR_BALANCE,
          proof,
          false,
        ))
        .to.emit(safetyModule, 'ClaimedRewards')
        .to.emit(liquidityStaking, 'ClaimedRewards')
        .to.emit(merkleDistributor, 'RewardsClaimed');

      // Check balance after.
      const balanceAfter = await dydxToken.balanceOf(addrs[1]);
      const diff = balanceAfter.sub(balanceBefore);
      const error = diff.sub(MERKLE_DISTRIBUTOR_BALANCE + 15000 + 25000).abs().toNumber();
      expect(error).to.be.lte(100);
    });

    it('Vests from rewards treasury vester and claims from all contracts', async () => {
      // Set up Merkle tree so that 100% of rewards treasury balance is sent to addrs[1].
      const rewardsTreasuryBalance: BigNumber = await dydxToken.balanceOf(rewardsTreasury.address);
      merkleSimpleTree = new BalanceTree({
        [addrs[1]]: rewardsTreasuryBalance,
      });
      await mockRewardsOracle.setMockValue(merkleSimpleTree.getHexRoot(), 0, MOCK_IPFS_CID);
      await merkleDistributor.proposeRoot();
      await incrementTimeToTimestamp((await timeLatest()).plus(merkleWaitingPeriod).toNumber());
      await merkleDistributor.updateRoot();

      // Stake in both staking contracts and elapse time.
      await safetyModule.connect(users[1].signer).stake(SAFETY_STAKE)
      await liquidityStaking.connect(users[1].signer).stake(LIQUIDITY_STAKE);
      await increaseTimeAndMine(10);

      // Claim rewards.
      const proof = merkleSimpleTree.getProof(addrs[1], rewardsTreasuryBalance);

      // expect TX to fail because rewards treasury underfunded
      await expect(
        claimsProxy.connect(users[1].signer).claimRewards(
          true,
          true,
          rewardsTreasuryBalance,
          proof,
          false,
        )).to.be.revertedWith(
        'SafeERC20: low-level call failed'
      );

      // expect TX to succeed because we vest additional funds from rewards treasury vester
      await expect(
        claimsProxy.connect(users[1].signer).claimRewards(
          true,
          true,
          rewardsTreasuryBalance,
          proof,
          true,
        ))
        .to.emit(safetyModule, 'ClaimedRewards')
        .to.emit(liquidityStaking, 'ClaimedRewards')
        .to.emit(merkleDistributor, 'RewardsClaimed')
        .to.emit(dydxToken, 'Transfer');
    });
  });
});

async function revertTestChanges(): Promise<void> {
  await evmRevert(snapshots.get(afterSetup)!);
  // retake snapshot since each snapshot can be used once
  snapshots.set(afterSetup, await evmSnapshot());
}

async function incrementTimeToTimestamp(timestampString: BigNumberish): Promise<void> {
  const latestBlockTimestamp = (await timeLatest()).toNumber();
  const timestamp = BigNumber.from(timestampString);
  // we can increase time in this method, assert that user isn't trying to move time backwards
  expect(latestBlockTimestamp).to.be.at.most(timestamp.toNumber());
  const timestampDiff = timestamp.sub(latestBlockTimestamp).toNumber();
  await increaseTimeAndMine(timestampDiff);
}
