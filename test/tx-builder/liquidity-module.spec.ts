import { expect } from 'chai';
import { BigNumber } from 'ethers';
import { formatUnits } from 'ethers/lib/utils';

import {
  makeSuite,
  TestEnv,
  deployPhase2,
  SignerWithAddress,
} from '../test-helpers/make-suite';
import {
  evmSnapshot,
  evmRevert,
  increaseTime,
  increaseTimeAndMine,
  incrementTimeToTimestamp,
} from '../../helpers/misc-utils';
import { EPOCH_LENGTH } from '../../helpers/constants';
import { DRE } from '../../helpers/misc-utils';
import { Network, tStringDecimalUnits, TxBuilder } from '../../src';
import { LiquidityStakingV1 } from '../../types/LiquidityStakingV1';
import { MintableErc20 } from '../../types/MintableErc20';
import { sendTransactions } from '../test-helpers/tx-builder';
import { DEFAULT_APPROVE_AMOUNT, DYDX_TOKEN_DECIMALS, USDC_TOKEN_DECIMALS } from '../../src/tx-builder/config';
import { parseNumberToString, parseNumberToEthersBigNumber } from '../../src/tx-builder/utils/parsings';
import { DydxToken } from '../../types/DydxToken';

const snapshots = new Map<string, string>();
const afterMockTokenMint = 'AfterMockTokenMint';
const afterStake = 'AfterStack';
const stakerInitialBalanceWei = BigNumber.from(10).pow(24);

makeSuite('TxBuilder.liquidityModuleService', deployPhase2, (testEnv: TestEnv) => {
  // Contracts.
  let liquidityStaking: LiquidityStakingV1;
  let mockStakedToken: MintableErc20;
  let dydxToken: DydxToken;

  // Users.
  let staker1: SignerWithAddress;
  let staker2: SignerWithAddress;
  let fundsRecipient: SignerWithAddress;

  let distributionStart: string;

  let txBuilder: TxBuilder;

  before(async () => {
    ({
      liquidityStaking,
      mockStakedToken,
      dydxToken,
    } = testEnv);

    // Users.
    [staker1, staker2, fundsRecipient] = testEnv.users.slice(1);

    // Create TxBuilder for sending transactions.
    txBuilder = new TxBuilder({
      network: Network.hardhat,
      hardhatLiquidityModuleAddresses: {
        LIQUIDITY_MODULE_ADDRESS: liquidityStaking.address,
      },
      injectedProvider: DRE.ethers.provider,
    });

    // Initialization steps.
    await mockStakedToken.mint(staker1.address, stakerInitialBalanceWei);
    distributionStart = (await liquidityStaking.DISTRIBUTION_START()).toString();
    await incrementTimeToTimestamp(distributionStart);
    await liquidityStaking.setRewardsPerSecond(1e10);

    await saveSnapshot(afterMockTokenMint);
  });

  describe('before staking', () => {

    beforeEach(async () => {
      await loadSnapshot(afterMockTokenMint);
    });

    it('Total liquidity module balance starts at 0', async () => {
      const totalLiquidity: tStringDecimalUnits = await txBuilder.liquidityModuleService.getTotalStake();

      expect(totalLiquidity).to.equal('0.0');
    })

    it('Rewards rate starts at 1e10', async () => {
      const rewardsPerSecond: tStringDecimalUnits = await txBuilder.liquidityModuleService.getRewardsPerSecond();

      expect(rewardsPerSecond).to.equal(formatUnits(1e10, DYDX_TOKEN_DECIMALS));
    })

    it('User stake starts at 0', async () => {
      const userStake: tStringDecimalUnits = await txBuilder.liquidityModuleService.getUserStake(staker1.address);

      expect(userStake.toString()).to.equal('0.0');
    })

    it('User stake pending withdraw starts at 0', async () => {
      const userStakePendingWithdraw: tStringDecimalUnits = await txBuilder.liquidityModuleService.getUserStakePendingWithdraw(staker1.address);

      expect(userStakePendingWithdraw).to.equal('0.0');
    })

    it('User stake available to withdraw starts at 0', async () => {
      const userStakeToWithdraw: tStringDecimalUnits = await txBuilder.liquidityModuleService.getUserStakeAvailableToWithdraw(staker1.address);

      expect(userStakeToWithdraw).to.equal('0.0');
    })

    it('User has not approved liquidity module', async () => {
      const approvalValue: tStringDecimalUnits = await txBuilder.liquidityModuleService.allowance(staker1.address);

      expect(approvalValue).to.equal('0.0');
    })

    it('User rewards are initially 0', async () => {
      const userRewards: tStringDecimalUnits = await txBuilder.liquidityModuleService.getUserUnclaimedRewards(staker1.address);

      expect(userRewards.toString()).to.equal('0.0');
    })

    it('Time until next epoch is equal to epoch length', async () => {
      const timeUntilNextEpoch: BigNumber = await txBuilder.liquidityModuleService.getTimeRemainingInCurrentEpoch();
      const epochParams = await liquidityStaking.getEpochParameters();

      expect(timeUntilNextEpoch.toNumber()).to.be.approximately(epochParams.interval.toNumber(), 2);
    })

    it('Blackout window is equal to blackout window defined on contract', async () => {
      const blackoutWindow: BigNumber = await txBuilder.liquidityModuleService.getLengthOfBlackoutWindow();

      const contractBlackoutWindow: BigNumber = await liquidityStaking.getBlackoutWindow();

      expect(blackoutWindow.toString()).to.equal(contractBlackoutWindow.toString());
    })

    it('stake', async () => {
      // Stake.
      const stakeAmount = 1e6;
      const txs = await txBuilder.liquidityModuleService.stake(
        staker1.address,
        stakeAmount.toString(),
      );
      await sendTransactions(txs, staker1);

      const balance = await txBuilder.liquidityModuleService.getUserBalanceOfStakedToken(staker1.address);

      const stakeAmountWei: BigNumber = parseNumberToEthersBigNumber(stakeAmount.toString(), USDC_TOKEN_DECIMALS);
      expect(balance).to.equal(formatUnits(stakerInitialBalanceWei.sub(stakeAmountWei), USDC_TOKEN_DECIMALS));
    });

    it('Allows specifying a custom gas limit for staking', async () => {
      const gasLimit: number = 217654;
      const txs = await txBuilder.liquidityModuleService.stake(
        staker1.address,
        '1',
        undefined,
        gasLimit,
      )

      // Should contain both approve and stake TX
      expect(txs.length).to.equal(2);
      const populatedTx = await txs[1].tx();
      expect(populatedTx?.gasLimit).to.equal(gasLimit);
    })
  });

  describe('after staking', () => {
    // `stakeAmount` should be even (so it has no remainder when divided by 2)
    const stakeAmount = 1e6;

    before(async () => {
      await loadSnapshot(afterMockTokenMint);

      // Stake.
      const txs = await txBuilder.liquidityModuleService.stake(
        staker1.address,
        stakeAmount.toString(),
      );
      await sendTransactions(txs, staker1);

      await saveSnapshot(afterStake);
    });

    beforeEach(async () => {
      await loadSnapshot(afterStake);
    });

    it('Total liquidity module balance is non-zero', async () => {
      const totalLiquidity: tStringDecimalUnits = await txBuilder.liquidityModuleService.getTotalStake();

      expect(totalLiquidity).to.equal(formatUnits(stakeAmount, 0));
    })

    it('User has approved liquidity module', async () => {
      const approvalValue: tStringDecimalUnits = await txBuilder.liquidityModuleService.allowance(staker1.address);
      const expectedApprovalValue: BigNumber = BigNumber.from(DEFAULT_APPROVE_AMOUNT).sub(
        parseNumberToString(stakeAmount.toString(), USDC_TOKEN_DECIMALS));

      expect(approvalValue).to.equal(formatUnits(expectedApprovalValue, USDC_TOKEN_DECIMALS));
    })

    it('User stake is non-zero', async () => {
      const userStake: tStringDecimalUnits = await txBuilder.liquidityModuleService.getUserStake(staker1.address);

      expect(userStake).to.equal(formatUnits(stakeAmount, 0));
    })

    it('User rewards are non-zero', async () => {
      // move time 1 second forward so staker1 earns rewards
      await increaseTimeAndMine(1);

      const userUnclaimedRewards: tStringDecimalUnits = await txBuilder.liquidityModuleService.getUserUnclaimedRewards(staker1.address);

      const convertedUserUnclaimedRewards: BigNumber = parseNumberToEthersBigNumber(userUnclaimedRewards, DYDX_TOKEN_DECIMALS);

      expect(convertedUserUnclaimedRewards.gt('0')).to.be.true;
    })

    it('user stake pending withdraw is non-zero after requesting to withdraw', async () => {
      // Request withdrawal.
      {
        const txs = await txBuilder.liquidityModuleService.requestWithdrawal(
          staker1.address,
          stakeAmount.toString(), // Request full withdrawal.
        );
        await sendTransactions(txs, staker1);
      }

      const userStakePendingWithdraw: tStringDecimalUnits = await txBuilder.liquidityModuleService.getUserStakePendingWithdraw(staker1.address);

      expect(userStakePendingWithdraw).to.equal(formatUnits(stakeAmount, 0));
    });

    it('user stake available to withdraw is non-zero after requesting to withdraw and waiting an epoch', async () => {
      // Request withdrawal.
      {
        const txs = await txBuilder.liquidityModuleService.requestWithdrawal(
          staker1.address,
          stakeAmount.toString(), // Request full withdrawal.
        );
        await sendTransactions(txs, staker1);
      }

      // Advance to the next epoch.
      await elapseEpoch();

      const userStakeToWithdraw: tStringDecimalUnits = await txBuilder.liquidityModuleService.getUserStakeAvailableToWithdraw(staker1.address);

      expect(userStakeToWithdraw).to.equal(formatUnits(stakeAmount, 0));
    });

    it('withdraws', async () => {
      // Request withdrawal.
      {
        const txs = await txBuilder.liquidityModuleService.requestWithdrawal(
          staker1.address,
          stakeAmount.toString(), // Request full withdrawal.
        );
        await sendTransactions(txs, staker1);
      }

      // Advance to the next epoch.
      await elapseEpoch();

      // Withdraw.
      {
        const txs = await txBuilder.liquidityModuleService.withdrawStake(
          staker1.address,
          stakeAmount.toString(), // Withdraw all.
        );
        await sendTransactions(txs, staker1);
      }

      const balance: tStringDecimalUnits = await txBuilder.liquidityModuleService.getUserBalanceOfStakedToken(staker1.address);
      expect(balance).to.equal(formatUnits(stakerInitialBalanceWei, USDC_TOKEN_DECIMALS));
    });

    it('withdraws max', async () => {
      // Request withdrawal.
      {
        const txs = await txBuilder.liquidityModuleService.requestWithdrawal(
          staker1.address,
          (stakeAmount / 2).toString(), // Request half.
        );
        await sendTransactions(txs, staker1);
      }

      // Advance to the next epoch.
      await elapseEpoch();

      // Withdraw.
      {
        const txs = await txBuilder.liquidityModuleService.withdrawStake(
          staker1.address,
          '-1', // Withdraw max.
        );
        await sendTransactions(txs, staker1);
      }

      const balance: tStringDecimalUnits = await txBuilder.liquidityModuleService.getUserBalanceOfStakedToken(staker1.address);
      // half of the funds are remaining in the contract
      const remainingFundsWei: BigNumber = parseNumberToEthersBigNumber((stakeAmount / 2).toString(), USDC_TOKEN_DECIMALS);
      expect(balance).to.equal(formatUnits(stakerInitialBalanceWei.sub(remainingFundsWei), USDC_TOKEN_DECIMALS));
    });

    it('claims rewards', async () => {
      const rewardsBefore = await dydxToken.balanceOf(staker1.address);

      // Claim rewards.
      const txs = await txBuilder.liquidityModuleService.claimRewards(staker1.address);
      await sendTransactions(txs, staker1);

      const rewardsAfter = await dydxToken.balanceOf(staker1.address);
      expect(rewardsAfter.sub(rewardsBefore)).not.to.equal(0);
    });
  });

  /**
   * Progress to the start of the next epoch. May be a bit after if mining a block.
   */
  async function elapseEpoch(mineBlock: boolean = true): Promise<void> {
    let remaining = (await liquidityStaking.getTimeRemainingInCurrentEpoch()).toNumber();
    remaining ||= EPOCH_LENGTH.toNumber();
    if (mineBlock) {
      await increaseTimeAndMine(remaining);
    } else {
      await increaseTime(remaining);
    }
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
});
