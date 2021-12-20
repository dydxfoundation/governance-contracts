import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import BNJS from 'bignumber.js';
import { expect } from 'chai';

import { ZERO_ADDRESS } from '../../src/lib/constants';
import {
  SafetyModuleV1,
  MockSafetyModuleSubclass,
  MockSafetyModuleSubclass__factory,
} from '../../types';
import { describeContractHardhatRevertBeforeEach, TestContext } from '../helpers/describe-contract';
import { latestBlockTimestamp } from '../helpers/evm';
import { StakingHelper } from '../helpers/staking-helper';

const stakerInitialBalance: number = 1_000_000;
const stakerInitialBalance2: number = 4_000_000;

// Users.
let staker1: SignerWithAddress;
let staker2: SignerWithAddress;

// Users calling the liquidity staking contract.
let stakerSigner1: SafetyModuleV1;
let mockSubclassSigner1: MockSafetyModuleSubclass;

let contract: StakingHelper;

async function init(ctx: TestContext) {
  // Users.
  [staker1, staker2] = ctx.users;

  // Users calling the liquidity staking contract.
  stakerSigner1 = ctx.safetyModule.connect(staker1);
  const distributionStart2 = await latestBlockTimestamp() + 500;
  mockSubclassSigner1 = await new MockSafetyModuleSubclass__factory(staker1).deploy(
    ctx.dydxToken.address,
    ctx.dydxToken.address,
    ctx.rewardsTreasury.address,
    distributionStart2,
    ctx.config.SM_DISTRIBUTION_END,
  );

  // Use helper class to automatically check contract invariants after every update.
  contract = new StakingHelper(
    ctx,
    ctx.safetyModule,
    ctx.dydxToken,
    ctx.rewardsTreasury.address,
    ctx.deployer,
    ctx.deployer,
    [staker1, staker2],
    true,
  );

  // Mint to stakers.
  await contract.mintAndApprove(staker1, stakerInitialBalance);
  await contract.mintAndApprove(staker2, stakerInitialBalance2);
}

describeContractHardhatRevertBeforeEach('SM1Erc20', init, (ctx: TestContext) => {

  before(() => {
    contract.saveSnapshot('main');
  });

  afterEach(() => {
    contract.loadSnapshot('main');
  });

  describe('Token details', () => {

    it('Has correct name', async () => {
      expect(await ctx.safetyModule.name()).to.equal('Staked DYDX');
    });

    it('Has correct symbol', async () => {
      expect(await ctx.safetyModule.symbol()).to.equal('stkDYDX');
    });

    it('Has correct decimals', async () => {
      expect(await ctx.safetyModule.decimals()).to.equal(18);
    });
  });

  describe('totalSupply', () => {

    it('totalSupply is zero with no staked funds', async () => {
      expect(await ctx.safetyModule.totalSupply()).to.equal(0);
    });

    it('totalSupply increases when users stake funds and does not decrease when funds are inactive', async () => {
      await contract.stake(staker1, stakerInitialBalance);

      expect(await ctx.safetyModule.totalSupply()).to.equal(stakerInitialBalance);

      await contract.requestWithdrawal(staker1, stakerInitialBalance);

      // funds aren't inactive yet
      expect(await ctx.safetyModule.totalSupply()).to.equal(stakerInitialBalance);

      // another user stakes funds
      await contract.stake(staker2, stakerInitialBalance2);
      const totalFunds = stakerInitialBalance + stakerInitialBalance2;
      expect(await ctx.safetyModule.totalSupply()).to.equal(totalFunds);

      // funds are inactive in next epoch
      await contract.elapseEpoch();
      expect(await ctx.safetyModule.totalSupply()).to.equal(totalFunds);

      await contract.withdrawMaxStake(staker1, staker1);
      // should be stakerInitialBalance2 after staker1 withdraws funds
      expect(await ctx.safetyModule.totalSupply()).to.equal(stakerInitialBalance2);
    });
  });

  describe('balanceOf', () => {

    it('balanceOf is zero if user has no staked funds', async () => {
      expect(await ctx.safetyModule.balanceOf(staker1.address)).to.equal(0);
    });

    it('User balance increases when user stakes funds and does not decrease when funds are inactive', async () => {
      await contract.stake(staker1, stakerInitialBalance);

      expect(await ctx.safetyModule.balanceOf(staker1.address)).to.equal(stakerInitialBalance);

      await contract.requestWithdrawal(staker1, stakerInitialBalance);

      // funds aren't inactive yet
      expect(await ctx.safetyModule.balanceOf(staker1.address)).to.equal(stakerInitialBalance);

      // funds are inactive in next epoch
      await contract.elapseEpoch();
      expect(await ctx.safetyModule.balanceOf(staker1.address)).to.equal(stakerInitialBalance);

      await contract.withdrawMaxStake(staker1, staker1);
      // should be 0 after user withdraws funds
      expect(await ctx.safetyModule.balanceOf(staker1.address)).to.equal(0);
    });
  });

  describe('allowance', () => {

    it('allowance is initially zero for user', async () => {
      expect(await ctx.safetyModule.allowance(staker1.address, staker2.address)).to.equal(0);
    });

    it('allowance can be set to non-zero with approve', async () => {
      await expect(stakerSigner1.approve(staker2.address, stakerInitialBalance))
        .to.emit(stakerSigner1, 'Approval')
        .withArgs(staker1.address, staker2.address, stakerInitialBalance);

      expect(await ctx.safetyModule.allowance(staker1.address, staker2.address)).to.equal(
        stakerInitialBalance,
      );
    });

    it('cannot approve to address(0)', async () => {
      await expect(ctx.safetyModule.approve(ZERO_ADDRESS, 1)).to.be.revertedWith(
        'SM1ERC20: Approve to address(0)',
      );
    });

    it('cannot approve from address(0)', async () => {
      await expect(mockSubclassSigner1.mockApproveFromZero(staker1.address, 1)).to.be.revertedWith(
        'SM1ERC20: Approve from address(0)',
      );
    });
  });

  describe('increaseAllowance', () => {

    it('allowance can be increased', async () => {
      await expect(stakerSigner1.increaseAllowance(staker2.address, stakerInitialBalance))
        .to.emit(stakerSigner1, 'Approval')
        .withArgs(staker1.address, staker2.address, stakerInitialBalance);

      expect(await ctx.safetyModule.allowance(staker1.address, staker2.address)).to.equal(
        stakerInitialBalance,
      );
    });
  });

  describe('decreaseAllowance', () => {

    it('allowance can be decreased', async () => {
      await expect(stakerSigner1.increaseAllowance(staker2.address, stakerInitialBalance))
        .to.emit(stakerSigner1, 'Approval')
        .withArgs(staker1.address, staker2.address, stakerInitialBalance);

      expect(await ctx.safetyModule.allowance(staker1.address, staker2.address)).to.equal(
        stakerInitialBalance,
      );

      await expect(stakerSigner1.decreaseAllowance(staker2.address, stakerInitialBalance))
        .to.emit(stakerSigner1, 'Approval')
        .withArgs(staker1.address, staker2.address, 0);

      // allowance should now be 0
      expect(await ctx.safetyModule.allowance(staker1.address, staker2.address)).to.equal(0);
    });
  });

  describe('transfer', () => {

    it('User cannot transfer funds if they have not staked', async () => {
      expect(await ctx.safetyModule.getTransferableBalance(staker1.address)).to.equal(0);
      await expect(
        stakerSigner1.transfer(staker2.address, stakerInitialBalance),
      ).to.be.revertedWith('SM1ERC20: Transfer exceeds next epoch active balance');
    });

    it('User with staked balance can transfer to another user', async () => {
      await contract.stake(staker1, stakerInitialBalance);

      expect(await ctx.safetyModule.getTransferableBalance(staker1.address)).to.equal(
        stakerInitialBalance,
      );
      await contract.transfer(staker1, staker2, stakerInitialBalance);

      expect(await ctx.safetyModule.balanceOf(staker1.address)).to.equal(0);
      expect(await ctx.safetyModule.balanceOf(staker2.address)).to.equal(stakerInitialBalance);
    });

    it('User with staked balance for one epoch can transfer to another user and claim rewards', async () => {
      // change EMISSION_RATE to be greater than 0
      const emissionRate = 1;
      await expect(ctx.safetyModule.connect(ctx.deployer).setRewardsPerSecond(emissionRate))
        .to.emit(ctx.safetyModule, 'RewardsPerSecondUpdated')
        .withArgs(emissionRate);

      await contract.stake(staker1, stakerInitialBalance);
      const stakeTimestamp = await latestBlockTimestamp();

      // increase time to next epoch, so user can earn rewards
      await contract.elapseEpoch();

      expect(await ctx.safetyModule.getTransferableBalance(staker1.address)).to.equal(
        stakerInitialBalance,
      );
      await contract.transfer(staker1, staker2, stakerInitialBalance);

      const balanceBeforeClaiming = await ctx.dydxToken.balanceOf(staker1.address);
      const now = await latestBlockTimestamp();
      const numTokens = new BNJS(now).minus(stakeTimestamp).times(emissionRate).toString();
      await expect(stakerSigner1.claimRewards(staker1.address))
        .to.emit(ctx.safetyModule, 'ClaimedRewards')
        .withArgs(staker1.address, staker1.address, numTokens);
      expect(await ctx.dydxToken.balanceOf(staker1.address)).to.equal(
        balanceBeforeClaiming.add(numTokens).toString(),
      );
    });

    it('User cannot transfer funds that are going to be inactive in the next epoch', async () => {
      await contract.stake(staker1, stakerInitialBalance);

      await contract.requestWithdrawal(staker1, stakerInitialBalance);

      // funds will be inactive next epoch, cannot transfer them
      expect(await ctx.safetyModule.getTransferableBalance(staker1.address)).to.equal(0);
      await expect(
        stakerSigner1.transfer(staker2.address, stakerInitialBalance),
      ).to.be.revertedWith('SM1ERC20: Transfer exceeds next epoch active balance');
    });

    it('cannot transfer to address(0)', async () => {
      await expect(ctx.safetyModule.transfer(ZERO_ADDRESS, 1)).to.be.revertedWith(
        'SM1ERC20: Transfer to address(0)',
      );
    });

    it('cannot transfer from address(0)', async () => {
      await expect(mockSubclassSigner1.mockTransferFromZero(staker1.address, 1)).to.be.revertedWith(
        'SM1ERC20: Transfer from address(0)',
      );
    });
  });

  describe('transferFrom', () => {

    it('User with staked balance can transfer to another user', async () => {
      await contract.stake(staker1, stakerInitialBalance);

      await contract.approve(staker1, staker2, stakerInitialBalance);
      await contract.transferFrom(staker2, staker1, staker2, stakerInitialBalance);

      expect(await ctx.safetyModule.balanceOf(staker1.address)).to.equal(0);
      expect(await ctx.safetyModule.balanceOf(staker2.address)).to.equal(stakerInitialBalance);
    });
  });
});
