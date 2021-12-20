import { Client, createClient } from '@urql/core';
import { providers } from 'ethers';

import {
  ROPSTEN_SUBGRAPH_URL,
  MAINNET_SUBGRAPH_URL,
} from './config';
import ClaimsProxyService from './services/ClaimsProxyService';
import DydxGovernance from './services/DydxGovernance';
import DydxGovernanceService from './services/DydxGovernance';
import DydxTokenService from './services/DydxToken';
import GovernanceDelegationTokenService from './services/GovernanceDelegationTokenService';
import LiquidityModuleService from './services/LiquidityModule';
import MerkleDistributorService from './services/MerkleDistributor';
import SafetyModuleService from './services/SafetyModule';
import SafetyModule from './services/SafetyModule';
import BaseTxBuilder from './txBuilder';
import {
  Network,
  DefaultProviderKeys,
  tDistinctGovernanceAddresses,
  tSafetyModuleAddresses,
  tLiquidityModuleAddresses,
  tTokenAddresses,
  tTreasuryAddresses,
  tClaimsProxyAddresses,
  tMerkleDistributorAddresses,
} from './types';
import 'isomorphic-unfetch';
import { tMulticallAddresses } from './types/index';
import { getGovernanceTokens } from './utils/helpers';

export default class TxBuilder extends BaseTxBuilder {

  public dydxGovernanceService: DydxGovernance;

  public dydxTokenService: DydxTokenService;

  public governanceDelegationTokenService: GovernanceDelegationTokenService;

  public liquidityModuleService: LiquidityModuleService;

  public safetyModuleService: SafetyModule;

  public merkleDistributorService: MerkleDistributorService;

  public claimsProxyService: ClaimsProxyService;

  constructor(
    {
      network,
      hardhatGovernanceAddresses = {
        DYDX_GOVERNANCE: '',
        DYDX_GOVERNANCE_EXECUTOR_SHORT: '',
        DYDX_GOVERNANCE_EXECUTOR_LONG: '',
        DYDX_GOVERNANCE_EXECUTOR_MERKLE_PAUSER: '',
        DYDX_GOVERNANCE_PRIORITY_EXECUTOR_STARKWARE: '',
        DYDX_GOVERNANCE_STRATEGY: '',
      },
      hardhatTokenAddresses = {
        TOKEN_ADDRESS: '',
      },
      hardhatTreasuryAddresses = {
        REWARDS_TREASURY_ADDRESS: '',
        REWARDS_TREASURY_VESTER_ADDRESS: '',
        COMMUNITY_TREASURY_ADDRESS: '',
        COMMUNITY_TREASURY_VESTER_ADDRESS: '',
      },
      hardhatSafetyModuleAddresses = {
        SAFETY_MODULE_ADDRESS: '',
      },
      hardhatLiquidityModuleAddresses = {
        LIQUIDITY_MODULE_ADDRESS: '',
      },
      hardhatMerkleDistributorAddresses = {
        MERKLE_DISTRIBUTOR_ADDRESS: '',
      },
      hardhatClaimsProxyAddresses = {
        CLAIMS_PROXY_ADDRESS: '',
      },
      hardhatMulticallAddresses = {
        MULTICALL_ADDRESS: '',
      },
      injectedProvider,
      defaultProviderKeys,
    }: {
      network: Network,
      hardhatGovernanceAddresses?: tDistinctGovernanceAddresses,
      hardhatTokenAddresses?: tTokenAddresses,
      hardhatTreasuryAddresses?: tTreasuryAddresses,
      hardhatSafetyModuleAddresses?: tSafetyModuleAddresses,
      hardhatLiquidityModuleAddresses?: tLiquidityModuleAddresses,
      hardhatMerkleDistributorAddresses?: tMerkleDistributorAddresses,
      hardhatClaimsProxyAddresses?: tClaimsProxyAddresses,
      hardhatMulticallAddresses?: tMulticallAddresses,
      injectedProvider?:
      | providers.ExternalProvider
      | providers.Web3Provider
      | providers.JsonRpcProvider
      | string
      | undefined,
      defaultProviderKeys?: DefaultProviderKeys
    },
  ) {
    super(network, injectedProvider, defaultProviderKeys);

    let subgraphClient: Client;
    switch (network) {
      case Network.ropsten:
        subgraphClient = createClient({
          url: ROPSTEN_SUBGRAPH_URL,
        });
        break;
      case Network.main:
        subgraphClient = createClient({
          url: MAINNET_SUBGRAPH_URL,
        });
        break;
      case Network.hardhat:
        console.log('No subgraph functionality on hardhat network (all subgraph calls should be mocked).');
        subgraphClient = {
          query: () => {
            throw new Error('All subgraph queries must be mocked on hardhat network');
          },
        } as any as Client;
        break;
      default: {
        throw new Error(`No subgraph functionality on network ${network}.`);
      }
    }

    this.governanceDelegationTokenService = new GovernanceDelegationTokenService(
      this.configuration,
    );
    this.dydxGovernanceService = new DydxGovernanceService(
      this.configuration,
      this.erc20Service,
      this.governanceDelegationTokenService,
      subgraphClient,
      getGovernanceTokens(network, hardhatTokenAddresses, hardhatSafetyModuleAddresses),
      hardhatGovernanceAddresses,
    );
    this.safetyModuleService = new SafetyModuleService(
      this.configuration,
      this.erc20Service,
      hardhatSafetyModuleAddresses,
    );
    this.liquidityModuleService = new LiquidityModuleService(
      this.configuration,
      this.erc20Service,
      hardhatLiquidityModuleAddresses,
    );
    this.merkleDistributorService = new MerkleDistributorService(
      this.configuration,
      this.erc20Service,
      hardhatMerkleDistributorAddresses,
    );
    this.claimsProxyService = new ClaimsProxyService(
      this.configuration,
      this.safetyModuleService,
      this.liquidityModuleService,
      this.merkleDistributorService,
      hardhatClaimsProxyAddresses,
      hardhatTokenAddresses,
      hardhatTreasuryAddresses,
    );
    this.dydxTokenService = new DydxTokenService(
      this.configuration,
      this.erc20Service,
      this.safetyModuleService,
      this.liquidityModuleService,
      this.merkleDistributorService,
      hardhatTokenAddresses,
      hardhatTreasuryAddresses,
      hardhatMulticallAddresses,
    );
  }
}
