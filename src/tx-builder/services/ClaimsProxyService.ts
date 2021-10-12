import BNJS from 'bignumber.js';
import { BytesLike, formatUnits } from 'ethers/lib/utils';

import {
  ClaimsProxyFactory,
} from '../../../types';
import {
  ClaimsProxy,
} from '../../../types/ClaimsProxy';
import { claimsProxyAddresses } from '../config';
import {
  Configuration,
  eEthereumTxType,
  EthereumTransactionTypeExtended,
  Network,
  tEthereumAddress,
  transactionType,
  tClaimsProxyAddresses,
  tStringCurrencyUnits,
} from '../types';
import { MerkleProof } from '../types/GovernanceReturnTypes';
import { StakingValidator } from '../validators/methodValidators';
import BaseService from './BaseService';
import LiquidityModule from './LiquidityModule';
import MerkleDistributor from './MerkleDistributor';
import SafetyModule from './SafetyModule';

export default class ClaimsProxyService extends BaseService<ClaimsProxy> {

  readonly claimsProxyAddress: string;
  readonly rewardTokenDecimals: number;
  readonly safetyModule: SafetyModule;
  readonly liquidityModule: LiquidityModule;
  readonly merkleDistributor: MerkleDistributor;

  constructor(
    config: Configuration,
    safetyModule: SafetyModule,
    liquidityModule: LiquidityModule,
    merkleDistributor: MerkleDistributor,
    rewardTokenDecimals: number,
    hardhatAddresses?: tClaimsProxyAddresses,
  ) {
    super(config, ClaimsProxyFactory);
    this.rewardTokenDecimals = rewardTokenDecimals;
    this.safetyModule = safetyModule;
    this.liquidityModule = liquidityModule;
    this.merkleDistributor = merkleDistributor;

    // Get the contract address.
    const { network } = this.config;
    const isHardhatNetwork: boolean = network === Network.hardhat;
    if (isHardhatNetwork && !hardhatAddresses) {
      throw new Error('Must specify claims proxy addresses when on hardhat network');
    }
    const addresses: tClaimsProxyAddresses = isHardhatNetwork
      ? hardhatAddresses!
      : claimsProxyAddresses[network];
    this.claimsProxyAddress = addresses.CLAIMS_PROXY_ADDRESS;
  }

  get contract(): ClaimsProxy {
    return this.getContractInstance(this.claimsProxyAddress);
  }

  @StakingValidator
  public async claimRewards(
    user: tEthereumAddress,
    vestFromTreasuryVester?: boolean,
  ): Promise<EthereumTransactionTypeExtended[]> {
    const hasSafetyModuleRewards = !new BNJS(
      await this.safetyModule.getUserUnclaimedRewards(user),
    ).isZero();
    const hasLiquidityStakingRewards = !new BNJS(
      await this.liquidityModule.getUserUnclaimedRewards(user),
    ).isZero();
    const merkleProof: MerkleProof = await this.merkleDistributor.getActiveRootMerkleProof(user);

    const txCallback: () => Promise<transactionType> = this.generateTxCallback({
      rawTxMethod: () =>
        this.contract.populateTransaction.claimRewards(
          hasSafetyModuleRewards,
          hasLiquidityStakingRewards,
          merkleProof.cumulativeAmount,
          merkleProof.merkleProof,
          vestFromTreasuryVester || false,
        ),
      from: user,
      gasLimit: 450_000,
    });

    return [
      {
        tx: txCallback,
        txType: eEthereumTxType.CLAIMS_PROXY_ACTION,
        gas: this.generateTxPriceEstimation([], txCallback),
      },
    ];
  }

  public async getUserUnclaimedRewards(user: tEthereumAddress): Promise<tStringCurrencyUnits> {
    const merkleProof: MerkleProof = await this.merkleDistributor.getActiveRootMerkleProof(user);
    const userUnclaimedRewards = await this.contract.callStatic.claimRewards(
      true,
      true,
      merkleProof.cumulativeAmount,
      merkleProof.merkleProof,
      true,
      { from: user },
    );
    return formatUnits(userUnclaimedRewards, this.rewardTokenDecimals);
  }
}
