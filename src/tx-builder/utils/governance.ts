import { BigNumber } from 'ethers';

import { DydxGovernor } from '../../../types/DydxGovernor';
import { Executor } from '../../../types/Executor';
import { GovernanceStrategy } from '../../../types/GovernanceStrategy';
import {
  Proposal,
  ProposalState,
  Power,
  ProposalRPC,
  Vote,
  GovProposal,
  GovStrategyVotingSupplyAtBlock,
  ExecutorVotingData,
  ProposalDataAndState,
} from '../types/GovernanceReturnTypes';
import { IPFSProposalData } from '../types/GovernanceReturnTypes';

interface StrategyVotingSupplyAtBlockCache {
  [address: string]: {
    [blockNumber: number]: BigNumber,
  };
}

interface ExecutorVotingDataCache {
  [address: string]: ExecutorVotingData;
}

const STRATEGY_VOTING_SUPPLY_AT_BLOCK_CACHE: StrategyVotingSupplyAtBlockCache = {};

const EXECUTOR_VOTING_DATA_CACHE: ExecutorVotingDataCache = {};

export async function getProposalDataAndStateById(governance: DydxGovernor, proposalId: number): Promise<ProposalDataAndState> {
  const [
    proposal,
    proposalState,
  ]: [
    GovProposal,
    number,
  ] = await Promise.all([
    governance.getProposalById(proposalId),
    governance.getProposalState(proposalId),
  ]);

  return {
    proposal,
    proposalState: Object.values(ProposalState)[proposalState],
  };
}

export async function getStrategyVotingSupplyForProposal(strategy: GovernanceStrategy, startBlock: number): Promise<BigNumber> {
  if (!STRATEGY_VOTING_SUPPLY_AT_BLOCK_CACHE[strategy.address]) {
    // cache strategy address so we can enter 2nd if statement without null pointer
    STRATEGY_VOTING_SUPPLY_AT_BLOCK_CACHE[strategy.address] = {};
  }

  if (!STRATEGY_VOTING_SUPPLY_AT_BLOCK_CACHE[strategy.address][startBlock]) {
    // cache voting supply for this block
    const votingSupply: BigNumber = await strategy.getTotalVotingSupplyAt(startBlock);
    STRATEGY_VOTING_SUPPLY_AT_BLOCK_CACHE[strategy.address][startBlock] = votingSupply;
  }

  return STRATEGY_VOTING_SUPPLY_AT_BLOCK_CACHE[strategy.address][startBlock];
}

export async function getExecutorVotingData(executor: Executor): Promise<ExecutorVotingData> {
  if (!EXECUTOR_VOTING_DATA_CACHE[executor.address]) {
    // cache executor voting data
    const [
      minimumQuorum,
      voteDifferential,
      executorVotingPrecision,
      gracePeriod,
    ]: [
      BigNumber,
      BigNumber,
      BigNumber,
      BigNumber,
    ] = await Promise.all([
      executor.MINIMUM_QUORUM(),
      executor.VOTE_DIFFERENTIAL(),
      executor.ONE_HUNDRED_WITH_PRECISION(),
      executor.GRACE_PERIOD(),
    ]);

    EXECUTOR_VOTING_DATA_CACHE[executor.address] = {
      minimumQuorum,
      executorVotingPrecision,
      voteDifferential,
      gracePeriod,
    };
  }

  return EXECUTOR_VOTING_DATA_CACHE[executor.address];
}
