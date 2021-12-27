import BNJS from 'bignumber.js';
import { expect } from 'chai';
import { BigNumber, BigNumberish } from 'ethers';
import axios from 'axios';
import sinon from 'sinon';

import BalanceTree from '../../src/merkle-tree-helpers/balance-tree';
import {
  DRE,
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
import { ipfsBytesHash, MAX_UINT_AMOUNT, EPOCH_LENGTH } from '../../helpers/constants';
import { MintableErc20 } from '../../types/MintableErc20';
import { SafetyModuleV1 } from '../../types/SafetyModuleV1';
import { DYDX_TOKEN_DECIMALS, Network, TxBuilder } from '../../src';
import { sendTransactions } from '../test-helpers/tx-builder';
import { MockRewardsOracle } from '../../types/MockRewardsOracle';
import { deployMockRewardsOracle } from '../../helpers/contracts-deployments';

const snapshots = new Map<string, string>();
const afterSetup: string = 'afterSetup';

const SAFETY_STAKE: number = 400_000;
const LIQUIDITY_STAKE: number = 1_000_000;
const MERKLE_DISTRIBUTOR_BALANCE: number = 1_600_000;

makeSuite('TxBuilder.claimsProxyService', deployPhase2, (testEnv: TestEnv) => {
  let deployer: SignerWithAddress;
  let rewardsTreasury: SignerWithAddress;
  let claimsProxy: ClaimsProxy;
  let dydxToken: DydxToken;
  let mockRewardsOracle: MockRewardsOracle;
  let addrs: string[];
  let users: SignerWithAddress[];

  // TX builder..
  let txBuilder: TxBuilder;

  // Safety module.
  let safetyModule: SafetyModuleV1;

  // Liquidity staking.
  let liquidityStaking: LiquidityStakingV1;
  let mockStakedToken: MintableErc20;
  let liquidityDistributionStart: string;
  let safetyDistributionStart: string;

  // Merkle distributor.
  let merkleDistributor: MerkleDistributorV1;
  let merkleSimpleTree: BalanceTree;
  let merkleWaitingPeriod: number;
  let axiosStub: sinon.SinonStub;

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

    // Create TxBuilder for sending transactions.
    txBuilder = new TxBuilder({
      network: Network.hardhat,
      hardhatLiquidityModuleAddresses: {
        LIQUIDITY_MODULE_ADDRESS: liquidityStaking.address,
      },
      hardhatSafetyModuleAddresses: {
        SAFETY_MODULE_ADDRESS: safetyModule.address,
      },
      hardhatMerkleDistributorAddresses: {
        MERKLE_DISTRIBUTOR_ADDRESS: merkleDistributor.address,
      },
      hardhatClaimsProxyAddresses: {
        CLAIMS_PROXY_ADDRESS: claimsProxy.address,
      },
      injectedProvider: DRE.ethers.provider,
    });

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

    liquidityDistributionStart = (await liquidityStaking.DISTRIBUTION_START()).toString();

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

    // send tokens to rewards treasury vester
    await dydxToken.transfer(testEnv.rewardsTreasuryVester.address, toWad(100_000_000));

    // Advance to the start of safety module rewards (safety module rewards start after liquidity module rewards).
    await incrementTimeToTimestamp(safetyDistributionStart);

    // mock out IPFS response
    axiosStub = sinon.stub(axios, 'get');
    axiosStub.returns({ data: [[addrs[1], MERKLE_DISTRIBUTOR_BALANCE]] });

    snapshots.set(afterSetup, await evmSnapshot());
  });

  afterEach(async () => {
    await revertTestChanges();
  });

  after(() => {
    axiosStub.restore();
  });

  it('claims from safety module only', async () => {
    // Setup: stake funds and wait for rewards to accumulate.
    await safetyModule.connect(users[1].signer).stake(SAFETY_STAKE)
    await increaseTimeAndMine(1000);

    // Get expected rewards.
    const claimableHumanUnits = await txBuilder.claimsProxyService.getUserUnclaimedRewards(addrs[1]);
    const claimable = new BNJS(claimableHumanUnits).shiftedBy(DYDX_TOKEN_DECIMALS).toNumber();
    expect(claimable).not.to.equal(0);

    // Claim rewards.
    const balanceBefore = await dydxToken.balanceOf(addrs[1]);
    const txs = await txBuilder.claimsProxyService.claimRewards(addrs[1]);
    await sendTransactions(txs, users[1]);

    // Check the change in balance.
    const balanceAfter = await dydxToken.balanceOf(addrs[1]);
    const diff = balanceAfter.sub(balanceBefore);
    expect(diff).not.to.equal(0);
    expect(diff.toNumber()).to.be.closeTo(claimable, 45);
  });

  it('claims from liquidity module only', async () => {
    // Setup: stake funds for an epoch, then let the funds become inactive.
    await liquidityStaking.connect(users[1].signer).stake(LIQUIDITY_STAKE);
    await liquidityStaking.connect(users[1].signer).requestWithdrawal(LIQUIDITY_STAKE);
    const remaining = await liquidityStaking.getTimeRemainingInCurrentEpoch();
    await increaseTimeAndMine(remaining.toNumber());

    // Get expected rewards.
    const claimableHumanUnits = await txBuilder.claimsProxyService.getUserUnclaimedRewards(addrs[1]);
    const claimable = new BNJS(claimableHumanUnits).shiftedBy(DYDX_TOKEN_DECIMALS).toNumber();
    expect(claimable).not.to.equal(0);

    // Claim rewards.
    const balanceBefore = await dydxToken.balanceOf(addrs[1]);
    const txs = await txBuilder.claimsProxyService.claimRewards(addrs[1]);
    await sendTransactions(txs, users[1]);

    // Check the change in balance.
    const balanceAfter = await dydxToken.balanceOf(addrs[1]);
    const diff = balanceAfter.sub(balanceBefore);
    expect(diff).to.equal(claimable);
  });

  describe('with Merkle distributor rewards', async () => {

    let userRewardsAddress: string;

    beforeEach(async () => {
      // Set up Merkle tree.
      await mockRewardsOracle.setMockValue(merkleSimpleTree.getHexRoot(), 0, ipfsBytesHash);
      await merkleDistributor.proposeRoot();
      await incrementTimeToTimestamp((await timeLatest()).plus(merkleWaitingPeriod).toNumber());
      await merkleDistributor.updateRoot();
      userRewardsAddress = addrs[1];
    });

    it('claims from Merkle distributor only', async () => {
      // Get expected rewards.
      const claimableHumanUnits = await txBuilder.claimsProxyService.getUserUnclaimedRewards(userRewardsAddress);
      const claimable = new BNJS(claimableHumanUnits).shiftedBy(DYDX_TOKEN_DECIMALS).toNumber();
      expect(claimable).to.equal(MERKLE_DISTRIBUTOR_BALANCE);

      // Claim rewards.
      const balanceBefore = await dydxToken.balanceOf(addrs[1]);
      const txs = await txBuilder.claimsProxyService.claimRewards(userRewardsAddress);
      await sendTransactions(txs, users[1]);

      // Check balance after.
      const balanceAfter = await dydxToken.balanceOf(addrs[1]);
      const diff = balanceAfter.sub(balanceBefore);
      expect(diff).to.equal(MERKLE_DISTRIBUTOR_BALANCE);
    });

    it('claims from all contracts', async () => {
      // Start at beginning of epoch
      const remaining1 = await liquidityStaking.getTimeRemainingInCurrentEpoch();
      await increaseTimeAndMine(remaining1.toNumber());

      // Liquidity module: stake funds for an epoch, then let the funds become inactive.
      await liquidityStaking.connect(users[1].signer).stake(LIQUIDITY_STAKE);
      await liquidityStaking.connect(users[1].signer).requestWithdrawal(LIQUIDITY_STAKE);
      const remaining2 = await liquidityStaking.getTimeRemainingInCurrentEpoch();
      await increaseTimeAndMine(remaining2.toNumber());

      // Stake in safety module and elapse time.
      await safetyModule.connect(users[1].signer).stake(SAFETY_STAKE)
      await increaseTimeAndMine(1000);

      const expectedRewards: number = MERKLE_DISTRIBUTOR_BALANCE + (15 * 1000) + EPOCH_LENGTH.mul(25).toNumber();

      // Get expected rewards.
      const claimableHumanUnits = await txBuilder.claimsProxyService.getUserUnclaimedRewards(userRewardsAddress);
      const claimable = new BNJS(claimableHumanUnits).shiftedBy(DYDX_TOKEN_DECIMALS);
      const claimableError = claimable.minus(expectedRewards).abs().toNumber()
      expect(claimableError).to.be.lte(400);

      // Claim rewards.
      const balanceBefore = await dydxToken.balanceOf(addrs[1]);
      const txs = await txBuilder.claimsProxyService.claimRewards(userRewardsAddress);
      await sendTransactions(txs, users[1]);

      // Check balance after.
      const balanceAfter = await dydxToken.balanceOf(addrs[1]);
      const diff = balanceAfter.sub(balanceBefore);
      const error = diff.sub(expectedRewards).abs().toNumber();
      expect(error).to.be.lte(45);
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
