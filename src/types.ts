import BNJS from 'bignumber.js';
import { BigNumberish } from 'ethers';

export type BigNumberable = BNJS | string | number;

export enum DelegationType {
  VOTING_POWER = 0,
  PROPOSITION_POWER = 1,
}

export enum NetworkName {
  mainnet = 'mainnet',
  ropsten = 'ropsten',
  kovan = 'kovan',
  hardhat = 'hardhat',
}

export enum Role {
  ADD_EXECUTOR_ROLE = 'ADD_EXECUTOR_ROLE',
  CLAIM_OPERATOR_ROLE = 'CLAIM_OPERATOR_ROLE',
  EPOCH_PARAMETERS_ROLE = 'EPOCH_PARAMETERS_ROLE',
  OWNER_ROLE = 'OWNER_ROLE',
  REWARDS_RATE_ROLE = 'REWARDS_RATE_ROLE',
  SLASHER_ROLE = 'SLASHER_ROLE',
  STAKE_OPERATOR_ROLE = 'STAKE_OPERATOR_ROLE',
}

export interface TimelockConfig {
  DELAY: number;
  GRACE_PERIOD: number;
  MINIMUM_DELAY: number;
  MAXIMUM_DELAY: number;
  PROPOSITION_THRESHOLD: number;
  VOTING_DURATION: number;
  VOTE_DIFFERENTIAL: number;
  MINIMUM_QUORUM: number;
}

export interface TreasuryVesterConfig {
  VESTING_AMOUNT: BigNumberish;
  VESTING_BEGIN: number;
  VESTING_CLIFF: number;
  VESTING_END: number;
}
