import { BigNumberish } from 'ethers';

import { BaseConfig } from './base-config';

export interface TimelockConfig {
  DELAY: number;
  GRACE_PERIOD: number;
  MINIMUM_DELAY: number;
  MAXIMUM_DELAY: number;
  PROPOSITION_THRESHOLD: number;
  VOTING_DURATION_BLOCKS: number;
  VOTE_DIFFERENTIAL: number;
  MINIMUM_QUORUM: number;
}

export interface TreasuryVesterConfig {
  VESTING_AMOUNT: BigNumberish;
  VESTING_BEGIN: number;
  VESTING_CLIFF: number;
  VESTING_END: number;
}

export interface MerkleDistributorConfig {
  IPNS_NAME: string;
  IPFS_UPDATE_PERIOD: number;
  MARKET_MAKER_REWARDS_AMOUNT: number;
  TRADER_REWARDS_AMOUNT: number;
  TRADER_SCORE_ALPHA: number;
}

export interface StarkProxyConfig {
  BORROWER_CONFIGS: {
    BORROWER_ADDRESS: string,
    BORROWER_ALLOCATION: number,
  }[];
}

export interface DeployConfig extends BaseConfig {
  EPOCH_ZERO_START: number;
  TRANSFERS_RESTRICTED_BEFORE: number;
  TRANSFER_RESTRICTION_LIFTED_NO_LATER_THAN: number;
  MINTING_RESTRICTED_BEFORE: number;
  LS_DISTRIBUTION_START: number;
  LS_DISTRIBUTION_END: number;
  SM_DISTRIBUTION_START: number;
  SM_DISTRIBUTION_END: number;
  REWARDS_TREASURY_VESTER_CONFIG: TreasuryVesterConfig;
  COMMUNITY_TREASURY_VESTER_CONFIG: TreasuryVesterConfig;
}
