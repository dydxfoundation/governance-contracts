import BNJS from 'bignumber.js';
import { expect } from 'chai';
import { BigNumber } from 'ethers';
import { formatEther } from 'ethers/lib/utils';
import sinon from 'sinon';

import { ipfsBytes32Hash } from '../../helpers/constants';
import {
  evmRevert,
  evmSnapshot,
  DRE,
  waitForTx,
  timeLatest,
  increaseTimeAndMine,
} from '../../helpers/misc-utils';
import { toWad } from '../../helpers/misc-utils';
import {
  TxBuilder,
  Network,
  tDistinctGovernanceAddresses,
  GovCreateType,
  ExecutorType,
  tTokenAddresses,
  EthereumTransactionTypeExtended,
  tEthereumAddress,
  Proposal,
  ProposalState,
  ProposalMetadata,
} from '../../src';
import DydxGovernanceService from '../../src/tx-builder/services/DydxGovernance';
import { tSafetyModuleAddresses, tStringDecimalUnits } from '../../src/tx-builder/types/index';
import { ipfsHashBytesToIpfsHashString } from '../../src/tx-builder/utils/ipfs';
import { getSortedProposalVotesQuery, SubgraphProposalVote, SubgraphUser } from '../../src/tx-builder/utils/subgraph';
import { Executor } from '../../types/Executor';
import {
  emptyBalances,
  getInitContractData,
  setBalance,
  encodeSetDelay,
  deployTestExecutor,
} from '../helpers/gov-utils';
import {
  makeSuite,
  TestEnv,
  deployPhase2,
  SignerWithAddress,
} from '../helpers/make-suite';
import { sendTransactions } from '../helpers/tx-builder';

enum DelegateAction {
  PROPOSITION,
  VOTING,
  PROPOSITION_AND_VOTING,
}

const snapshots = new Map<string, string>();
const beforeStake = 'BeforeStake';
const afterVoting = 'afterVoting';
const afterPartialStake = 'AfterPartialStake';
const afterFullStake = 'AfterFullStake';

makeSuite('dYdX client governance tests', deployPhase2, (testEnv: TestEnv) => {
  let votingDelay: BigNumber;
  let minimumPower: BigNumber;
  let txBuilder: TxBuilder;
  let distributor: SignerWithAddress;
  let distributorBalance: tStringDecimalUnits;
  let delegatee: SignerWithAddress;
  let executor: Executor;

  before(async () => {
    const { governor, strategy, dydxToken, safetyModule, users } = testEnv;

    distributor = testEnv.deployer;
    delegatee = users[1];

    executor = await deployTestExecutor(testEnv);

    ({
      minimumPower,
    } = await getInitContractData(testEnv, executor));

    votingDelay = BigNumber.from(100);

    // set governance delay to 100 blocks to speed up local tests
    await waitForTx(await governor.setVotingDelay(votingDelay));

    const hardhatGovernanceAddresses: tDistinctGovernanceAddresses = {
      DYDX_GOVERNANCE: governor.address,
      DYDX_GOVERNANCE_EXECUTOR_SHORT: executor.address,
      DYDX_GOVERNANCE_EXECUTOR_LONG: executor.address,
      DYDX_GOVERNANCE_EXECUTOR_MERKLE_PAUSER: executor.address,
      DYDX_GOVERNANCE_PRIORITY_EXECUTOR_STARKWARE: executor.address,
      DYDX_GOVERNANCE_STRATEGY: strategy.address,
    };

    const hardhatTokenAddresses: tTokenAddresses = {
      TOKEN_ADDRESS: dydxToken.address,
    };

    const hardhatSafetyModuleAddresses: tSafetyModuleAddresses = {
      SAFETY_MODULE_ADDRESS: safetyModule.address,
    };

    const hardhatProvider = DRE.ethers.provider;
    txBuilder = new TxBuilder({
      network: Network.hardhat,
      hardhatGovernanceAddresses,
      hardhatTokenAddresses,
      hardhatSafetyModuleAddresses,
      injectedProvider: hardhatProvider,
    });

    // Cleaning users balances
    await emptyBalances(users, testEnv);

    distributorBalance = formatEther(await dydxToken.balanceOf(distributor.address));

    // move time forward to epoch zero start so users can stake
    const epochParameters: { offset: BigNumber } = await safetyModule.getEpochParameters();
    await incrementTimeToTimestamp(epochParameters.offset.toString());

    await saveSnapshot(beforeStake);
  });

  describe('creating governance proposals', () => {
    before(async () => {
      await saveSnapshot(beforeStake);
    });

    afterEach(async () => {
      // Revert to starting state
      await loadSnapshot(beforeStake);
    });

    it('Can create proposal', async () => {
      const user1 = testEnv.users[0];
      const governor = testEnv.governor;

      // Giving user 1 enough power to propose
      await setBalance(user1, minimumPower, testEnv);

      // encode function arguments for `setVotingDelay` function
      const callData = await encodeSetDelay('400', testEnv);

      // Creating first proposal: Changing delay to 400 via no sig + calldata
      const createArgs: GovCreateType = {
        user: user1.address,
        targets: [governor.address],
        values: ['0'],
        signatures: [''],
        calldatas: [callData],
        withDelegateCalls: [false],
        ipfsHash: ipfsBytes32Hash,
        executor: ExecutorType.Short,
      };
      const txs = await txBuilder.dydxGovernanceService.create(createArgs);
      await sendTransactions(txs, user1);

      const proposals: Proposal[] = await txBuilder.dydxGovernanceService.getLatestProposals(10);
      expect(proposals.length).to.equal(1);
      const proposal: Proposal = proposals[0];
      expect(proposal.ipfsHash).to.equal(ipfsHashBytesToIpfsHashString(ipfsBytes32Hash, true));
      expect(proposal.id).to.equal(0);
      expect(proposal.state).to.equal(ProposalState.Pending);
      expect(proposal.totalVotingSupply).to.equal('1000000000.0');
      expect(proposal.minimumQuorum).to.equal('200000000.0');
      expect(proposal.minimumDiff).to.equal('50000000.0');
      expect(proposal.forVotes).to.equal('0.0');
      expect(proposal.againstVotes).to.equal('0.0');
    });

    it('Can create multiple proposals and finds the most recent', async () => {
      const user1 = testEnv.users[0];
      const governor = testEnv.governor;

      // Giving user 1 enough power to propose
      await setBalance(user1, minimumPower, testEnv);

      // encode function arguments for `setVotingDelay` function
      const callData = await encodeSetDelay('400', testEnv);

      // Creating first proposal: Changing delay to 400 via no sig + calldata
      const createArgs: GovCreateType = {
        user: user1.address,
        targets: [governor.address],
        values: ['0'],
        signatures: [''],
        calldatas: [callData],
        withDelegateCalls: [false],
        ipfsHash: ipfsBytes32Hash,
        executor: ExecutorType.Short,
      };
      const numProposals = 3;
      let createdProposals = 0;
      while (createdProposals < numProposals) {
        const txs = await txBuilder.dydxGovernanceService.create(createArgs);
        await sendTransactions(txs, user1);
        createdProposals++;
      }

      // get 2 latest proposals
      const proposals: Proposal[] = await txBuilder.dydxGovernanceService.getLatestProposals(2);
      expect(proposals.length).to.equal(2);
      proposals.forEach((proposal: Proposal, i: number) => {
        expect(proposal.ipfsHash).to.equal(ipfsHashBytesToIpfsHashString(ipfsBytes32Hash, true));
        expect(proposal.id).to.equal(numProposals - i - 1);
        expect(proposal.state).to.equal(ProposalState.Pending);
      });
    });
  });

  describe('voting on governance proposals', () => {
    const proposalId: number = 0;
    const limit: number = 5;
    let subgraphStub: sinon.SinonStub;

    before(async () => {
      const deployer = testEnv.deployer;
      const governor = testEnv.governor;

      // encode function arguments for `setVotingDelay` function
      const callData = await encodeSetDelay('400', testEnv);

      // Creating first proposal: Changing delay to 400 via no sig + calldata
      const createArgs: GovCreateType = {
        user: deployer.address,
        targets: [governor.address],
        values: ['0'],
        signatures: [''],
        calldatas: [callData],
        withDelegateCalls: [false],
        ipfsHash: ipfsBytes32Hash,
        executor: ExecutorType.Short,
      };
      const txs = await txBuilder.dydxGovernanceService.create(createArgs);
      await sendTransactions(txs, deployer);

      subgraphStub = sinon.stub(txBuilder.dydxGovernanceService.subgraphClient, 'query');
      await saveSnapshot(afterVoting);
    });

    afterEach(async () => {
      await loadSnapshot(afterVoting);
    });

    after(async () => {
      // Revert to starting state
      await loadSnapshot(beforeStake);
      subgraphStub.restore();
    });

    it('Can fetch proposal metadata for a proposal', async () => {
      const topForVotesQuery = getSortedProposalVotesQuery(proposalId, true, limit);
      const forUsers: [string, string][] = [
        [testEnv.deployer.address, toWad(77)],
        [testEnv.users[0].address, toWad(7)],
      ];
      mockSubgraphProposalVotesQuery(topForVotesQuery, forUsers);

      const topAgainstVotesQuery = getSortedProposalVotesQuery(proposalId, false, limit);
      const againstUsers: [string, string][] = [
        [testEnv.users[1].address, toWad(66)],
        [testEnv.users[2].address, toWad(6)],
      ];
      mockSubgraphProposalVotesQuery(topAgainstVotesQuery, againstUsers);

      const proposalVotes: ProposalMetadata = await txBuilder.dydxGovernanceService.getProposalMetadata(
        proposalId,
        limit,
      );
      verifyProposalVotes(forUsers, proposalVotes.topForVotes, true);
      verifyProposalVotes(againstUsers, proposalVotes.topAgainstVotes, false);
    });

    it('Can fetch proposal metadata for a proposal if no votes exist', async () => {
      const topForVotesQuery = getSortedProposalVotesQuery(proposalId, true, limit);
      const forUsers: [string, string][] = [];
      mockSubgraphProposalVotesQuery(topForVotesQuery, forUsers);

      const topAgainstVotesQuery = getSortedProposalVotesQuery(proposalId, false, limit);
      const againstUsers: [string, string][] = [];
      mockSubgraphProposalVotesQuery(topAgainstVotesQuery, againstUsers);

      const proposalVotes: ProposalMetadata = await txBuilder.dydxGovernanceService.getProposalMetadata(
        proposalId,
        limit,
      );
      verifyProposalVotes(forUsers, proposalVotes.topForVotes, true);
      verifyProposalVotes(againstUsers, proposalVotes.topAgainstVotes, false);
    });

    it('Throws error if limit is less than 1 or greater than 1000', async () => {
      const badLimit: number = 0;

      try {
        await txBuilder.dydxGovernanceService.getProposalMetadata(
          proposalId,
          badLimit,
        );
        expect.fail('Expect bad limit to throw error');
      } catch (error) {
        expect(error.message).to.equal('The limit parameter must be between 0 and 1000 (exclusive).');
      }
    });

    function mockSubgraphProposalVotesQuery(query: string, users: [string, string][]): void {
      const proposalVotes: { user: SubgraphUser, votingPower: string }[] = [];
      users.forEach((user) => {
        proposalVotes.push({
          user: { id: user[0] },
          votingPower: user[1],
        });
      });

      subgraphStub.withArgs(query).returns({
        toPromise: async function () {
          return Promise.resolve({ data: {
            proposalVotes,
          } });
        },
      });
    }

    function verifyProposalVotes(
      expectedUsers: [string, string][],
      proposalVotes: SubgraphProposalVote[],
      support: boolean,
    ): void {
      expect(expectedUsers.length).to.equal(proposalVotes.length);

      proposalVotes.forEach((pv: SubgraphProposalVote, i: number) => {
        const address: string = expectedUsers[i][0];
        const votingPower: tStringDecimalUnits = formatEther(expectedUsers[i][1]);
        expect(pv.userAddress).to.equal(address);
        expect(pv.votingPower).to.equal(votingPower);
        expect(pv.support).to.equal(support);
      });
    }
  });

  describe('delegate before staking', () => {
    afterEach(async () => {
      // Revert to starting state
      await loadSnapshot(beforeStake);
    });

    it('Initially finds 0 proposals', async () => {
      const proposals: Proposal[] = await txBuilder.dydxGovernanceService.getLatestProposals(10);

      expect(proposals.length).to.equal(0);
    });

    it('Users can delegate DYDX proposing power', async () => {
      await testDelegatePower(distributor, delegatee.address, txBuilder.dydxGovernanceService, DelegateAction.PROPOSITION);

      const userDelegatees = await txBuilder.dydxGovernanceService.getUserDelegatees(distributor.address);
      expect(userDelegatees.TOKEN!.PROPOSITION_DELEGATEE).to.equal(delegatee.address);
      expect(userDelegatees.TOKEN!.VOTING_DELEGATEE).to.equal(distributor.address);
      expect(userDelegatees.STAKED_TOKEN!).to.be.undefined;
    });

    it('Users can delegate DYDX voting power', async () => {
      await testDelegatePower(distributor, delegatee.address, txBuilder.dydxGovernanceService, DelegateAction.VOTING);
      const userDelegatees = await txBuilder.dydxGovernanceService.getUserDelegatees(distributor.address);
      expect(userDelegatees.TOKEN!.VOTING_DELEGATEE).to.equal(delegatee.address);
      expect(userDelegatees.TOKEN!.PROPOSITION_DELEGATEE).to.equal(distributor.address);
      expect(userDelegatees.STAKED_TOKEN!).to.be.undefined;
    });

    it('Users can delegate DYDX proposing and voting power', async () => {
      await testDelegatePower(distributor, delegatee.address, txBuilder.dydxGovernanceService, DelegateAction.PROPOSITION_AND_VOTING);
      const userDelegatees = await txBuilder.dydxGovernanceService.getUserDelegatees(distributor.address);
      expect(userDelegatees.TOKEN!.VOTING_DELEGATEE).to.equal(delegatee.address);
      expect(userDelegatees.TOKEN!.PROPOSITION_DELEGATEE).to.equal(delegatee.address);
      expect(userDelegatees.STAKED_TOKEN!).to.be.undefined;
    });
  });

  describe('delegate after partial staking', () => {
    const stakeAmount: string = '777';

    before(async () => {
      // Stake.
      const txs = await txBuilder.safetyModuleService.stake(
        distributor.address,
        stakeAmount,
      );
      await sendTransactions(txs, distributor);

      await saveSnapshot(afterPartialStake);
    });

    afterEach(async () => {
      await loadSnapshot(afterPartialStake);
    });

    it('Users can delegate DYDX proposing power', async () => {
      await testDelegatePower(distributor, delegatee.address, txBuilder.dydxGovernanceService, DelegateAction.PROPOSITION);

      const userDelegatees = await txBuilder.dydxGovernanceService.getUserDelegatees(distributor.address);
      expect(userDelegatees.STAKED_TOKEN!.PROPOSITION_DELEGATEE).to.equal(delegatee.address);
      expect(userDelegatees.STAKED_TOKEN!.VOTING_DELEGATEE).to.equal(distributor.address);
      expect(userDelegatees.TOKEN!.PROPOSITION_DELEGATEE).to.equal(delegatee.address);
      expect(userDelegatees.TOKEN!.VOTING_DELEGATEE).to.equal(distributor.address);
    });

    it('Users can delegate DYDX voting power', async () => {
      await testDelegatePower(distributor, delegatee.address, txBuilder.dydxGovernanceService, DelegateAction.VOTING);

      const userDelegatees = await txBuilder.dydxGovernanceService.getUserDelegatees(distributor.address);
      expect(userDelegatees.STAKED_TOKEN!.PROPOSITION_DELEGATEE).to.equal(distributor.address);
      expect(userDelegatees.STAKED_TOKEN!.VOTING_DELEGATEE).to.equal(delegatee.address);
      expect(userDelegatees.TOKEN!.PROPOSITION_DELEGATEE).to.equal(distributor.address);
      expect(userDelegatees.TOKEN!.VOTING_DELEGATEE).to.equal(delegatee.address);
    });

    it('Users can delegate DYDX proposing and voting power', async () => {
      await testDelegatePower(distributor, delegatee.address, txBuilder.dydxGovernanceService, DelegateAction.PROPOSITION_AND_VOTING);

      const userDelegatees = await txBuilder.dydxGovernanceService.getUserDelegatees(distributor.address);
      expect(userDelegatees.STAKED_TOKEN!.PROPOSITION_DELEGATEE).to.equal(delegatee.address);
      expect(userDelegatees.STAKED_TOKEN!.VOTING_DELEGATEE).to.equal(delegatee.address);
      expect(userDelegatees.TOKEN!.PROPOSITION_DELEGATEE).to.equal(delegatee.address);
      expect(userDelegatees.TOKEN!.VOTING_DELEGATEE).to.equal(delegatee.address);
    });
  });

  describe('delegate after full staking', () => {
    let stakeAmount: string;

    before(async () => {
      // stake full distributor balance (`stake` input is not in wei, so divide by 10^18 first)
      stakeAmount = formatEther(await testEnv.dydxToken.balanceOf(distributor.address));

      // Stake.
      const txs = await txBuilder.safetyModuleService.stake(
        distributor.address,
        stakeAmount,
      );
      await sendTransactions(txs, distributor);

      await saveSnapshot(afterFullStake);
    });

    afterEach(async () => {
      await loadSnapshot(afterFullStake);
    });

    it('Users can delegate DYDX proposing power', async () => {
      await testDelegatePower(distributor, delegatee.address, txBuilder.dydxGovernanceService, DelegateAction.PROPOSITION);

      const userDelegatees = await txBuilder.dydxGovernanceService.getUserDelegatees(distributor.address);
      expect(userDelegatees.STAKED_TOKEN!.PROPOSITION_DELEGATEE).to.equal(delegatee.address);
      expect(userDelegatees.STAKED_TOKEN!.VOTING_DELEGATEE).to.equal(distributor.address);
      expect(userDelegatees.TOKEN!).to.be.undefined;
    });

    it('Users can delegate DYDX voting power', async () => {
      await testDelegatePower(distributor, delegatee.address, txBuilder.dydxGovernanceService, DelegateAction.VOTING);

      const userDelegatees = await txBuilder.dydxGovernanceService.getUserDelegatees(distributor.address);
      expect(userDelegatees.STAKED_TOKEN!.VOTING_DELEGATEE).to.equal(delegatee.address);
      expect(userDelegatees.STAKED_TOKEN!.PROPOSITION_DELEGATEE).to.equal(distributor.address);
      expect(userDelegatees.TOKEN!).to.be.undefined;
    });

    it('Users can delegate DYDX proposing and voting power', async () => {
      await testDelegatePower(distributor, delegatee.address, txBuilder.dydxGovernanceService, DelegateAction.PROPOSITION_AND_VOTING);

      const userDelegatees = await txBuilder.dydxGovernanceService.getUserDelegatees(distributor.address);
      expect(userDelegatees.STAKED_TOKEN!.VOTING_DELEGATEE).to.equal(delegatee.address);
      expect(userDelegatees.STAKED_TOKEN!.PROPOSITION_DELEGATEE).to.equal(delegatee.address);
      expect(userDelegatees.TOKEN!).to.be.undefined;
    });
  });

  async function saveSnapshot(label: string): Promise<void> {
    snapshots.set(label, await evmSnapshot());
  }

  async function loadSnapshot(label: string): Promise<void> {
    const snapshot = snapshots.get(label);
    if (!snapshot) {
      throw new Error(`Cannot load since snapshot has not been saved: ${label}`);
    }
    await evmRevert(snapshot);
    snapshots.set(label, await evmSnapshot());
  }

  async function testDelegatePower(
    user: SignerWithAddress,
    delegatee: tEthereumAddress,
    governance: DydxGovernanceService,
    delegateAction: DelegateAction,
  ): Promise<void> {
    let txs: EthereumTransactionTypeExtended[] = [];
    let checkPropositionPower = false;
    let checkVotingPower = false;
    switch (delegateAction) {
      case DelegateAction.PROPOSITION: {
        txs = await governance.delegatePropositionPower(user.address, delegatee);
        checkPropositionPower = true;
        break;
      }
      case DelegateAction.VOTING: {
        checkVotingPower = true;
        txs = await governance.delegateVotingPower(user.address, delegatee);
        break;
      }
      case DelegateAction.PROPOSITION_AND_VOTING: {
        checkPropositionPower = true;
        checkVotingPower = true;
        txs = await governance.delegatePropositionAndVotingPower(user.address, delegatee);
        break;
      }
    }

    await sendTransactions(txs, user);

    if (checkPropositionPower) {
      const proposingPower: string = await governance.getCurrentPropositionPower(delegatee);
      expect(proposingPower).to.equal(distributorBalance);
    }

    if (checkVotingPower) {
      const votingPower: string = await governance.getCurrentVotingPower(delegatee);
      expect(votingPower).to.equal(distributorBalance);
    }
  }
});

export async function incrementTimeToTimestamp(timestampString: string): Promise<void> {
  const latestBlockTimestamp = await timeLatest();
  const timestamp: BNJS = new BNJS(timestampString);
  if (latestBlockTimestamp.toNumber() > timestamp.toNumber()) {
    throw new Error('incrementTimeToTimestamp: Cannot move backwards in time');
  }
  const timestampDiff: number = timestamp.minus(latestBlockTimestamp).toNumber();
  await increaseTimeAndMine(timestampDiff);
}
