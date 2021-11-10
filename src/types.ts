import BNJS from 'bignumber.js';
import {
  BigNumberish,
  BytesLike,
} from 'ethers';

import { deployStarkProxyV2 } from './migrations/deploy-stark-proxy-v2';
import { deployMocks } from './migrations/helpers/deploy-mocks';
import { deployPhase1 } from './migrations/phase-1';
import { deployPhase2 } from './migrations/phase-2';
import { deploySafetyModuleRecovery } from './migrations/safety-module-recovery';
export * from './deploy-config/types';

export type UnwrapPromise<T> = T extends Promise<infer U> ? U : never;

export type BigNumberable = BNJS | string | number;

export type AllDeployedContracts = (
  UnwrapPromise<ReturnType<typeof deployPhase1>> &
  UnwrapPromise<ReturnType<typeof deployPhase2>> &
  UnwrapPromise<ReturnType<typeof deploySafetyModuleRecovery>> &
  UnwrapPromise<ReturnType<typeof deployStarkProxyV2>> &
  UnwrapPromise<ReturnType<typeof deployMocks>>
);

export type MainnetDeployedContracts = Omit<AllDeployedContracts, 'starkProxyNewImpl'>;

export type Proposal = [
  string,
  string[],
  BigNumberish[],
  string[],
  BytesLike[],
  boolean[],
  string,
];

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
  BORROWER_ADMIN_ROLE = 'BORROWER_ADMIN_ROLE',
  BORROWER_ROLE = 'BORROWER_ROLE',
  CLAIM_OPERATOR_ROLE = 'CLAIM_OPERATOR_ROLE',
  CONFIG_UPDATER_ROLE = 'CONFIG_UPDATER_ROLE',
  DELEGATION_ADMIN_ROLE = 'DELEGATION_ADMIN_ROLE',
  EPOCH_PARAMETERS_ROLE = 'EPOCH_PARAMETERS_ROLE',
  EXCHANGE_OPERATOR_ROLE = 'EXCHANGE_OPERATOR_ROLE',
  GUARDIAN_ROLE = 'GUARDIAN_ROLE',
  OWNER_ROLE = 'OWNER_ROLE',
  PAUSER_ROLE = 'PAUSER_ROLE',
  REWARDS_RATE_ROLE = 'REWARDS_RATE_ROLE',
  SLASHER_ROLE = 'SLASHER_ROLE',
  STAKE_OPERATOR_ROLE = 'STAKE_OPERATOR_ROLE',
  UNPAUSER_ROLE = 'UNPAUSER_ROLE',
  VETO_GUARDIAN_ROLE = 'VETO_GUARDIAN_ROLE',
  WITHDRAWAL_OPERATOR_ROLE = 'WITHDRAWAL_OPERATOR_ROLE',
}
