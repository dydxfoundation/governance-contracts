import { formatEther, parseEther } from '@ethersproject/units';
import BNJS from 'bignumber.js';
import {
  Multicall,
  ContractCallResults,
  ContractCallContext,
} from 'ethereum-multicall';
import { BigNumber } from 'ethers';

import multicallAbi from '../../../abi/contracts/dependencies/makerdao/multicall2.sol/Multicall2.json';
import dydxTokenAbi from '../../../abi/contracts/governance/token/DydxToken.sol/DydxToken.json';
import liquidityModuleAbi from '../../../abi/contracts/liquidity/v1/LiquidityStakingV1.sol/LiquidityStakingV1.json';
import safetyModuleAbi from '../../../abi/contracts/safety/v1/SafetyModuleV1.sol/SafetyModuleV1.json';
import { DydxTokenFactory } from '../../../types';
import { DydxToken } from '../../../types/DydxToken';
import {
  dydxTokenAddresses,
  dydxTreasuryAddresses,
  MERKLE_DISTRIBUTOR_REWARDS_PER_EPOCH,
  LOCKED_ALLOCATION,
  ONE_DAY_SECONDS,
  RETROACTIVE_MINING_REWARDS,
  DYDX_TOKEN_DECIMALS,
  multicallAddresses,
} from '../config';
import {
  Configuration,
  tEthereumAddress,
  Network,
  tTokenAddresses,
  tTreasuryAddresses,
  tStringDecimalUnits,
  MulticallData,
  tMulticallAddresses,
} from '../types';
import { RootUpdatedMetadata } from '../types/GovernanceReturnTypes';
import BaseService from './BaseService';
import ERC20Service from './ERC20';
import LiquidityModule from './LiquidityModule';
import MerkleDistributor from './MerkleDistributor';
import SafetyModule from './SafetyModule';


export default class DydxTokenService extends BaseService<DydxToken> {

  readonly erc20Service: ERC20Service;
  readonly tokenAddress: tEthereumAddress;
  readonly treasuryAddresses: tTreasuryAddresses;
  readonly safetyModule: SafetyModule;
  readonly liquidityModule: LiquidityModule;
  readonly merkleDistributor: MerkleDistributor;
  private _multicallData: MulticallData;

  constructor(
    config: Configuration,
    erc20Service: ERC20Service,
    safetyModule: SafetyModule,
    liquidityModule: LiquidityModule,
    merkleDistributor: MerkleDistributor,
    hardhatTokenAddresses?: tTokenAddresses,
    hardhatTreasuryAddresses?: tTreasuryAddresses,
    hardhatMulticallAddress?: tMulticallAddresses,
  ) {
    super(config, DydxTokenFactory);
    this.erc20Service = erc20Service;

    const { network } = this.config;
    const isHardhatNetwork: boolean = network === Network.hardhat;
    if (
      isHardhatNetwork &&
      (
        !hardhatTokenAddresses ||
        !hardhatTreasuryAddresses ||
        !hardhatMulticallAddress
      )
    ) {
      throw new Error('Must specify token and treasury addresses when on hardhat network');
    }
    const tokenAddresses: tTokenAddresses = isHardhatNetwork ? hardhatTokenAddresses! : dydxTokenAddresses[network];
    this.tokenAddress = tokenAddresses.TOKEN_ADDRESS;

    this.treasuryAddresses = isHardhatNetwork ? hardhatTreasuryAddresses! : dydxTreasuryAddresses[network];

    this.safetyModule = safetyModule;

    this.liquidityModule = liquidityModule;

    this.merkleDistributor = merkleDistributor;

    const multicallAddress: tMulticallAddresses = isHardhatNetwork
      ? hardhatMulticallAddress!
      : multicallAddresses[network];

    const multicall = new Multicall({
      multicallCustomContractAddress: multicallAddress.MULTICALL_ADDRESS,
      ethersProvider: this.config.provider,
    });

    this._multicallData = {
      multicall,
      multicallAddress: multicallAddress.MULTICALL_ADDRESS,
    };
  }

  get contract(): DydxToken {
    return this.getContractInstance(this.tokenAddress);
  }

  public decimalsOf = (): number => {
    return DYDX_TOKEN_DECIMALS;
  };

  public totalSupply = async (): Promise<tStringDecimalUnits> => {
    return this.erc20Service.totalSupply(this.tokenAddress);
  };

  public balanceOf = async (user: tEthereumAddress): Promise<tStringDecimalUnits> => {
    return this.erc20Service.balanceOf(this.tokenAddress, user);
  };

  public distributedToday = async (): Promise<tStringDecimalUnits> => {
    const contractCallContext: ContractCallContext<{}>[] = [
      {
        reference: 'token',
        contractAddress: this.tokenAddress,
        abi: dydxTokenAbi,
        calls: [
          {
            reference: 'transferRestriction',
            methodName: '_transfersRestrictedBefore',
            methodParameters: [],
          },
        ],
      },
      {
        reference: 'safetyModule',
        contractAddress: this.safetyModule.contract.address,
        abi: safetyModuleAbi,
        calls: [
          {
            reference: 'rewardsPerSecond',
            methodName: 'getRewardsPerSecond',
            methodParameters: [],
          },
        ],
      },
      {
        reference: 'liquidityModule',
        contractAddress: this.liquidityModule.contract.address,
        abi: liquidityModuleAbi,
        calls: [
          {
            reference: 'rewardsPerSecond',
            methodName: 'getRewardsPerSecond',
            methodParameters: [],
          },
        ],
      },
      {
        reference: 'multicall',
        contractAddress: this._multicallData.multicallAddress,
        abi: multicallAbi,
        calls: [
          {
            reference: 'timeLatest',
            methodName: 'getCurrentBlockTimestamp',
            methodParameters: [],
          },
        ],
      },
    ];

    const [
      multiRes,
      rootUpdatedMetadata,
    ]: [
      ContractCallResults,
      RootUpdatedMetadata,
    ] = await Promise.all([
      this._multicallData.multicall.call(contractCallContext),
      this.merkleDistributor.getRootUpdatedMetadata(),
    ]);

    const tokenReturnContext = multiRes.results.token.callsReturnContext;
    const multicallReturnContext = multiRes.results.multicall.callsReturnContext;

    const transferRestriction: BigNumber = BigNumber.from(
      tokenReturnContext.find(c => c.reference === 'transferRestriction')
        ?.returnValues[0].hex,
    );

    const currentTimestamp: BigNumber = BigNumber.from(
      multicallReturnContext.find(c => c.reference === 'timeLatest')
        ?.returnValues[0].hex,
    );

    if (currentTimestamp.lt(transferRestriction)) {
      // Distributed today is 0 during transfer restriction
      return '0.0';
    }

    const safetyModuleReturnContext = multiRes.results.safetyModule.callsReturnContext;
    const liquidityModuleReturnContext = multiRes.results.liquidityModule.callsReturnContext;

    const safetyModuleRewardsPerSecond: tStringDecimalUnits = formatEther(
      BigNumber.from(
        safetyModuleReturnContext.find(c => c.reference === 'rewardsPerSecond')
          ?.returnValues[0].hex,
      ),
    );

    const liquidityModuleRewardsPerSecond: tStringDecimalUnits = formatEther(
      BigNumber.from(
        liquidityModuleReturnContext.find(c => c.reference === 'rewardsPerSecond')
          ?.returnValues[0].hex,
      ),
    );

    // the earliest rewards can become liquid is after the transfer restriction period
    const lastClaimableMerkleRewardsTimestamp: number = Math.max(
      transferRestriction.toNumber(),
      rootUpdatedMetadata.lastRootUpdatedTimestamp,
    );

    let dailyMerkleDistributorRewards: BNJS = new BNJS(0);
    const secondsSinceClaimableMerkleRewards: BigNumber = currentTimestamp.sub(lastClaimableMerkleRewardsTimestamp);
    if (rootUpdatedMetadata.numRootUpdates > 0 && secondsSinceClaimableMerkleRewards.lte(ONE_DAY_SECONDS.toNumber())) {
      dailyMerkleDistributorRewards = new BNJS(MERKLE_DISTRIBUTOR_REWARDS_PER_EPOCH);

      if (rootUpdatedMetadata.numRootUpdates === 1) {
        // The first root update includes retroactive rewards
        dailyMerkleDistributorRewards = dailyMerkleDistributorRewards.plus(RETROACTIVE_MINING_REWARDS);
      }
    }

    const dailySafetyRewards: BNJS = new BNJS(safetyModuleRewardsPerSecond)
      .multipliedBy(ONE_DAY_SECONDS.toNumber());

    let dailyLiquidityRewards: BNJS = new BNJS(liquidityModuleRewardsPerSecond)
      .multipliedBy(ONE_DAY_SECONDS.toNumber());

    const secondsSinceTransferRestrictionEnd: BigNumber = currentTimestamp.sub(transferRestriction);
    if (secondsSinceTransferRestrictionEnd.lte(ONE_DAY_SECONDS.toNumber())) {
      // within one day of transfer restriction end, previous 36 days of liquidity module rewards
      // become liquid
      const preTransferRestrictionLiquidityStakingRewards = new BNJS(liquidityModuleRewardsPerSecond)
        .multipliedBy(ONE_DAY_SECONDS.toNumber())
        .multipliedBy(36);
      dailyLiquidityRewards = dailyLiquidityRewards.plus(preTransferRestrictionLiquidityStakingRewards);
    }

    const distributedToday: tStringDecimalUnits = dailySafetyRewards
      .plus(dailyLiquidityRewards)
      .plus(dailyMerkleDistributorRewards)
      .toFixed();

    return distributedToday;
  };

  public circulatingSupply = async (): Promise<tStringDecimalUnits> => {
    const contractCallContext: ContractCallContext<{}>[] = [
      {
        reference: 'token',
        contractAddress: this.tokenAddress,
        abi: dydxTokenAbi,
        calls: [
          {
            reference: 'transferRestriction',
            methodName: '_transfersRestrictedBefore',
            methodParameters: [],
          },
          {
            reference: 'totalSupply',
            methodName: 'totalSupply',
            methodParameters: [],
          },
          {
            reference: 'rewardsTreasuryBalance',
            methodName: 'balanceOf',
            methodParameters: [this.treasuryAddresses.REWARDS_TREASURY_ADDRESS],
          },
          {
            reference: 'rewardsTreasuryVesterBalance',
            methodName: 'balanceOf',
            methodParameters: [this.treasuryAddresses.REWARDS_TREASURY_VESTER_ADDRESS],
          },
          {
            reference: 'communityTreasuryBalance',
            methodName: 'balanceOf',
            methodParameters: [this.treasuryAddresses.COMMUNITY_TREASURY_ADDRESS],
          },
          {
            reference: 'communityTreasuryVesterBalance',
            methodName: 'balanceOf',
            methodParameters: [this.treasuryAddresses.COMMUNITY_TREASURY_VESTER_ADDRESS],
          },
        ],
      },
      {
        reference: 'multicall',
        contractAddress: this._multicallData.multicallAddress,
        abi: multicallAbi,
        calls: [
          {
            reference: 'timeLatest',
            methodName: 'getCurrentBlockTimestamp',
            methodParameters: [],
          },
        ],
      },
    ];

    const multiRes: ContractCallResults = await this._multicallData.multicall.call(contractCallContext);

    const tokenReturnContext = multiRes.results.token.callsReturnContext;
    const multicallReturnContext = multiRes.results.multicall.callsReturnContext;

    const transferRestriction: BigNumber = BigNumber.from(
      tokenReturnContext.find(c => c.reference === 'transferRestriction')
        ?.returnValues[0].hex,
    );

    const totalSupply: BigNumber = BigNumber.from(
      tokenReturnContext.find(c => c.reference === 'totalSupply')
        ?.returnValues[0].hex,
    );

    const rewardsTreasuryBalance: BigNumber = BigNumber.from(
      tokenReturnContext.find(c => c.reference === 'rewardsTreasuryBalance')
        ?.returnValues[0].hex,
    );

    const rewardsTreasuryVesterBalance: BigNumber = BigNumber.from(
      tokenReturnContext.find(c => c.reference === 'rewardsTreasuryVesterBalance')
        ?.returnValues[0].hex,
    );

    const communityTreasuryBalance: BigNumber = BigNumber.from(
      tokenReturnContext.find(c => c.reference === 'communityTreasuryBalance')
        ?.returnValues[0].hex,
    );

    const communityTreasuryVesterBalance: BigNumber = BigNumber.from(
      tokenReturnContext.find(c => c.reference === 'communityTreasuryVesterBalance')
        ?.returnValues[0].hex,
    );

    const currentTimestamp: BigNumber = BigNumber.from(
      multicallReturnContext.find(c => c.reference === 'timeLatest')
        ?.returnValues[0].hex,
    );

    if (currentTimestamp.lt(transferRestriction)) {
      // Circulating supply is 0 before transfer restriction end
      return '0.0';
    }

    // circulatingSupply = total supply - illiquid supply
    // We consider all tokens owned by the treasuries + treasury vesters to be illiquid
    // supply since it would require a governance vote + sufficient time for vesting to move the funds.
    const circulatingSupplyWei: BigNumber = totalSupply
      .sub(parseEther(LOCKED_ALLOCATION))
      .sub(rewardsTreasuryBalance)
      .sub(rewardsTreasuryVesterBalance)
      .sub(communityTreasuryBalance)
      .sub(communityTreasuryVesterBalance);

    return formatEther(circulatingSupplyWei);
  };
}
