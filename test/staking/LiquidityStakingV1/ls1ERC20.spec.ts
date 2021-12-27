import BigNumber from 'bignumber.js';
import {
  makeSuite,
  TestEnv,
  deployPhase2,
  SignerWithAddress,
} from '../../test-helpers/make-suite';
import {
  timeLatest,
  evmSnapshot,
  evmRevert,
  increaseTime,
  increaseTimeAndMine,
} from '../../../helpers/misc-utils';
import { EPOCH_LENGTH } from '../../../helpers/constants';
import { StakingHelper } from '../../test-helpers/staking-helper';
import { LiquidityStakingV1 } from '../../../types/LiquidityStakingV1';
import { MintableErc20 } from '../../../types/MintableErc20';
import { expect } from 'chai';
import { DydxToken } from '../../../types/DydxToken';

const snapshots = new Map<string, string>();

const afterMockTokenMint = 'AfterMockTokenMint';

const stakerInitialBalance: number = 1_000_000;
const stakerInitialBalance2: number = 4_000_000;

makeSuite('LS1ERC20', deployPhase2, (testEnv: TestEnv) => {
  // Contracts.
  let deployer: SignerWithAddress;
  let rewardsTreasury: SignerWithAddress;
  let liquidityStakingV1: LiquidityStakingV1;
  let mockStakedToken: MintableErc20;
  let dydxToken: DydxToken;

  // Users.
  let staker1: SignerWithAddress;
  let staker2: SignerWithAddress;
  let fundsRecipient: SignerWithAddress;

  // Users calling the liquidity staking contract.
  let stakerSigner1: LiquidityStakingV1;
  let stakerSigner2: LiquidityStakingV1;

  let distributionStart: string;
  let distributionEnd: string;

  let contract: StakingHelper;

  before(async () => {
    liquidityStakingV1 = testEnv.liquidityStaking;
    mockStakedToken = testEnv.mockStakedToken;
    dydxToken = testEnv.dydxToken;
    rewardsTreasury = testEnv.rewardsTreasury;
    deployer = testEnv.deployer;

    // Users.
    [staker1, staker2, fundsRecipient] = testEnv.users.slice(1);

    // Users calling the liquidity staking contract.
    stakerSigner1 = liquidityStakingV1.connect(staker1.signer);
    stakerSigner2 = liquidityStakingV1.connect(staker2.signer);

    distributionStart = (await liquidityStakingV1.DISTRIBUTION_START()).toString();
    distributionEnd = (await liquidityStakingV1.DISTRIBUTION_END()).toString();

    await mockStakedToken.mint(staker1.address, stakerInitialBalance);
    await mockStakedToken
      .connect(staker1.signer)
      .approve(liquidityStakingV1.address, stakerInitialBalance);

    await mockStakedToken.mint(staker2.address, stakerInitialBalance2);
    await mockStakedToken
      .connect(staker2.signer)
      .approve(liquidityStakingV1.address, stakerInitialBalance2);

    snapshots.set(afterMockTokenMint, await evmSnapshot());

    // Use helper class to automatically check contract invariants after every update.
    contract = new StakingHelper(
      liquidityStakingV1,
      mockStakedToken,
      rewardsTreasury,
      deployer,
      deployer,
      [staker1, staker2],
      false,
    );
  });

  describe('name', () => {
    it('Has correct name', async () => {
      expect(await liquidityStakingV1.name()).to.equal('dYdX Staked USDC');
    });
  });

  describe('symbol', () => {
    it('Has correct symbol', async () => {
      expect(await liquidityStakingV1.symbol()).to.equal('stkUSDC');
    });
  });

  describe('decimals', () => {
    it('Has correct decimals', async () => {
      expect(await liquidityStakingV1.decimals()).to.equal(6);
    });
  });

  describe('totalSupply', () => {
    beforeEach(async () => {
      await revertTestChanges();
    });

    it('totalSupply is zero with no staked funds', async () => {
      expect(await liquidityStakingV1.totalSupply()).to.equal(0);
    });

    it('totalSupply increases when users stake funds and does not decrease when funds are inactive', async () => {
      await incrementTimeToTimestamp(distributionStart);

      await contract.stake(staker1, stakerInitialBalance);

      expect(await liquidityStakingV1.totalSupply()).to.equal(stakerInitialBalance);

      await contract.requestWithdrawal(staker1, stakerInitialBalance);

      // funds aren't inactive yet
      expect(await liquidityStakingV1.totalSupply()).to.equal(stakerInitialBalance);

      // another user stakes funds
      await contract.stake(staker2, stakerInitialBalance2);
      const totalFunds = stakerInitialBalance + stakerInitialBalance2;
      expect(await liquidityStakingV1.totalSupply()).to.equal(totalFunds);

      // funds are inactive in next epoch
      await elapseEpoch();
      expect(await liquidityStakingV1.totalSupply()).to.equal(totalFunds);

      await contract.withdrawMaxStake(staker1, staker1);
      // should be stakerInitialBalance2 after staker1 withdraws funds
      expect(await liquidityStakingV1.totalSupply()).to.equal(stakerInitialBalance2);
    });
  });

  describe('balanceOf', () => {
    beforeEach(async () => {
      await revertTestChanges();
    });

    it('balanceOf is zero if user has no staked funds', async () => {
      expect(await liquidityStakingV1.balanceOf(staker1.address)).to.equal(0);
    });

    it('User balance increases when user stakes funds and does not decrease when funds are inactive', async () => {
      await incrementTimeToTimestamp(distributionStart);

      await contract.stake(staker1, stakerInitialBalance);

      expect(await liquidityStakingV1.balanceOf(staker1.address)).to.equal(stakerInitialBalance);

      await contract.requestWithdrawal(staker1, stakerInitialBalance);

      // funds aren't inactive yet
      expect(await liquidityStakingV1.balanceOf(staker1.address)).to.equal(stakerInitialBalance);

      // funds are inactive in next epoch
      await elapseEpoch();
      expect(await liquidityStakingV1.balanceOf(staker1.address)).to.equal(stakerInitialBalance);

      await contract.withdrawMaxStake(staker1, staker1);
      // should be 0 after user withdraws funds
      expect(await liquidityStakingV1.balanceOf(staker1.address)).to.equal(0);
    });
  });

  describe('allowance', () => {
    beforeEach(async () => {
      await revertTestChanges();
    });

    it('allowance is initially zero for user', async () => {
      expect(await liquidityStakingV1.allowance(staker1.address, staker2.address)).to.equal(0);
    });

    it('allowance can be set to non-zero with approve', async () => {
      expect(await stakerSigner1.approve(staker2.address, stakerInitialBalance))
        .to.emit(stakerSigner1, 'Approval')
        .withArgs(staker1.address, staker2.address, stakerInitialBalance);

      expect(await liquidityStakingV1.allowance(staker1.address, staker2.address)).to.equal(
        stakerInitialBalance
      );
    });
  });

  describe('increaseAllowance', () => {
    beforeEach(async () => {
      await revertTestChanges();
    });

    it('allowance can be increased', async () => {
      expect(await stakerSigner1.increaseAllowance(staker2.address, stakerInitialBalance))
        .to.emit(stakerSigner1, 'Approval')
        .withArgs(staker1.address, staker2.address, stakerInitialBalance);

      expect(await liquidityStakingV1.allowance(staker1.address, staker2.address)).to.equal(
        stakerInitialBalance
      );
    });
  });

  describe('decreaseAllowance', () => {
    beforeEach(async () => {
      await revertTestChanges();
    });

    it('allowance can be decreased', async () => {
      expect(await stakerSigner1.increaseAllowance(staker2.address, stakerInitialBalance))
        .to.emit(stakerSigner1, 'Approval')
        .withArgs(staker1.address, staker2.address, stakerInitialBalance);

      expect(await liquidityStakingV1.allowance(staker1.address, staker2.address)).to.equal(
        stakerInitialBalance
      );

      expect(await stakerSigner1.decreaseAllowance(staker2.address, stakerInitialBalance))
        .to.emit(stakerSigner1, 'Approval')
        .withArgs(staker1.address, staker2.address, 0);

      // allowance should now be 0
      expect(await liquidityStakingV1.allowance(staker1.address, staker2.address)).to.equal(0);
    });
  });

  describe('transfer', () => {
    beforeEach(async () => {
      await revertTestChanges();
    });

    it('User cannot transfer funds if they have not staked', async () => {
      expect(await liquidityStakingV1.getTransferableBalance(staker1.address)).to.equal(0);
      await expect(
        stakerSigner1.transfer(staker2.address, stakerInitialBalance)
      ).to.be.revertedWith('LS1ERC20: Transfer exceeds next epoch active balance');
    });

    it('User with staked balance can transfer to another user', async () => {
      await incrementTimeToTimestamp(distributionStart);

      await contract.stake(staker1, stakerInitialBalance);

      expect(await liquidityStakingV1.getTransferableBalance(staker1.address)).to.equal(
        stakerInitialBalance
      );
      await contract.transfer(staker1, staker2, stakerInitialBalance);

      expect(await liquidityStakingV1.balanceOf(staker1.address)).to.equal(0);
      expect(await liquidityStakingV1.balanceOf(staker2.address)).to.equal(stakerInitialBalance);
    });

    it('User with staked balance for one epoch can transfer to another user and claim rewards', async () => {
      await incrementTimeToTimestamp(distributionStart);

      // change EMISSION_RATE to be greater than 0
      const emissionRate = 1;
      await expect(liquidityStakingV1.connect(deployer.signer).setRewardsPerSecond(emissionRate))
        .to.emit(liquidityStakingV1, 'RewardsPerSecondUpdated')
        .withArgs(emissionRate);

      await contract.stake(staker1, stakerInitialBalance);
      const stakeTimestamp: BigNumber = await timeLatest();

      // increase time to next epoch, so user can earn rewards
      await elapseEpoch();

      expect(await liquidityStakingV1.getTransferableBalance(staker1.address)).to.equal(
        stakerInitialBalance
      );
      await contract.transfer(staker1, staker2, stakerInitialBalance);

      const balanceBeforeClaiming = await dydxToken.balanceOf(staker1.address);
      const now: BigNumber = await timeLatest();
      const numTokens = now.minus(stakeTimestamp).times(emissionRate).toString();
      await expect(stakerSigner1.claimRewards(staker1.address))
        .to.emit(liquidityStakingV1, 'ClaimedRewards')
        .withArgs(staker1.address, staker1.address, numTokens);
      expect(await dydxToken.balanceOf(staker1.address)).to.equal(
        balanceBeforeClaiming.add(numTokens).toString()
      );
    });

    it('User cannot transfer funds that are going to be inactive in the next epoch', async () => {
      await incrementTimeToTimestamp(distributionStart);

      await contract.stake(staker1, stakerInitialBalance);

      await contract.requestWithdrawal(staker1, stakerInitialBalance);

      // funds will be inactive next epoch, cannot transfer them
      expect(await liquidityStakingV1.getTransferableBalance(staker1.address)).to.equal(0);
      await expect(
        stakerSigner1.transfer(staker2.address, stakerInitialBalance)
      ).to.be.revertedWith('LS1ERC20: Transfer exceeds next epoch active balance');
    });
  });

  describe('transferFrom', () => {
    beforeEach(async () => {
      await revertTestChanges();
    });

    it('User with staked balance can transfer to another user', async () => {
      await incrementTimeToTimestamp(distributionStart);

      await contract.stake(staker1, stakerInitialBalance);

      await contract.approve(staker1, staker2, stakerInitialBalance);
      await contract.transferFrom(staker2, staker1, staker2, stakerInitialBalance);

      expect(await liquidityStakingV1.balanceOf(staker1.address)).to.equal(0);
      expect(await liquidityStakingV1.balanceOf(staker2.address)).to.equal(stakerInitialBalance);
    });
  });

  /**
   * Progress to the start of the next epoch. May be a bit after if mining a block.
   */
  async function elapseEpoch(mineBlock: boolean = true): Promise<void> {
    let remaining = (await liquidityStakingV1.getTimeRemainingInCurrentEpoch()).toNumber();
    remaining ||= EPOCH_LENGTH.toNumber();
    if (mineBlock) {
      await increaseTimeAndMine(remaining);
    } else {
      await increaseTime(remaining);
    }
  }

  async function revertTestChanges(): Promise<void> {
    await evmRevert(snapshots.get(afterMockTokenMint) || '1');
    snapshots.set(afterMockTokenMint, await evmSnapshot());
    contract.reset();
  }
});

async function incrementTimeToTimestamp(timestampString: string): Promise<void> {
  const latestBlockTimestamp = await timeLatest();
  const timestamp: BigNumber = new BigNumber(timestampString);
  // we can only increase time in this method, assert that user isn't trying to move time backwards
  expect(latestBlockTimestamp.toNumber()).to.be.at.most(timestamp.toNumber());
  const timestampDiff: number = timestamp.minus(latestBlockTimestamp).toNumber();
  await increaseTimeAndMine(timestampDiff);
}
