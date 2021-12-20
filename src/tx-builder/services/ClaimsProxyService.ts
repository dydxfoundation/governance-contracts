import { BigNumber } from '@ethersproject/bignumber';
import BNJS from 'bignumber.js';
import { formatEther } from 'ethers/lib/utils';

import {
  ClaimsProxy__factory,
  DydxToken__factory,
} from '../../../types';
import {
  ClaimsProxy,
} from '../../../types/ClaimsProxy';
import { DydxToken } from '../../../types/DydxToken';
import {
  claimsProxyAddresses,
  dydxTokenAddresses,
  dydxTreasuryAddresses,
} from '../config';
import {
  Configuration,
  eEthereumTxType,
  EthereumTransactionTypeExtended,
  Network,
  tEthereumAddress,
  transactionType,
  tClaimsProxyAddresses,
} from '../types';
import { MerkleProof } from '../types/GovernanceReturnTypes';
import { tTokenAddresses, tTreasuryAddresses, tStringDecimalUnits } from '../types/index';
import { StakingValidator } from '../validators/methodValidators';
import BaseService from './BaseService';
import LiquidityModule from './LiquidityModule';
import MerkleDistributor from './MerkleDistributor';
import SafetyModule from './SafetyModule';

export default class ClaimsProxyService extends BaseService<ClaimsProxy> {

  readonly claimsProxyAddress: string;
  readonly tokenAddress: tEthereumAddress;
  readonly treasuryAddresses: tTreasuryAddresses;
  readonly safetyModule: SafetyModule;
  readonly liquidityModule: LiquidityModule;
  readonly merkleDistributor: MerkleDistributor;

  constructor(
    config: Configuration,
    safetyModule: SafetyModule,
    liquidityModule: LiquidityModule,
    merkleDistributor: MerkleDistributor,
    hardhatClaimsProxyAddresses?: tClaimsProxyAddresses,
    hardhatTokenAddresses?: tTokenAddresses,
    hardhatTreasuryAddresses?: tTreasuryAddresses,
  ) {
    super(config, ClaimsProxy__factory);
    this.safetyModule = safetyModule;
    this.liquidityModule = liquidityModule;
    this.merkleDistributor = merkleDistributor;

    // Get the contract address.
    const { network } = this.config;
    const isHardhatNetwork: boolean = network === Network.hardhat;
    if (
      isHardhatNetwork &&
      (
        !hardhatClaimsProxyAddresses ||
        !hardhatTokenAddresses ||
        !hardhatTreasuryAddresses
      )
    ) {
      throw new Error('Must specify token and treasury addresses when on hardhat network');
    }

    const tokenAddresses: tTokenAddresses = isHardhatNetwork ? hardhatTokenAddresses! : dydxTokenAddresses[network];
    this.tokenAddress = tokenAddresses.TOKEN_ADDRESS;

    this.treasuryAddresses = isHardhatNetwork ? hardhatTreasuryAddresses! : dydxTreasuryAddresses[network];

    const addresses: tClaimsProxyAddresses = isHardhatNetwork
      ? hardhatClaimsProxyAddresses!
      : claimsProxyAddresses[network];
    this.claimsProxyAddress = addresses.CLAIMS_PROXY_ADDRESS;
  }

  get contract(): ClaimsProxy {
    return this.getContractInstance(this.claimsProxyAddress);
  }

  @StakingValidator
  public async claimRewards(
    user: tEthereumAddress,
  ): Promise<EthereumTransactionTypeExtended[]> {
    const { provider }: Configuration = this.config;
    const dydxToken: DydxToken = DydxToken__factory.connect(this.tokenAddress, provider) as DydxToken;

    const [
      safetyModuleRewards,
      liquidityStakingRewards,
      merkleProof,
      rewardsTreasuryBalance,
    ]: [
      tStringDecimalUnits,
      tStringDecimalUnits,
      MerkleProof,
      BigNumber,
    ] = await Promise.all([
      this.safetyModule.getUserUnclaimedRewards(user),
      this.liquidityModule.getUserUnclaimedRewards(user),
      this.merkleDistributor.getActiveRootMerkleProof(user),
      dydxToken.balanceOf(this.treasuryAddresses.REWARDS_TREASURY_ADDRESS),
    ]);

    const hasSafetyModuleRewards = !new BNJS(safetyModuleRewards).isZero();
    const hasLiquidityStakingRewards = !new BNJS(liquidityStakingRewards).isZero();

    const userUnclaimedRewards: BigNumber = await this.contract.callStatic.claimRewards(
      true,
      true,
      merkleProof.cumulativeAmount,
      merkleProof.merkleProof,
      true,
      { from: user },
    );
    const vestFromTreasuryVester: boolean = rewardsTreasuryBalance.lt(userUnclaimedRewards);

    const txCallback: () => Promise<transactionType> = this.generateTxCallback({
      rawTxMethod: () =>
        this.contract.populateTransaction.claimRewards(
          hasSafetyModuleRewards,
          hasLiquidityStakingRewards,
          merkleProof.cumulativeAmount,
          merkleProof.merkleProof,
          vestFromTreasuryVester,
        ),
      from: user,
      gasLimit: 600_000,
    });

    return [
      {
        tx: txCallback,
        txType: eEthereumTxType.CLAIMS_PROXY_ACTION,
        gas: this.generateTxPriceEstimation([], txCallback),
      },
    ];
  }

  public async getUserUnclaimedRewards(user: tEthereumAddress): Promise<tStringDecimalUnits> {
    const merkleProof: MerkleProof = await this.merkleDistributor.getActiveRootMerkleProof(user);

    const userUnclaimedRewards: BigNumber = await this.contract.callStatic.claimRewards(
      true,
      true,
      merkleProof.cumulativeAmount,
      merkleProof.merkleProof,
      true,
      { from: user },
    );
    
    return formatEther(userUnclaimedRewards);
  }
}
