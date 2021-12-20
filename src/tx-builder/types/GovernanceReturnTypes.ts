import { BigNumber } from 'ethers';
import { BytesLike } from 'ethers/lib/utils';

import BalanceTree from '../../merkle-tree-helpers/balance-tree';
import { SubgraphProposalVote } from '../utils/subgraph';

import { tEthereumAddress, tStringDecimalUnits } from '.';

export enum ProposalState {
  Pending = 'Pending',
  Canceled = 'Canceled',
  Active = 'Active',
  Failed = 'Failed',
  Succeeded = 'Succeeded',
  Queued = 'Queued',
  Expired = 'Expired',
  Executed = 'Executed',
}

export type Proposal = {
  // on-chain proposal ID
  id: number;
  // Github proposal ID
  dipId: number;
  title: string;
  description: string;
  shortDescription: string;
  creator: tEthereumAddress;
  executor: tEthereumAddress;
  startBlock: number;
  endBlock: number;
  executionTime: string;
  executionTimeWithGracePeriod: string;
  forVotes: string;
  againstVotes: string;
  executed: boolean;
  canceled: boolean;
  strategy: string;
  ipfsHash: string;
  state: ProposalState;
  minimumQuorum: string;
  minimumDiff: string;
  proposalCreated: number;
  totalVotingSupply: string;
};

export type ProposalRPC = {
  totalVotingSupply: BigNumber;
  minimumQuorum: BigNumber;
  minimumDiff: BigNumber;
  executionTimeWithGracePeriod: BigNumber;
  proposalCreated: BigNumber;
  id: BigNumber;
  creator: string;
  executor: string;
  targets: string[];
  values: BigNumber[];
  signatures: string[];
  calldatas: string[];
  withDelegatecalls: boolean[];
  startBlock: BigNumber;
  endBlock: BigNumber;
  executionTime: BigNumber;
  forVotes: BigNumber;
  againstVotes: BigNumber;
  executed: boolean;
  canceled: boolean;
  strategy: string;
  ipfsHash: string;
  proposalState: number;
};

export type GovProposal = {
  id: BigNumber;
  creator: string;
  executor: string;
  targets: string[];
  values: BigNumber[];
  signatures: string[];
  calldatas: string[];
  withDelegatecalls: boolean[];
  startBlock: BigNumber;
  endBlock: BigNumber;
  executionTime: BigNumber;
  forVotes: BigNumber;
  againstVotes: BigNumber;
  executed: boolean;
  canceled: boolean;
  strategy: string;
  ipfsHash: string;
};

export type GovStrategyVotingSupplyAtBlock = {
  totalVotingSupply: BigNumber;
  block: BigNumber;
};

export type ExecutorVotingData = {
  minimumQuorum: BigNumber;
  voteDifferential: BigNumber;
  executorVotingPrecision: BigNumber;
  gracePeriod: BigNumber,
};

export type IPFSProposalData = {
  title: string;
  description: string;
  shortDescription: string;
  ipfsHash: string;
  dipId?: number;
};

export type RootUpdatedMetadata = {
  lastRootUpdatedTimestamp: number;
  numRootUpdates: number;
};

export type ProposalMetadata = {
  id: number;
  topForVotes: SubgraphProposalVote[];
  topAgainstVotes: SubgraphProposalVote[];
};

export type UserRewardBalances = {
  [address: string]: BigNumber;
};

export type UserRewardsBalancesPerEpoch = {
  [epoch: number]: UserRewardBalances,
};

export type PendingRootData = {
  hasPendingRoot: boolean,
  waitingPeriodEnd: number,  // 0 if no pending root
};

export type EpochData = {
  currentEpoch: number,
  startOfEpochTimestamp: number,
  endOfEpochTimestamp: number,
  epochLength: number,
  waitingPeriodLength: number,
};

export type UserRewardsPerEpoch = {
  [epoch: number]: tStringDecimalUnits,
};

export type UserRewardsData = {
  rewardsPerEpoch: UserRewardsPerEpoch,
  epochData: EpochData,
  claimedRewards: tStringDecimalUnits,
  newPendingRootRewards: tStringDecimalUnits,
  pendingRootData: PendingRootData,
};

export type ProposedRootMetadata = {
  balances: UserRewardBalances,
  ipfsCid: string,
};

export type ActiveRootDataAndHistory = {
  userBalancesPerEpoch: UserRewardsBalancesPerEpoch,
  // null if no root has breen promoted to active
  activeMerkleTree: ActiveMerkleTree | null,
};

export type ActiveMerkleTree = {
  merkleTree: BalanceTree,
  epoch: number,
};

export type MerkleProof = {
  cumulativeAmount: BigNumber,
  merkleProof: BytesLike[],
};

export type ProposalDataAndState = {
  proposal: GovProposal,
  proposalState: ProposalState,
};

export type Power = {
  votingPower: BigNumber;
  delegatedAddressVotingPower: string;
  propositionPower: BigNumber;
  delegatedAddressPropositionPower: string;
};

export type Vote = { support: boolean; votingPower: BigNumber };
