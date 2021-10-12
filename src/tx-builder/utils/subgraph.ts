import { Client, OperationResult } from '@urql/core';
import { formatEther } from 'ethers/lib/utils';

import { tStringDecimalUnits } from '../types/index';

export type SubgraphUser = {
  // user id is ethereum address
  id: string;
};

export type SubgraphProposal = {
  id: string;
};

export type SubgraphProposalVote = {
  userAddress: string;
  votingPower: tStringDecimalUnits;
  support: boolean;
};

export const getSortedProposalVotesQuery = (
  proposalId: number,
  support: boolean,
  limit: number,
): string => {
  if (limit <= 0 || limit > 1000) {
    throw new Error('The limit parameter must be between 0 and 1000 (exclusive).');
  }

  return `query {
    proposalVotes(first: ${limit}, where: {
      support: ${support},
      proposal: "${proposalId}",
    }, orderBy:votingPower, orderDirection:desc) {
      proposal {
        id
      }
      user {
        id
      }
      votingPower
    }
  }`;
};

export const executeGetSortedProposalVotesQuery = async (
  client: Client,
  proposalId: number,
  support: boolean,
  limit: number,
): Promise<SubgraphProposalVote[]> => {
  const query: string = getSortedProposalVotesQuery(proposalId, support, limit);

  const queryResult: OperationResult<any, {}> = await client.query(query).toPromise();
  if (!queryResult.data) {
    throw new Error(`Invalid GraphQL query ${query}`);
  }

  // assume query executed successfully if `data` is defined and is formatted correctly.
  // If not, error will be thrown below.

  const topVotes: SubgraphProposalVote[] = [];
  queryResult.data!.proposalVotes.forEach((vote: { user: SubgraphUser, votingPower: string }) => {
    if (!vote?.user?.id || !vote?.votingPower) {
      throw new Error(`
        Vote object returned from subgraph malformed. ProposalId: ${proposalId}, support: ${support}, limit: ${limit}.`);
    }

    topVotes.push({
      userAddress: vote.user.id,
      votingPower: formatEther(vote.votingPower),
      support,
    });
  });

  return topVotes;
};
