import {expect, use} from 'chai';
import {ipfsBytes32Hash, MAX_UINT_AMOUNT, ZERO_ADDRESS} from '../../helpers/constants';
import {
  makeSuite,
  TestEnv,
  deployPhase2,
} from '../test-helpers/make-suite';
import { solidity } from 'ethereum-waffle';
import {BytesLike} from 'ethers/lib/utils';
import {BigNumberish, BigNumber} from 'ethers';
import {advanceBlockTo, DRE, latestBlock, waitForTx} from '../../helpers/misc-utils';
import { FlashAttacks } from '../../types/FlashAttacks';
import { deployFlashAttacks } from '../../helpers/contracts-deployments';
import { deployTestExecutor } from '../test-helpers/gov-utils';
import { Executor } from '../../types/Executor';

makeSuite('dYdX Governance attack test cases', deployPhase2, (testEnv: TestEnv) => {
  let votingDelay: BigNumber;
  let votingDuration: BigNumber;
  let executionDelay: BigNumber;
  let currentVote: BigNumber;
  let minimumPower: BigNumber;
  let minimumCreatePower: BigNumber;
  let flashAttacks: FlashAttacks;
  let executor: Executor;

  before(async () => {
    const {
      governor,
      strategy,
      dydxToken,
      users: [user1, user2],
      deployer,
    } = testEnv;

    executor = await deployTestExecutor(testEnv);

    votingDelay = BigNumber.from(100);

    // set governance delay to 100 blocks to speed up local tests
    await waitForTx(await governor.setVotingDelay(votingDelay));

    votingDuration = await executor.VOTING_DURATION();
    executionDelay = await executor.getDelay();

    // Supply does not change during the tests
    minimumPower = await executor.getMinimumVotingPowerNeeded(
      await strategy.getTotalVotingSupplyAt(await latestBlock())
    );

    minimumCreatePower = await executor.getMinimumPropositionPowerNeeded(
      governor.address,
      await latestBlock(),
    );
    // Add some funds to user1
    await dydxToken.connect(deployer.signer).transfer(user1.address, minimumPower.add('1'));
    await dydxToken.connect(deployer.signer).transfer(user2.address, minimumPower.div('2'));

    // Deploy flash attacks contract and approve from distributor address
    flashAttacks = await deployFlashAttacks(dydxToken.address, deployer.address, governor.address);
    await dydxToken.connect(deployer.signer).approve(flashAttacks.address, MAX_UINT_AMOUNT);
  });

  beforeEach(async () => {
    const {governor} = testEnv;
    const currentCount = await governor.getProposalsCount();
    currentVote = currentCount.eq('0') ? currentCount : currentCount.sub('1');
  });

  it('Should not allow Flash proposal', async () => {
    const {
      users: [user],
    } = testEnv;

    // Params for proposal
    const params: [
      BigNumberish,
      string,
      string[],
      BigNumberish[],
      string[],
      BytesLike[],
      boolean[],
      BytesLike
    ] = [
      minimumCreatePower,
      executor.address,
      [ZERO_ADDRESS],
      ['0'],
      [''],
      ['0x'],
      [false],
      ipfsBytes32Hash,
    ];

    // Try to create proposal
    await expect(flashAttacks.connect(user.signer).flashProposal(...params)).to.be.revertedWith(
      'PROPOSITION_CREATION_INVALID'
    );
  });

  it('Should not allow Flash vote: the voting power should be zero', async () => {
    const {
      governor,
      users: [user],
      dydxToken,
    } = testEnv;

    // Transfer funds to user to create proposal and vote
    await dydxToken.transfer(user.address, minimumPower.add('1'));

    // Create proposal
    const tx1 = await waitForTx(
      await governor
        .connect(user.signer)
        .create(executor.address, [ZERO_ADDRESS], ['0'], [''], ['0x'], [false], ipfsBytes32Hash)
    );

    // Check ProposalCreated event
    const proposalId = tx1.events?.[0].args?.id;
    const startBlock = BigNumber.from(tx1.blockNumber).add(votingDelay);
    const support = true;
    await advanceBlockTo(Number(startBlock.toString()));

    // Vote
    await expect(flashAttacks.connect(user.signer).flashVote(minimumPower, proposalId, support))
      .to.emit(governor, 'VoteEmitted')
      .withArgs(proposalId, flashAttacks.address, support, '0');
  });
});
