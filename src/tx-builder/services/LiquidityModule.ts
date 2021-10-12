import { BigNumber } from 'ethers';
import { formatUnits } from 'ethers/lib/utils';

import {
  LiquidityStakingV1Factory,
} from '../../../types';
import {
  LiquidityStakingV1,
} from '../../../types/LiquidityStakingV1';
import {
  DEFAULT_APPROVE_AMOUNT,
  DYDX_TOKEN_DECIMALS,
  liquidityModuleAddresses,
  MAX_UINT_AMOUNT,
  USDC_TOKEN_DECIMALS,
} from '../config';
import {
  Configuration,
  eEthereumTxType,
  EthereumTransactionTypeExtended,
  Network,
  tEthereumAddress,
  transactionType,
  tLiquidityModuleAddresses,
  tStringCurrencyUnits,
  tStringDecimalUnits,
} from '../types';
import { parseNumberToString, parseNumberToEthersBigNumber } from '../utils/parsings';
import { StakingValidator } from '../validators/methodValidators';
import {
  IsEthAddress,
  IsPositiveAmount,
  IsPositiveOrMinusOneAmount,
  Optional,
} from '../validators/paramValidators';
import BaseService from './BaseService';
import ERC20Service from './ERC20';

export default class LiquidityModule extends BaseService<LiquidityStakingV1> {

  readonly liquidityModuleAddress: string;
  readonly erc20Service: ERC20Service;
  private _stakedToken: string | null;
  private _rewardToken: string | null;

  constructor(
    config: Configuration,
    erc20Service: ERC20Service,
    hardhatLiquidityModuleAddresses?: tLiquidityModuleAddresses,
  ) {
    super(config, LiquidityStakingV1Factory);
    this.erc20Service = erc20Service;
    this._stakedToken = null;
    this._rewardToken = null;

    // Get the staking contract address.
    const { network } = this.config;
    const isHardhatNetwork: boolean = network === Network.hardhat;
    if (isHardhatNetwork && !hardhatLiquidityModuleAddresses) {
      throw new Error('Must specify staking addresses when on hardhat network');
    }
    const networkStakingAddresses: tLiquidityModuleAddresses = isHardhatNetwork
      ? hardhatLiquidityModuleAddresses!
      : liquidityModuleAddresses[network];
    this.liquidityModuleAddress = networkStakingAddresses.LIQUIDITY_MODULE_ADDRESS;
  }

  get contract(): LiquidityStakingV1 {
    return this.getContractInstance(this.liquidityModuleAddress);
  }

  public async getStakedToken(): Promise<string> {
    if (!this._stakedToken) {
      this._stakedToken = await this.contract.STAKED_TOKEN();
    }
    return this._stakedToken;
  }

  public async getRewardToken(): Promise<string> {
    if (!this._rewardToken) {
      this._rewardToken = await this.contract.REWARDS_TOKEN();
    }
    return this._rewardToken;
  }

  @StakingValidator
  public async stake(
    @IsEthAddress() user: tEthereumAddress,
      @IsPositiveAmount() amount: tStringCurrencyUnits,
      @Optional @IsEthAddress() onBehalfOf?: tEthereumAddress,
      gasLimit?: number,
  ): Promise<EthereumTransactionTypeExtended[]> {
    const txs: EthereumTransactionTypeExtended[] = [];
    const { approve } = this.erc20Service;
    const stakedToken: string = await this.getStakedToken();
    const stakedTokenDecimals: number = USDC_TOKEN_DECIMALS;
    const convertedAmount: tStringDecimalUnits = parseNumberToString(
      amount,
      stakedTokenDecimals,
    );
    const allowance: BigNumber = parseNumberToEthersBigNumber(
      await this.allowance(user),
      stakedTokenDecimals,
    );

    if (allowance.lt(convertedAmount)) {
      // user has an approval value for spender of less than `convertedAmount`
      const approveTx = approve(
        stakedToken,
        user,
        this.liquidityModuleAddress,
        DEFAULT_APPROVE_AMOUNT,
      );
      txs.push(approveTx);
    }

    let txCallback: () => Promise<transactionType>;
    if (onBehalfOf) {
      txCallback = this.generateTxCallback({
        rawTxMethod: () =>
          this.contract.populateTransaction.stakeFor(
            onBehalfOf,
            convertedAmount,
          ),
        from: user,
        gasLimit,
      });
    } else {
      txCallback = this.generateTxCallback({
        rawTxMethod: () =>
          this.contract.populateTransaction.stake(convertedAmount),
        from: user,
        gasLimit,
      });
    }

    txs.push({
      tx: txCallback,
      txType: eEthereumTxType.LIQUIDITY_MODULE_ACTION,
      gas: this.generateTxPriceEstimation(txs, txCallback),
    });

    return txs;
  }

  @StakingValidator
  public async withdrawStake(
    @IsEthAddress() user: tEthereumAddress,
      @IsPositiveOrMinusOneAmount() amount: tStringCurrencyUnits,
      @Optional @IsEthAddress() recipient?: tEthereumAddress,
  ): Promise<EthereumTransactionTypeExtended[]> {
    let convertedAmount: tStringDecimalUnits;
    if (amount === '-1') {
      convertedAmount = MAX_UINT_AMOUNT;
    } else {
      convertedAmount = parseNumberToString(amount, USDC_TOKEN_DECIMALS);
    }

    let txCallback: () => Promise<transactionType>;
    if (convertedAmount === MAX_UINT_AMOUNT) {
      txCallback = this.generateTxCallback({
        rawTxMethod: () =>
          this.contract.populateTransaction.withdrawMaxStake(recipient || user),
        from: user,
        gasSurplus: 20,
      });
    } else {
      txCallback = this.generateTxCallback({
        rawTxMethod: () =>
          this.contract.populateTransaction.withdrawStake(recipient || user, convertedAmount),
        from: user,
        gasSurplus: 20,
      });
    }

    return [
      {
        tx: txCallback,
        txType: eEthereumTxType.LIQUIDITY_MODULE_ACTION,
        gas: this.generateTxPriceEstimation([], txCallback),
      },
    ];
  }

  @StakingValidator
  public async withdrawDebt(
    @IsEthAddress() user: tEthereumAddress,
      @IsPositiveOrMinusOneAmount() amount: tStringCurrencyUnits,
      @Optional @IsEthAddress() recipient?: tEthereumAddress,
  ): Promise<EthereumTransactionTypeExtended[]> {
    let convertedAmount: tStringDecimalUnits;
    if (amount === '-1') {
      convertedAmount = MAX_UINT_AMOUNT;
    } else {
      convertedAmount = parseNumberToString(amount, USDC_TOKEN_DECIMALS);
    }

    let txCallback: () => Promise<transactionType>;
    if (convertedAmount === MAX_UINT_AMOUNT) {
      txCallback = this.generateTxCallback({
        rawTxMethod: () =>
          this.contract.populateTransaction.withdrawMaxDebt(recipient || user),
        from: user,
        gasSurplus: 20,
      });
    } else {
      txCallback = this.generateTxCallback({
        rawTxMethod: () =>
          this.contract.populateTransaction.withdrawDebt(recipient || user, convertedAmount),
        from: user,
        gasSurplus: 20,
      });
    }

    return [
      {
        tx: txCallback,
        txType: eEthereumTxType.LIQUIDITY_MODULE_ACTION,
        gas: this.generateTxPriceEstimation([], txCallback),
      },
    ];
  }

  @StakingValidator
  public async requestWithdrawal(
    @IsEthAddress() user: tEthereumAddress,
      @IsPositiveAmount() amount: tStringCurrencyUnits,
  ): Promise<EthereumTransactionTypeExtended[]> {
    const convertedAmount: tStringDecimalUnits = parseNumberToString(amount, USDC_TOKEN_DECIMALS);

    const txCallback: () => Promise<transactionType> = this.generateTxCallback({
      rawTxMethod: () =>
        this.contract.populateTransaction.requestWithdrawal(convertedAmount),
      from: user,
      gasSurplus: 20,
    });

    return [
      {
        tx: txCallback,
        txType: eEthereumTxType.LIQUIDITY_MODULE_ACTION,
        gas: this.generateTxPriceEstimation([], txCallback),
      },
    ];
  }

  @StakingValidator
  public async claimRewards(
    @IsEthAddress() user: tEthereumAddress,
      @Optional @IsEthAddress() recipient?: tEthereumAddress,
  ): Promise<EthereumTransactionTypeExtended[]> {
    const txCallback: () => Promise<transactionType> = this.generateTxCallback({
      rawTxMethod: () =>
        this.contract.populateTransaction.claimRewards(recipient || user),
      from: user,
      gasSurplus: 20,
    });

    return [
      {
        tx: txCallback,
        txType: eEthereumTxType.LIQUIDITY_MODULE_ACTION,
        gas: this.generateTxPriceEstimation([], txCallback),
      },
    ];
  }

  public async getTotalStake(): Promise<tStringDecimalUnits> {
    return this.erc20Service.totalSupply(this.liquidityModuleAddress);
  }

  public async getRewardsPerSecond(): Promise<tStringDecimalUnits> {
    const rewardsPerSecond: BigNumber = await this.contract.getRewardsPerSecond();
    return formatUnits(rewardsPerSecond, DYDX_TOKEN_DECIMALS);
  }

  public async allowance(user: tEthereumAddress): Promise<tStringDecimalUnits> {
    return this.erc20Service.allowance(await this.getStakedToken(), user, this.liquidityModuleAddress);
  }

  public async getUserStake(user: tEthereumAddress): Promise<tStringDecimalUnits> {
    return this.erc20Service.balanceOf(this.liquidityModuleAddress, user);
  }

  public async getUserBalanceOfStakedToken(user: tEthereumAddress): Promise<tStringDecimalUnits> {
    const stakedTokenAddress = await this.getStakedToken();
    return this.erc20Service.balanceOf(stakedTokenAddress, user);
  }

  public async getUserStakeAvailableToWithdraw(user: tEthereumAddress): Promise<tStringDecimalUnits> {
    const userStakeAvailableToWithdraw: BigNumber = await this.contract.getStakeAvailableToWithdraw(user);
    return formatUnits(userStakeAvailableToWithdraw, USDC_TOKEN_DECIMALS);
  }

  public async getUserStakePendingWithdraw(user: tEthereumAddress): Promise<tStringDecimalUnits> {
    const [
      currentEpochInactive,
      nextEpochInactive,
    ]: [
      BigNumber,
      BigNumber,
    ] = await Promise.all([
      this.contract.getInactiveBalanceCurrentEpoch(user),
      this.contract.getInactiveBalanceNextEpoch(user),
    ]);
    const userStakePendingWithdrawal: BigNumber = nextEpochInactive.sub(currentEpochInactive);
    return formatUnits(userStakePendingWithdrawal, USDC_TOKEN_DECIMALS);
  }

  public async getUserUnclaimedRewards(user: tEthereumAddress): Promise<tStringDecimalUnits> {
    const userUnclaimedRewards: BigNumber = await this.contract.callStatic.claimRewards(user, { from: user });
    return formatUnits(userUnclaimedRewards, DYDX_TOKEN_DECIMALS);
  }

  public async getTimeRemainingInCurrentEpoch(): Promise<BigNumber> {
    return this.contract.getTimeRemainingInCurrentEpoch();
  }

  public async getLengthOfBlackoutWindow(): Promise<BigNumber> {
    return this.contract.getBlackoutWindow();
  }
}
