import {expect, use} from 'chai';
import {ipfsBytes32Hash, ZERO_ADDRESS} from '../../helpers/constants';
import {
  makeSuite,
  TestEnv,
  deployPhase2,
} from '../test-helpers/make-suite';
import { solidity } from 'ethereum-waffle';
import {BytesLike} from 'ethers/lib/utils';
import {BigNumberish, BigNumber} from 'ethers';
import {
  evmRevert,
  evmSnapshot,
  waitForTx,
  advanceBlockTo,
  DRE,
  latestBlock,
} from '../../helpers/misc-utils';
import {
  emptyBalances,
  getInitContractData,
  setBalance,
  expectProposalState,
  getLastProposalId,
  deployTestExecutor,
} from '../test-helpers/gov-utils';
import {buildPermitParams, getSignatureFromTypedData} from '../test-helpers/permit';
import { fail } from 'assert';
import { Executor } from '../../types/Executor';

const proposalStates = {
  PENDING: 0,
  CANCELED: 1,
  ACTIVE: 2,
  FAILED: 3,
  SUCCEEDED: 4,
  QUEUED: 5,
  EXPIRED: 6,
  EXECUTED: 7,
};

const snapshots = new Map<string, string>();

makeSuite('dYdX Governance no voting delay', deployPhase2, (testEnv: TestEnv) => {
  let votingDelay: BigNumber;
  let votingDuration: BigNumber;
  let executionDelay: BigNumber;
  let minimumPower: BigNumber;
  let minimumCreatePower: BigNumber;
  let proposalId: BigNumber;
  let startBlock: BigNumber;
  let endBlock: BigNumber;
  let executionTime: BigNumber;
  let gracePeriod: BigNumber;
  let executor: Executor;

  // Snapshoting main states as entry for later testing
  // Then will test by last snap shot first.
  before(async () => {
    const {governor, strategy, dydxToken, users} = testEnv;
    const [user1, user2, user3, user4, user5] = users;

    executor = await deployTestExecutor(testEnv);

    ({
      votingDuration,
      executionDelay,
      minimumPower,
      minimumCreatePower,
      gracePeriod,
    } = await getInitContractData(testEnv, executor));

    votingDelay = BigNumber.from(100);

    // set governance delay to 100 blocks to speed up local tests
    await waitForTx(await governor.setVotingDelay(votingDelay));

    // Cleaning users balances
    await emptyBalances(users, testEnv);

    // SNAPSHOT: EMPTY GOVERNANCE
    snapshots.set('start', await evmSnapshot());

    // Preparing users with different powers for test
    // user 1: 50% min voting power + 2 = 10%+ total power
    await setBalance(user1, minimumPower.div('2').add('2'), testEnv);
    // user 2: 50% min voting power + 2 = 10%+ total power
    await setBalance(user2, minimumPower.div('2').add('2'), testEnv);
    // user 3: 2 % min voting power, will be used to swing the vote
    await setBalance(user3, minimumPower.mul('2').div('100').add('10'), testEnv);
    // user 4: 75% min voting power + 10 : = 15%+ total power, can barely make fail differential
    await setBalance(user4, minimumPower.mul('75').div('100').add('10'), testEnv);
    // user 5: 50% min voting power + 2 = 10%+ total power.
    await setBalance(user5, minimumPower.div('2').add('2'), testEnv);
    let block = await latestBlock();
    expect(await strategy.getVotingPowerAt(user5.address, block)).to.be.equal(
      minimumPower.div('2').add('2')
    );
    // user 5 delegates to user 2 => user 2 reached quorum
    await waitForTx(await dydxToken.connect(user5.signer).delegate(user2.address));
    block = await latestBlock();
    // checking delegation worked
    expect(await strategy.getVotingPowerAt(user5.address, block)).to.be.equal('0');
    expect(await strategy.getVotingPowerAt(user2.address, block)).to.be.equal(
      minimumPower.div('2').add('2').mul(2)
    );

    //Creating first proposal
    const tx1 = await waitForTx(
      await governor
        .connect(user1.signer)
        .create(executor.address, [ZERO_ADDRESS], ['0'], [''], ['0x'], [false], ipfsBytes32Hash)
    );

    // fixing constants
    proposalId = tx1.events?.[0].args?.id;
    startBlock = BigNumber.from(tx1.blockNumber).add(votingDelay);
    endBlock = BigNumber.from(tx1.blockNumber).add(votingDelay).add(votingDuration);
    // delay = 0, should be active
    await expectProposalState(proposalId, proposalStates.PENDING, testEnv);

    // SNAPSHOT PENDING
    snapshots.set('active', await evmSnapshot());

    const balanceAfter = await dydxToken.connect(user1.signer).balanceOf(user1.address);

    // Pending => Active
    // => go tto start block
    await advanceBlockTo(Number(startBlock.add(1).toString()));
    await expectProposalState(proposalId, proposalStates.ACTIVE, testEnv);

    // SNAPSHOT: ACTIVE PROPOSAL
    snapshots.set('active', await evmSnapshot());

    // Active => Succeeded, user 1 + user 2 votes > threshold
    await expect(governor.connect(user1.signer).submitVote(proposalId, true))
      .to.emit(governor, 'VoteEmitted')
      .withArgs(proposalId, user1.address, true, balanceAfter);
    await expect(governor.connect(user2.signer).submitVote(proposalId, true))
      .to.emit(governor, 'VoteEmitted')
      .withArgs(proposalId, user2.address, true, balanceAfter.mul('2'));

    // go to end of voting period
    await advanceBlockTo(Number(endBlock.add('3').toString()));
    await expectProposalState(proposalId, proposalStates.SUCCEEDED, testEnv);

    // SNAPSHOT: SUCCEEDED PROPOSAL
    snapshots.set('succeeded', await evmSnapshot());

    // Succeeded => Queued:
    await (await governor.connect(user1.signer).queue(proposalId)).wait();
    await expectProposalState(proposalId, proposalStates.QUEUED, testEnv);

    // SNAPSHOT: QUEUED PROPOSAL
    executionTime = (await governor.getProposalById(proposalId)).executionTime;
    snapshots.set('queued', await evmSnapshot());
  });

  describe('Testing queue function', async function () {
    beforeEach(async () => {
      await evmRevert(snapshots.get('succeeded') || '1');
      proposalId = await getLastProposalId(testEnv);
      await expectProposalState(proposalId, proposalStates.SUCCEEDED, testEnv);
      snapshots.set('succeeded', await evmSnapshot());
    });

    it('Queue a proposal', async () => {
      const {
        governor,
        users: [user],
      } = testEnv;
      // Queue
      const queueTx = await governor.connect(user.signer).queue(proposalId);
      const queueTxResponse = await waitForTx(queueTx);
      const blockTime = await DRE.ethers.provider.getBlock(queueTxResponse.blockNumber);

      const executionTime = blockTime.timestamp + Number(executionDelay.toString());

      await expect(Promise.resolve(queueTx))
        .to.emit(governor, 'ProposalQueued')
        .withArgs(proposalId, executionTime, user.address);
      await expectProposalState(proposalId, proposalStates.QUEUED, testEnv);
    });
  });

  describe('Testing voting functions', async function () {
    beforeEach(async () => {
      await evmRevert(snapshots.get('active') || '1');
      proposalId = await getLastProposalId(testEnv);
      await expectProposalState(proposalId, proposalStates.ACTIVE, testEnv);
      snapshots.set('active', await evmSnapshot());
    });

    it('Vote a proposal without quorum => proposal failed', async () => {
      // User 1 has 50% min power, should fail
      const {
        governor,
        users: [user1],
        dydxToken,
      } = testEnv;

      // user 1 has only half of enough voting power
      const balance = await dydxToken.connect(user1.signer).balanceOf(user1.address);
      await expect(governor.connect(user1.signer).submitVote(proposalId, true))
        .to.emit(governor, 'VoteEmitted')
        .withArgs(proposalId, user1.address, true, balance);

      await advanceBlockTo(Number(endBlock.add('9').toString()));
      expect(await executor.isQuorumValid(governor.address, proposalId)).to.be.equal(false);
      expect(await executor.isVoteDifferentialValid(governor.address, proposalId)).to.be.equal(true);
      expect(await governor.connect(user1.signer).getProposalState(proposalId)).to.be.equal(
        proposalStates.FAILED
      );
    });

    it('Vote a proposal with quorum => proposal succeeded', async () => {
      // Vote
      const {
        governor,
        strategy,
        users: [user1, user2],
        dydxToken,
      } = testEnv;
      // User 1 + User 2 power > voting po<wer, see before() function
      const balance1 = await dydxToken.connect(user1.signer).balanceOf(user1.address);
      await expect(governor.connect(user1.signer).submitVote(proposalId, true))
        .to.emit(governor, 'VoteEmitted')
        .withArgs(proposalId, user1.address, true, balance1);
      //  user 2 has received delegation from user 5
      const power2 = await strategy.getVotingPowerAt(user2.address, startBlock);
      await expect(governor.connect(user2.signer).submitVote(proposalId, true))
        .to.emit(governor, 'VoteEmitted')
        .withArgs(proposalId, user2.address, true, power2);

      // active => succeeded

      await advanceBlockTo(Number(endBlock.add('10').toString()));
      expect(await executor.isQuorumValid(governor.address, proposalId)).to.be.equal(true);
      expect(await executor.isVoteDifferentialValid(governor.address, proposalId)).to.be.equal(true);
      expect(await governor.connect(user1.signer).getProposalState(proposalId)).to.be.equal(
        proposalStates.SUCCEEDED
      );
    });
    it('Vote a proposal with quorum via delegation => proposal succeeded', async () => {
      // Vote
      const {
        governor,
        strategy,
        users: [user1, user2, , , user5],
        dydxToken,
      } = testEnv;
      // user 5 has delegated to user 2
      const balance2 = await dydxToken.connect(user1.signer).balanceOf(user2.address);
      const balance5 = await dydxToken.connect(user2.signer).balanceOf(user5.address);
      expect(await strategy.getVotingPowerAt(user2.address, startBlock)).to.be.equal(
        balance2.add(balance5)
      );
      await expect(governor.connect(user2.signer).submitVote(proposalId, true))
        .to.emit(governor, 'VoteEmitted')
        .withArgs(proposalId, user2.address, true, balance2.add(balance5));
      // active => succeeded
      await advanceBlockTo(Number(endBlock.add('11').toString()));
      expect(await executor.isQuorumValid(governor.address, proposalId)).to.be.equal(true);
      expect(await executor.isVoteDifferentialValid(governor.address, proposalId)).to.be.equal(true);
      expect(await governor.connect(user1.signer).getProposalState(proposalId)).to.be.equal(
        proposalStates.SUCCEEDED
      );
    });

    it('Vote a proposal with quorum but not vote dif => proposal failed', async () => {
      // Vote
      const {
        governor,
        strategy,
        users: [user1, user2, user3, user4],
        dydxToken,
      } = testEnv;
      // User 2 + User 5 delegation = 20% power, voting yes
      //  user 2 has received delegation from user 5
      const power2 = await strategy.getVotingPowerAt(user2.address, startBlock);
      await expect(governor.connect(user2.signer).submitVote(proposalId, true))
        .to.emit(governor, 'VoteEmitted')
        .withArgs(proposalId, user2.address, true, power2);

      // User 4 = 15% Power, voting no
      const balance4 = await dydxToken.connect(user4.signer).balanceOf(user4.address);
      await expect(governor.connect(user4.signer).submitVote(proposalId, false))
        .to.emit(governor, 'VoteEmitted')
        .withArgs(proposalId, user4.address, false, balance4);

      await advanceBlockTo(Number(endBlock.add('12').toString()));
      expect(await executor.isQuorumValid(governor.address, proposalId)).to.be.equal(true);
      expect(await executor.isVoteDifferentialValid(governor.address, proposalId)).to.be.equal(false);
      expect(await governor.connect(user1.signer).getProposalState(proposalId)).to.be.equal(
        proposalStates.FAILED
      );
    });

    it('Vote a proposal with quorum and vote dif => proposal succeeded', async () => {
      // Vote
      const {
        governor,
        strategy,
        users: [user1, user2, user3, user4],
        dydxToken,
      } = testEnv;
      // User 2 + User 5 delegation = 20% power, voting yes
      //  user 2 has received delegation from user 5
      const power2 = await strategy.getVotingPowerAt(user2.address, startBlock);
      await expect(governor.connect(user2.signer).submitVote(proposalId, true))
        .to.emit(governor, 'VoteEmitted')
        .withArgs(proposalId, user2.address, true, power2);

      // User 4 = 15% Power, voting no
      const balance4 = await dydxToken.connect(user4.signer).balanceOf(user4.address);
      await expect(governor.connect(user4.signer).submitVote(proposalId, false))
        .to.emit(governor, 'VoteEmitted')
        .withArgs(proposalId, user4.address, false, balance4);

      // User 3 makes the vote swing
      const balance3 = await dydxToken.connect(user3.signer).balanceOf(user3.address);
      await expect(governor.connect(user3.signer).submitVote(proposalId, true))
        .to.emit(governor, 'VoteEmitted')
        .withArgs(proposalId, user3.address, true, balance3);

      await advanceBlockTo(Number(endBlock.add('13').toString()));
      expect(await executor.isQuorumValid(governor.address, proposalId)).to.be.equal(true);
      expect(await executor.isVoteDifferentialValid(governor.address, proposalId)).to.be.equal(true);
      expect(await governor.connect(user1.signer).getProposalState(proposalId)).to.be.equal(
        proposalStates.SUCCEEDED
      );
    });

    it('Vote a proposal by permit', async () => {
      const {
        users: [, , user3],
        deployer,
        dydxToken,
        governor,
      } = testEnv;
      const {chainId} = await DRE.ethers.provider.getNetwork();
      const configChainId = DRE.network.config.chainId;
      // ChainID must exist in current provider to work
      expect(configChainId).to.be.equal(chainId);
      if (!chainId) {
        fail("Current network doesn't have CHAIN ID");
      }

      // Prepare signature
      const msgParams = buildPermitParams(chainId, governor.address, proposalId.toString(), true);
      const ownerPrivateKey = require('../../test-wallets.js').accounts[3].secretKey; // deployer, user1, user2, user3

      const {v, r, s} = getSignatureFromTypedData(ownerPrivateKey, msgParams);

      const balance = await dydxToken.connect(deployer.signer).balanceOf(user3.address);

      // Publish vote by signature using other address as relayer
      const votePermitTx = await governor
        .connect(user3.signer)
        .submitVoteBySignature(proposalId, true, v, r, s);

      await expect(Promise.resolve(votePermitTx))
        .to.emit(governor, 'VoteEmitted')
        .withArgs(proposalId, user3.address, true, balance);
    });
  });

  describe('Testing create function', async function () {
    beforeEach(async () => {
      await evmRevert(snapshots.get('start') || '1');
      snapshots.set('start', await evmSnapshot());
      const {governor} = testEnv;
      let currentCount = await governor.getProposalsCount();
      proposalId = currentCount.eq('0') ? currentCount : currentCount.sub('1');
    });

    it('should not create a proposal when proposer has not enough power', async () => {
      const {
        governor,
        users: [user],
      } = testEnv;
      // Give not enough DYDX for proposition tokens
      await setBalance(user, minimumCreatePower.sub('1'), testEnv);

      // Params for proposal
      const params: [
        string,
        string[],
        BigNumberish[],
        string[],
        BytesLike[],
        boolean[],
        BytesLike
      ] = [executor.address, [ZERO_ADDRESS], ['0'], [''], ['0x'], [false], ipfsBytes32Hash];

      // Create proposal
      await expect(governor.connect(user.signer).create(...params)).to.be.revertedWith(
        'PROPOSITION_CREATION_INVALID'
      );
    });
    it('should create proposal when enough power', async () => {
      const {
        governor,
        users: [user],
        strategy,
      } = testEnv;

      // Count current proposal id
      const count = await governor.connect(user.signer).getProposalsCount();

      // give enough power
      await setBalance(user, minimumCreatePower, testEnv);

      // Params for proposal
      const params: [
        string,
        string[],
        BigNumberish[],
        string[],
        BytesLike[],
        boolean[],
        BytesLike
      ] = [executor.address, [ZERO_ADDRESS], ['0'], [''], ['0x'], [false], ipfsBytes32Hash];

      // Create proposal
      const tx = await governor.connect(user.signer).create(...params);
      // Check ProposalCreated event
      const startBlock = BigNumber.from(tx.blockNumber).add(votingDelay);
      const endBlock = startBlock.add(votingDuration);
      const [
        executorAddress,
        targets,
        values,
        signatures,
        calldatas,
        withDelegateCalls,
        ipfsHash,
      ] = params;

      await expect(Promise.resolve(tx))
        .to.emit(governor, 'ProposalCreated')
        .withArgs(
          count,
          user.address,
          executorAddress,
          targets,
          values,
          signatures,
          calldatas,
          withDelegateCalls,
          startBlock,
          endBlock,
          strategy.address,
          ipfsHash
        );
      await expectProposalState(count, proposalStates.PENDING, testEnv);
    });
    it('should create proposal when enough power via delegation', async () => {
      const {
        governor,
        users: [user, user2],
        dydxToken,
        strategy,
      } = testEnv;

      // Count current proposal id
      const count = await governor.connect(user.signer).getProposalsCount();

      // give enough power
      await setBalance(user, minimumCreatePower.div('2').add('1'), testEnv);
      await setBalance(user2, minimumCreatePower.div('2').add('1'), testEnv);
      await waitForTx(await dydxToken.connect(user2.signer).delegate(user.address));

      // Params for proposal
      const params: [
        string,
        string[],
        BigNumberish[],
        string[],
        BytesLike[],
        boolean[],
        BytesLike
      ] = [executor.address, [ZERO_ADDRESS], ['0'], [''], ['0x'], [false], ipfsBytes32Hash];

      // Create proposal
      const tx = await governor.connect(user.signer).create(...params);
      // Check ProposalCreated event
      const startBlock = BigNumber.from(tx.blockNumber).add(votingDelay);
      const endBlock = startBlock.add(votingDuration);
      const [
        executorAddress,
        targets,
        values,
        signatures,
        calldatas,
        withDelegateCalls,
        ipfsHash,
      ] = params;

      await expect(Promise.resolve(tx))
        .to.emit(governor, 'ProposalCreated')
        .withArgs(
          count,
          user.address,
          executorAddress,
          targets,
          values,
          signatures,
          calldatas,
          withDelegateCalls,
          startBlock,
          endBlock,
          strategy.address,
          ipfsHash
        );
      await expectProposalState(count, proposalStates.PENDING, testEnv);
    });
    it('should not create a proposal without targets', async () => {
      const {
        governor,
        users: [user],
      } = testEnv;
      // Give enough DYDX for proposition tokens
      await setBalance(user, minimumCreatePower, testEnv);

      // Count current proposal id
      const count = await governor.connect(user.signer).getProposalsCount();

      // Params with no target
      const params: [
        string,
        string[],
        BigNumberish[],
        string[],
        BytesLike[],
        boolean[],
        BytesLike
      ] = [executor.address, [], ['0'], [''], ['0x'], [false], ipfsBytes32Hash];

      // Create proposal
      await expect(governor.connect(user.signer).create(...params)).to.be.revertedWith(
        'INVALID_EMPTY_TARGETS'
      );
    });

    it('should not create a proposal with unauthorized executor', async () => {
      const {
        governor,
        users: [user],
      } = testEnv;
      // Give enough DYDX for proposition tokens
      await setBalance(user, minimumCreatePower, testEnv);

      // Count current proposal id
      const count = await governor.connect(user.signer).getProposalsCount();

      // Params with not authorized user as executor
      const params: [
        string,
        string[],
        BigNumberish[],
        string[],
        BytesLike[],
        boolean[],
        BytesLike
      ] = [user.address, [ZERO_ADDRESS], ['0'], [''], ['0x'], [false], ipfsBytes32Hash];

      // Create proposal
      await expect(governor.connect(user.signer).create(...params)).to.be.revertedWith(
        'EXECUTOR_NOT_AUTHORIZED'
      );
    });

    it('should not create a proposal with less targets than calldata', async () => {
      const {
        governor,
        users: [user],
      } = testEnv;
      // Give enough DYDX for proposition tokens
      await setBalance(user, minimumCreatePower, testEnv);

      // Count current proposal id
      const count = await governor.connect(user.signer).getProposalsCount();

      // Params with no target
      const params: [
        string,
        string[],
        BigNumberish[],
        string[],
        BytesLike[],
        boolean[],
        BytesLike
      ] = [executor.address, [], ['0'], [''], ['0x'], [false], ipfsBytes32Hash];

      // Create proposal
      await expect(governor.connect(user.signer).create(...params)).to.be.revertedWith(
        'INVALID_EMPTY_TARGETS'
      );
    });

    it('should not create a proposal with inconsistent data', async () => {
      const {
        governor,
        users: [user],
      } = testEnv;
      // Give enough DYDX for proposition tokens
      await setBalance(user, minimumCreatePower, testEnv);

      // Count current proposal id
      const count = await governor.connect(user.signer).getProposalsCount();

      const params: (
        targetsLength: number,
        valuesLength: number,
        signaturesLength: number,
        calldataLength: number,
        withDelegatesLength: number
      ) => [string, string[], BigNumberish[], string[], BytesLike[], boolean[], BytesLike] = (
        targetsLength: number,
        valueLength: number,
        signaturesLength: number,
        calldataLength: number,
        withDelegatesLength: number
      ) => [
        executor.address,
        Array(targetsLength).fill(ZERO_ADDRESS),
        Array(valueLength).fill('0'),
        Array(signaturesLength).fill(''),
        Array(calldataLength).fill('0x'),
        Array(withDelegatesLength).fill(false),
        ipfsBytes32Hash,
      ];

      // Create proposal
      await expect(governor.connect(user.signer).create(...params(2, 1, 1, 1, 1))).to.be.revertedWith(
        'INCONSISTENT_PARAMS_LENGTH'
      );
      await expect(governor.connect(user.signer).create(...params(1, 2, 1, 1, 1))).to.be.revertedWith(
        'INCONSISTENT_PARAMS_LENGTH'
      );
      await expect(governor.connect(user.signer).create(...params(0, 1, 1, 1, 1))).to.be.revertedWith(
        'INVALID_EMPTY_TARGETS'
      );
      await expect(governor.connect(user.signer).create(...params(1, 1, 2, 1, 1))).to.be.revertedWith(
        'INCONSISTENT_PARAMS_LENGTH'
      );
      await expect(governor.connect(user.signer).create(...params(1, 1, 1, 2, 1))).to.be.revertedWith(
        'INCONSISTENT_PARAMS_LENGTH'
      );
      await expect(governor.connect(user.signer).create(...params(1, 1, 1, 1, 2))).to.be.revertedWith(
        'INCONSISTENT_PARAMS_LENGTH'
      );
    });

    it('should create a proposals with different data lengths', async () => {
      const {
        governor,
        users: [user],
        strategy,
      } = testEnv;
      // Give enough DYDX for proposition tokens
      await setBalance(user, minimumCreatePower, testEnv);

      const params: (
        targetsLength: number,
        valuesLength: number,
        signaturesLength: number,
        calldataLength: number,
        withDelegatesLength: number
      ) => [string, string[], BigNumberish[], string[], BytesLike[], boolean[], BytesLike] = (
        targetsLength: number,
        valueLength: number,
        signaturesLength: number,
        calldataLength: number,
        withDelegatesLength: number
      ) => [
        executor.address,
        Array(targetsLength).fill(ZERO_ADDRESS),
        Array(valueLength).fill('0'),
        Array(signaturesLength).fill(''),
        Array(calldataLength).fill('0x'),
        Array(withDelegatesLength).fill(false),
        ipfsBytes32Hash,
      ];
      for (let i = 1; i < 12; i++) {
        const count = await governor.connect(user.signer).getProposalsCount();
        const tx = await governor.connect(user.signer).create(...params(i, i, i, i, i));
        const startBlock = BigNumber.from(tx.blockNumber).add(votingDelay);
        const endBlock = startBlock.add(votingDuration);
        const [
          executorAddress,
          targets,
          values,
          signatures,
          calldatas,
          withDelegateCalls,
          ipfsHash,
        ] = params(i, i, i, i, i);

        await expect(Promise.resolve(tx))
          .to.emit(governor, 'ProposalCreated')
          .withArgs(
            count,
            user.address,
            executorAddress,
            targets,
            values,
            signatures,
            calldatas,
            withDelegateCalls,
            startBlock,
            endBlock,
            strategy.address,
            ipfsHash
          );
      }
    });
  });
});
