import { Multicall } from 'ethereum-multicall';
import { providers, BytesLike, PopulatedTransaction } from 'ethers';

export type tEthereumAddress = string;
export type tStringCurrencyUnits = string; // e.g. 2.5 eth
export type tStringDecimalUnits = string; // e.g. 2500000000000000000
export type ENS = string; // e.g. something.eth

export enum DelegationType {
  VOTING_POWER = 0,
  PROPOSITION_POWER = 1,
}

export enum UserCooldownStatus {
  // cooldown was not initiated for user's current staked funds
  COOLDOWN_NOT_INITIATED,
  // cooldown was initiated for user's current staked funds, but before
  // start of unstake window
  COOLDOWN_INITIATED,
  // within unstake window, user can unstake funds that went through cooldown
  WITHIN_UNSTAKE_WINDOW,
  // after unstake window, user cannot unstake funds and must re-initiate cooldown
  AFTER_UNSTAKE_WINDOW,
}

export type GovernanceTokens = {
  TOKEN: tEthereumAddress,
  STAKED_TOKEN: tEthereumAddress,
};

export type GovTokenDelegatees = {
  PROPOSITION_DELEGATEE: tEthereumAddress,
  VOTING_DELEGATEE: tEthereumAddress,
};

export type UserGovernanceDelegatees = {
  // undefined if user has 0 balance of underlying token
  TOKEN?: GovTokenDelegatees,
  // undefined if user has 0 balance of underlying token
  STAKED_TOKEN?: GovTokenDelegatees,
};

/** InterestRate options */
export enum InterestRate {
  None = 'None',
  Stable = 'Stable',
  Variable = 'Variable',
}

export enum Market {
  Proto = 'proto',
  AMM = 'amm',
}

export enum Network {
  main = 'main',
  ropsten = 'ropsten',
  hardhat = 'hardhat',
}

export enum ChainId {
  main = 1,
  ropsten = 3,
  hardhat = 31337,
}

export enum eEthereumTxType {
  ERC20_APPROVAL = 'ERC20_APPROVAL',
  GOVERNANCE_ACTION = 'GOVERNANCE_ACTION',
  GOV_DELEGATION_ACTION = 'GOV_DELEGATION_ACTION',
  LIQUIDITY_MODULE_ACTION = 'LIQUIDITY_MODULE_ACTION',
  SAFETY_MODULE_ACTION = 'SAFETY_MODULE_ACTION',
  MERKLE_DISTRIBUTOR_ACTION = 'MERKLE_DISTRIBUTOR_ACTION',
  CLAIMS_PROXY_ACTION = 'CLAIMS_PROXY_ACTION',
}

export enum ProtocolAction {
  default = 'default',
  withdraw = 'withdraw',
  deposit = 'deposit',
  liquidationCall = 'liquidationCall',
  liquidationFlash = 'liquidationFlash',
  repay = 'repay',
  swapCollateral = 'swapCollateral',
  repayCollateral = 'repayCollateral',
  withdrawETH = 'withdrawETH',
  borrowETH = 'borrwoETH',
}

export enum GovernanceVote {
  Abstain = 0,
  Yes = 1,
  No = 2,
}

export enum Stake {
  Dydx = 'Dydx',
}

export type GasRecommendationType = {
  [action: string]: {
    limit: string;
    recommended: string;
  };
};

export type GeneratedTx = {
  tx: transactionType;
  gas: {
    price: string;
    limit: string;
  };
};

export type transactionType = {
  value?: string;
  from?: string;
  to?: string;
  nonce?: number;
  gasLimit?: number;
  gasPrice?: number;
  data?: string;
  chainId?: number;
};

export type tDistinctGovernanceAddresses = {
  DYDX_GOVERNANCE: tEthereumAddress;
  DYDX_GOVERNANCE_EXECUTOR_SHORT: tEthereumAddress;
  DYDX_GOVERNANCE_EXECUTOR_LONG: tEthereumAddress;
  DYDX_GOVERNANCE_EXECUTOR_MERKLE_PAUSER: tEthereumAddress;
  DYDX_GOVERNANCE_PRIORITY_EXECUTOR_STARKWARE: tEthereumAddress;
  DYDX_GOVERNANCE_STRATEGY: tEthereumAddress;
};

export type tTokenAddresses = {
  TOKEN_ADDRESS: tEthereumAddress;
};

export type tTreasuryAddresses = {
  REWARDS_TREASURY_ADDRESS: tEthereumAddress;
  REWARDS_TREASURY_VESTER_ADDRESS: tEthereumAddress;
  COMMUNITY_TREASURY_ADDRESS: tEthereumAddress;
  COMMUNITY_TREASURY_VESTER_ADDRESS: tEthereumAddress;
};

export type tSafetyModuleAddresses = {
  SAFETY_MODULE_ADDRESS: tEthereumAddress;
};

export type tLiquidityModuleAddresses = {
  LIQUIDITY_MODULE_ADDRESS: tEthereumAddress;
};

export type tMerkleDistributorAddresses = {
  MERKLE_DISTRIBUTOR_ADDRESS: tEthereumAddress;
};

export type tClaimsProxyAddresses = {
  CLAIMS_PROXY_ADDRESS: tEthereumAddress;
};

export type tMulticallAddresses = {
  MULTICALL_ADDRESS: tEthereumAddress;
};

export type MulticallData = {
  multicall: Multicall;
  multicallAddress: string;
};

export type Configuration = {
  network: Network;
  provider:
  | providers.JsonRpcProvider
  | providers.BaseProvider
  | providers.Web3Provider;
  ipfsTimeoutMs?: number;
};

export type EthereumTransactionTypeExtended = {
  txType: eEthereumTxType;
  tx: () => Promise<transactionType>;
  gas: GasResponse;
};

export type TransactionGenerationMethod = {
  rawTxMethod: () => Promise<PopulatedTransaction>;
  from: tEthereumAddress;
  value?: string;
  gasSurplus?: number;
  action?: ProtocolAction;
  gasLimit?: number;
};

export type TransactionGasGenerationMethod = {
  txCallback: () => Promise<transactionType>;
  action?: ProtocolAction;
};

export type GasType = {
  gasLimit: string | undefined;
  gasPrice: string;
};
export type GasResponse = (force?: boolean) => Promise<GasType | null>;

export type TokenMetadataType = {
  name: string;
  symbol: string;
  decimals: number;
  address: string;
};

export type DefaultProviderKeys = {
  etherscan?: string;
  infura?: string;
  alchemy?: string;
};

export type GovernanceConfigType = {
  [network: string]: tDistinctGovernanceAddresses;
};

export type TokenConfigType = {
  [network: string]: tTokenAddresses;
};

export type TreasuryConfigType = {
  [network: string]: tTreasuryAddresses;
};

export type StakingConfigType = {
  [network: string]: tSafetyModuleAddresses;
};

export type LiquidityModuleConfigType = {
  [network: string]: tLiquidityModuleAddresses;
};

export type MerkleDistributorConfigType = {
  [network: string]: tMerkleDistributorAddresses;
};

export type ClaimsProxyConfigType = {
  [network: string]: tClaimsProxyAddresses;
};

export type MulticallConfigType = {
  [network: string]: tMulticallAddresses;
};

export type PermitSignature = {
  amount: tStringCurrencyUnits;
  deadline: string;
  v: number;
  r: BytesLike;
  s: BytesLike;
};
