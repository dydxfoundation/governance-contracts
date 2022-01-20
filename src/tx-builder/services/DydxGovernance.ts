import { Client } from '@urql/core';
import { BigNumber, Signature, utils } from 'ethers';
import { formatEther } from 'ethers/lib/utils';
import { flatten } from 'lodash';

import {
  DydxGovernor__factory,
  Executor__factory,
  GovernanceStrategy__factory,
} from '../../../types';
import { DydxGovernor } from '../../../types/DydxGovernor';
import { Executor } from '../../../types/Executor';
import { GovernanceStrategy } from '../../../types/GovernanceStrategy';
import {
  dydxGovernanceAddresses,
  DYDX_TOKEN_DECIMALS,
} from '../config';
import {
  ChainId,
  Configuration,
  eEthereumTxType,
  EthereumTransactionTypeExtended,
  tEthereumAddress,
  transactionType,
  tDistinctGovernanceAddresses,
  Network,
  DelegationType,
  GovernanceTokens,
  UserGovernanceDelegatees,
  tStringCurrencyUnits,
} from '../types';
import {
  ExecutorType,
  GovCancelType,
  GovCreateType,
  GovExecuteType,
  GovGetVotingAtBlockType,
  GovGetVotingSupplyType,
  GovQueueType,
  GovSignVotingType,
  GovSubmitVoteSignType,
  GovSubmitVoteType,
  GovGetVoteOnProposal,
} from '../types/GovernanceMethodTypes';
import {
  Proposal,
  Vote,
  ExecutorVotingData,
  ProposalDataAndState,
  IPFSProposalData,
  ProposalMetadata,
} from '../types/GovernanceReturnTypes';
import {
  getExecutorVotingData,
  getProposalDataAndStateById,
  getStrategyVotingSupplyForProposal,
} from '../utils/governance';
import { filterZeroTokenBalances } from '../utils/helpers';
import { getProposalMetadata } from '../utils/ipfs';
import { parseNumberToEthersBigNumber } from '../utils/parsings';
import { executeGetSortedProposalVotesQuery, SubgraphProposalVote } from '../utils/subgraph';
import { GovValidator } from '../validators/methodValidators';
import {
  Is0OrPositiveAmount,
  IsEthAddress,
} from '../validators/paramValidators';
import BaseService from './BaseService';
import ERC20Service from './ERC20';
import GovernanceDelegationTokenService from './GovernanceDelegationTokenService';

const DEPLOYMENT_BLOCK: number = 12816310;

export default class DydxGovernanceService extends BaseService<DydxGovernor> {
  readonly dydxGovernanceAddress: tEthereumAddress;

  readonly dydxGovernanceStrategyAddress: tEthereumAddress;

  readonly executors: tEthereumAddress[] = [];

  readonly erc20Service: ERC20Service;

  readonly governanceTokenDelegationService: GovernanceDelegationTokenService;

  readonly subgraphClient: Client;

  // token addresses that can be used for voting and proposing
  readonly governanceTokens: GovernanceTokens;

  constructor(
    config: Configuration,
    erc20Service: ERC20Service,
    governanceTokenDelegationService: GovernanceDelegationTokenService,
    subgraphClient: Client,
    governanceTokens: GovernanceTokens,
    hardhatGovernanceAddresses?: tDistinctGovernanceAddresses,
  ) {
    super(config, DydxGovernor__factory);

    this.erc20Service = erc20Service;
    this.governanceTokenDelegationService = governanceTokenDelegationService;
    this.subgraphClient = subgraphClient;

    const { network } = this.config;
    const isHardhatNetwork: boolean = network === Network.hardhat;
    if (isHardhatNetwork && !hardhatGovernanceAddresses) {
      throw new Error('Must specify governance addresses when on hardhat network');
    }
    const governanceAddresses: tDistinctGovernanceAddresses = isHardhatNetwork ? hardhatGovernanceAddresses! : dydxGovernanceAddresses[network];
    const {
      DYDX_GOVERNANCE,
      DYDX_GOVERNANCE_EXECUTOR_SHORT,
      DYDX_GOVERNANCE_EXECUTOR_LONG,
      DYDX_GOVERNANCE_EXECUTOR_MERKLE_PAUSER,
      DYDX_GOVERNANCE_PRIORITY_EXECUTOR_STARKWARE,
      DYDX_GOVERNANCE_STRATEGY,
    } = governanceAddresses;

    this.dydxGovernanceAddress = DYDX_GOVERNANCE;
    this.dydxGovernanceStrategyAddress = DYDX_GOVERNANCE_STRATEGY;
    this.executors[ExecutorType.Short] = DYDX_GOVERNANCE_EXECUTOR_SHORT;
    this.executors[ExecutorType.Long] = DYDX_GOVERNANCE_EXECUTOR_LONG;
    this.executors[ExecutorType.Merkle] = DYDX_GOVERNANCE_EXECUTOR_MERKLE_PAUSER;
    this.executors[ExecutorType.Starkware] = DYDX_GOVERNANCE_PRIORITY_EXECUTOR_STARKWARE;
    this.governanceTokens = governanceTokens;
  }

  @GovValidator
  public async create(
    @IsEthAddress('user')
      {
        user,
        targets,
        values,
        signatures,
        calldatas,
        withDelegateCalls,
        ipfsHash,
        executor,
      }: GovCreateType,
  ): Promise<EthereumTransactionTypeExtended[]> {
    const txs: EthereumTransactionTypeExtended[] = [];

    const govContract: DydxGovernor = this.getContractInstance(
      this.dydxGovernanceAddress,
    );

    const txCallback: () => Promise<transactionType> = this.generateTxCallback({
      rawTxMethod: () =>
        govContract.populateTransaction.create(
          this.executors[executor],
          targets,
          values,
          signatures,
          calldatas,
          withDelegateCalls,
          ipfsHash,
        ),
      from: user,
    });

    txs.push({
      tx: txCallback,
      txType: eEthereumTxType.GOVERNANCE_ACTION,
      gas: this.generateTxPriceEstimation(txs, txCallback),
    });
    return txs;
  }

  @GovValidator
  public async cancel(
    @IsEthAddress('user')
    @Is0OrPositiveAmount('proposalId')
      { user, proposalId }: GovCancelType,
  ): Promise<EthereumTransactionTypeExtended[]> {
    const txs: EthereumTransactionTypeExtended[] = [];
    const govContract: DydxGovernor = this.getContractInstance(
      this.dydxGovernanceAddress,
    );

    const txCallback: () => Promise<transactionType> = this.generateTxCallback({
      rawTxMethod: () => govContract.populateTransaction.cancel(proposalId),
      from: user,
    });

    txs.push({
      tx: txCallback,
      txType: eEthereumTxType.GOVERNANCE_ACTION,
      gas: this.generateTxPriceEstimation(txs, txCallback),
    });
    return txs;
  }

  @GovValidator
  public async queue(
    @IsEthAddress('user')
    @Is0OrPositiveAmount('proposalId')
      { user, proposalId }: GovQueueType,
  ): Promise<EthereumTransactionTypeExtended[]> {
    const txs: EthereumTransactionTypeExtended[] = [];
    const govContract: DydxGovernor = this.getContractInstance(
      this.dydxGovernanceAddress,
    );

    const txCallback: () => Promise<transactionType> = this.generateTxCallback({
      rawTxMethod: () => govContract.populateTransaction.queue(proposalId),
      from: user,
    });

    txs.push({
      tx: txCallback,
      txType: eEthereumTxType.GOVERNANCE_ACTION,
      gas: this.generateTxPriceEstimation(txs, txCallback),
    });
    return txs;
  }

  @GovValidator
  public async execute(
    @IsEthAddress('user')
    @Is0OrPositiveAmount('proposalId')
      { user, proposalId }: GovExecuteType,
  ): Promise<EthereumTransactionTypeExtended[]> {
    const txs: EthereumTransactionTypeExtended[] = [];
    const govContract: DydxGovernor = this.getContractInstance(
      this.dydxGovernanceAddress,
    );

    const txCallback: () => Promise<transactionType> = this.generateTxCallback({
      rawTxMethod: () => govContract.populateTransaction.execute(proposalId),
      from: user,
    });

    txs.push({
      tx: txCallback,
      txType: eEthereumTxType.GOVERNANCE_ACTION,
      gas: this.generateTxPriceEstimation(txs, txCallback),
    });
    return txs;
  }

  @GovValidator
  public async submitVote(
    @IsEthAddress('user')
    @Is0OrPositiveAmount('proposalId')
      { user, proposalId, support }: GovSubmitVoteType,
  ): Promise<EthereumTransactionTypeExtended[]> {
    const txs: EthereumTransactionTypeExtended[] = [];
    const govContract: DydxGovernor = this.getContractInstance(
      this.dydxGovernanceAddress,
    );

    const txCallback: () => Promise<transactionType> = this.generateTxCallback({
      rawTxMethod: () =>
        govContract.populateTransaction.submitVote(proposalId, support),
      from: user,
    });

    txs.push({
      tx: txCallback,
      txType: eEthereumTxType.GOVERNANCE_ACTION,
      gas: this.generateTxPriceEstimation(txs, txCallback),
    });
    return txs;
  }

  @GovValidator
  public async signVoting(
    @Is0OrPositiveAmount('proposalId')
      { support, proposalId }: GovSignVotingType,
  ): Promise<string> {
    const typeData = {
      types: {
        EIP712Domain: [
          { name: 'name', type: 'string' },
          { name: 'chainId', type: 'uint256' },
          { name: 'verifyingContract', type: 'address' },
        ],
        VoteEmitted: [
          { name: 'id', type: 'uint256' },
          { name: 'support', type: 'bool' },
        ],
      },
      primaryType: 'VoteEmitted' as const,
      domain: {
        name: 'Dydx Governance',
        chainId: ChainId[this.config.network],
        verifyingContract: this.dydxGovernanceAddress,
      },
      message: {
        support,
        id: proposalId,
      },
    };

    return JSON.stringify(typeData);
  }

  @GovValidator
  public async submitVoteBySignature(
    @IsEthAddress('user')
    @Is0OrPositiveAmount('proposalId')
      { user, proposalId, support, signature }: GovSubmitVoteSignType,
  ): Promise<EthereumTransactionTypeExtended[]> {
    const txs: EthereumTransactionTypeExtended[] = [];
    const govContract: DydxGovernor = this.getContractInstance(
      this.dydxGovernanceAddress,
    );

    const sig: Signature = utils.splitSignature(signature);

    const txCallback: () => Promise<transactionType> = this.generateTxCallback({
      rawTxMethod: () =>
        govContract.populateTransaction.submitVoteBySignature(
          proposalId,
          support,
          sig.v,
          sig.r,
          sig.s,
        ),
      from: user,
    });

    txs.push({
      tx: txCallback,
      txType: eEthereumTxType.GOVERNANCE_ACTION,
      gas: this.generateTxPriceEstimation(txs, txCallback),
    });
    return txs;
  }

  @GovValidator
  public async getPropositionPowerAt({
    user,
    block,
    strategy,
  }: GovGetVotingAtBlockType): Promise<string> {
    const { provider }: Configuration = this.config;
    const proposalStrategy: GovernanceStrategy = GovernanceStrategy__factory.connect(
      strategy,
      provider,
    );

    const power = await proposalStrategy.getPropositionPowerAt(
      user,
      block.toString(),
    );
    return formatEther(power);
  }

  @GovValidator
  public async getVotingPowerAt({
    user,
    block,
    strategy,
  }: GovGetVotingAtBlockType): Promise<string> {
    const { provider }: Configuration = this.config;
    const proposalStrategy: GovernanceStrategy = GovernanceStrategy__factory.connect(
      strategy,
      provider,
    );

    const power = await proposalStrategy.getVotingPowerAt(
      user,
      block.toString(),
    );
    return formatEther(power);
  }

  @GovValidator
  public async getTotalPropositionSupplyAt({
    block,
    strategy,
  }: GovGetVotingSupplyType): Promise<string> {
    const { provider }: Configuration = this.config;
    const proposalStrategy: GovernanceStrategy = GovernanceStrategy__factory.connect(
      strategy,
      provider,
    );

    const total = await proposalStrategy.getTotalPropositionSupplyAt(
      block.toString(),
    );
    return formatEther(total);
  }

  @GovValidator
  public async getTotalVotingSupplyAt({
    block,
    strategy,
  }: GovGetVotingSupplyType): Promise<string> {
    const { provider }: Configuration = this.config;
    const proposalStrategy: GovernanceStrategy = GovernanceStrategy__factory.connect(
      strategy,
      provider,
    );

    const total = await proposalStrategy.getTotalVotingSupplyAt(
      block.toString(),
    );
    return formatEther(total);
  }

  public async getCurrentPropositionPower(user: tEthereumAddress): Promise<string> {
    const { provider }: Configuration = this.config;
    const block = await provider.getBlock('latest');
    const latestBlock: number = block.number;

    return this.getPropositionPowerAt({ user, block: latestBlock, strategy: this.dydxGovernanceStrategyAddress });
  }

  public async getCurrentVotingPower(user: tEthereumAddress): Promise<string> {
    const { provider }: Configuration = this.config;
    const block = await provider.getBlock('latest');
    const latestBlock: number = block.number;

    return this.getVotingPowerAt({ user, block: latestBlock, strategy: this.dydxGovernanceStrategyAddress });
  }

  public async delegatePropositionAndVotingPower(
    user: tEthereumAddress,
    delegatee: tEthereumAddress,
  ): Promise<EthereumTransactionTypeExtended[]> {
    const nonzeroTokenBalances: tEthereumAddress[] = await filterZeroTokenBalances(
      user,
      this.erc20Service,
      [this.governanceTokens.TOKEN, this.governanceTokens.STAKED_TOKEN],
    );

    const txs: EthereumTransactionTypeExtended[] = flatten(
      await Promise.all(nonzeroTokenBalances.map(async (governanceToken: tEthereumAddress) =>
        this.governanceTokenDelegationService.delegate({
          user,
          delegatee,
          governanceToken,
        }),
      )),
    );

    return txs;
  }

  public async getUserDelegatees(user: tEthereumAddress): Promise<UserGovernanceDelegatees> {
    const [
      parsedTokenBalance,
      parsedStakedTokenBalance,
    ]: [
      tStringCurrencyUnits,
      tStringCurrencyUnits,
    ] = await Promise.all([
      this.erc20Service.balanceOf(this.governanceTokens.TOKEN, user),
      this.erc20Service.balanceOf(this.governanceTokens.STAKED_TOKEN, user)]);

    const tokenBalance: BigNumber = parseNumberToEthersBigNumber(parsedTokenBalance, DYDX_TOKEN_DECIMALS);
    const stakedTokenBalance: BigNumber = parseNumberToEthersBigNumber(parsedStakedTokenBalance, DYDX_TOKEN_DECIMALS);

    const userTokenDelegatees: UserGovernanceDelegatees = {};

    if (!tokenBalance.isZero()) {
      userTokenDelegatees.TOKEN = await this.governanceTokenDelegationService.getDelegatees(
        user,
        this.governanceTokens.TOKEN,
      );
    }
    if (!stakedTokenBalance.isZero()) {
      userTokenDelegatees.STAKED_TOKEN = await this.governanceTokenDelegationService.getDelegatees(
        user,
        this.governanceTokens.STAKED_TOKEN,
      );
    }

    return userTokenDelegatees;
  }

  public async delegateVotingPower(
    user: tEthereumAddress,
    delegatee: tEthereumAddress,
  ): Promise<EthereumTransactionTypeExtended[]> {
    return this.delegatePower(user, delegatee, DelegationType.VOTING_POWER);
  }

  public async delegatePropositionPower(
    user: tEthereumAddress,
    delegatee: tEthereumAddress,
  ): Promise<EthereumTransactionTypeExtended[]> {
    return this.delegatePower(user, delegatee, DelegationType.PROPOSITION_POWER);
  }

  private async delegatePower(
    user: tEthereumAddress,
    delegatee: tEthereumAddress,
    delegationType: DelegationType,
  ): Promise<EthereumTransactionTypeExtended[]> {
    const nonzeroTokenBalances: tEthereumAddress[] = await filterZeroTokenBalances(
      user,
      this.erc20Service,
      [this.governanceTokens.TOKEN, this.governanceTokens.STAKED_TOKEN],
    );

    const txs: EthereumTransactionTypeExtended[] = flatten(
      await Promise.all(nonzeroTokenBalances.map(async (governanceToken: tEthereumAddress) =>
        this.governanceTokenDelegationService.delegateByType({
          user,
          delegatee,
          governanceToken,
          delegationType,
        }),
      )),
    );

    return txs;
  }

  @GovValidator
  public async getVoteOnProposal({
    proposalId,
    user,
  }: GovGetVoteOnProposal): Promise<Vote> {
    const govContract: DydxGovernor = this.getContractInstance(
      this.dydxGovernanceAddress,
    );
    return govContract.getVoteOnProposal(proposalId, user) as Promise<Vote>;
  }

  public async getLatestProposals(limit: number): Promise<Proposal[]> {
    const governance: DydxGovernor = this.getContractInstance(
      this.dydxGovernanceAddress,
    );

    const [
      numProposals,
      votingDelay,
    ]: [
      BigNumber,
      BigNumber,
    ] = await Promise.all([
      governance.getProposalsCount(),
      governance.getVotingDelay(),
    ]);

    let numProposalsToFetch: number = numProposals.gt(limit) ? limit : numProposals.toNumber();

    const getProposalDataAndStateRequests: Promise<ProposalDataAndState>[] = [];

    // proposal IDs are 0-indexed
    let currentProposalId = numProposals.sub(1).toNumber();
    while (numProposalsToFetch > 0) {
      getProposalDataAndStateRequests.push(getProposalDataAndStateById(governance, currentProposalId));

      currentProposalId--;
      numProposalsToFetch--;
    }

    const proposalDataAndStates: ProposalDataAndState[] = await Promise.all(getProposalDataAndStateRequests);

    const { provider }: Configuration = this.config;
    return Promise.all(proposalDataAndStates.map(
      async (pdas: ProposalDataAndState): Promise<Proposal> => {
        const strategy: GovernanceStrategy = GovernanceStrategy__factory.connect(
          pdas.proposal.strategy,
          provider,
        );

        const executor: Executor = Executor__factory.connect(
          pdas.proposal.executor,
          provider,
        );

        const [
          votingSupply,
          executorVotingData,
          ipfsProposalMetadata,
        ]: [
          BigNumber,
          ExecutorVotingData,
          IPFSProposalData,
        ] = await Promise.all([
          getStrategyVotingSupplyForProposal(strategy, pdas.proposal.startBlock.toNumber()),
          getExecutorVotingData(executor),
          getProposalMetadata(pdas.proposal.ipfsHash, this.config.ipfsTimeoutMs),
        ]);

        const numVotesMinQuorum: BigNumber = votingSupply
          .mul(executorVotingData.minimumQuorum)
          .div(executorVotingData.executorVotingPrecision);
        const numVotesVoteDifferential: BigNumber = votingSupply
          .mul(executorVotingData.voteDifferential)
          .div(executorVotingData.executorVotingPrecision);

        const onchainProposalId = pdas.proposal.id.toNumber();

        return {
          ...ipfsProposalMetadata,
          dipId: ipfsProposalMetadata.dipId || onchainProposalId,
          id: onchainProposalId,
          creator: pdas.proposal.creator,
          executor: pdas.proposal.executor,
          strategy: pdas.proposal.strategy,
          executed: pdas.proposal.executed,
          canceled: pdas.proposal.canceled,
          startBlock: pdas.proposal.startBlock.toNumber(),
          endBlock: pdas.proposal.endBlock.toNumber(),
          executionTime: pdas.proposal.executionTime.toString(),
          forVotes: formatEther(pdas.proposal.forVotes),
          againstVotes: formatEther(pdas.proposal.againstVotes),
          state: pdas.proposalState,
          proposalCreated: pdas.proposal.startBlock.sub(votingDelay).toNumber(),
          totalVotingSupply: formatEther(votingSupply),
          executionTimeWithGracePeriod: pdas.proposal.executionTime.isZero()
            ? pdas.proposal.executionTime.toString()
            : pdas.proposal.executionTime.add(executorVotingData.gracePeriod).toString(),
          minimumQuorum: formatEther(numVotesMinQuorum),
          minimumDiff: formatEther(numVotesVoteDifferential),
        };
      }),
    );
  }

  public async getProposalMetadata(proposalId: number, limit: number): Promise<ProposalMetadata> {
    const [
      topForVotes,
      topAgainstVotes,
    ]: [
      SubgraphProposalVote[],
      SubgraphProposalVote[],
    ] = await Promise.all([
      executeGetSortedProposalVotesQuery(this.subgraphClient, proposalId, true, limit),
      executeGetSortedProposalVotesQuery(this.subgraphClient, proposalId, false, limit),
    ]);

    return {
      id: proposalId,
      topForVotes,
      topAgainstVotes,
    };
  }

  public async getGovernanceVoters(
    endBlock: number,
    startBlock: number = DEPLOYMENT_BLOCK,
  ): Promise<Set<string>> {
    const governor: DydxGovernor = this.getContractInstance(
      this.dydxGovernanceAddress,
    );
    const filter = governor.filters.VoteEmitted(null, null, null, null);
    const events = await governor.queryFilter(filter, startBlock, endBlock);

    //   event VoteEmitted(uint256 id, address indexed voter, bool support, uint256 votingPower);
    // see event: https://github.com/dydxfoundation/governance-contracts/blob/master/contracts/interfaces/IDydxGovernor.sol#L122
    return new Set(events.map((event) => event.args![1] as string));
  }
}
