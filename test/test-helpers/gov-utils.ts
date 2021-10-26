import { BigNumber, utils } from 'ethers';
import { SignerWithAddress, TestEnv } from './make-suite';
import { latestBlock, DRE, waitForTx } from '../../helpers/misc-utils';
import {expect} from 'chai';
import { Executor } from '../../types/Executor';
import { deployExecutor } from '../../helpers/contracts-deployments';
import { ONE_DAY } from '../../helpers/constants';
import { eContractId } from '../../helpers/types';

export const emptyBalances = async (users: SignerWithAddress[], testEnv: TestEnv) => {
  for (let i = 0; i < users.length; i++) {
    const balanceBefore = await testEnv.dydxToken.connect(users[i].signer).balanceOf(users[i].address);
    await (
      await testEnv.dydxToken.connect(users[i].signer).transfer(testEnv.deployer.address, balanceBefore)
    ).wait();
  }
};

export const setBalance = async (user: SignerWithAddress, amount:BigNumber, testEnv: TestEnv) => {
  // emptying
  const balanceBefore = await testEnv.dydxToken.connect(user.signer).balanceOf(user.address);
  await (
    await testEnv.dydxToken.connect(user.signer).transfer(testEnv.deployer.address, balanceBefore)
  ).wait();
  // filling
  await testEnv.dydxToken.connect(testEnv.deployer.signer).transfer(user.address, amount);
};

export const getInitContractData = async (testEnv: TestEnv, executor: Executor) => ({
  votingDelay: await testEnv.governor.getVotingDelay(),
  votingDuration: await executor.VOTING_DURATION(),
  executionDelay: await executor.getDelay(),
  minimumPower: await executor.getMinimumVotingPowerNeeded(
    await testEnv.strategy.getTotalVotingSupplyAt(await latestBlock())
  ),
  minimumCreatePower: await executor.getMinimumPropositionPowerNeeded(
    testEnv.governor.address,
    await latestBlock()
  ),
  gracePeriod: await executor.GRACE_PERIOD(),
});

export const expectProposalState = async (
  proposalId: BigNumber,
  state: number,
  testEnv: TestEnv
) => {
  expect(await testEnv.governor.connect(testEnv.deployer.signer).getProposalState(proposalId)).to.be.equal(
    state
  );
};

export const getLastProposalId = async (testEnv: TestEnv) => {
  const currentCount = await testEnv.governor.getProposalsCount();
  return currentCount.eq('0') ? currentCount : currentCount.sub('1');
};

export const encodeSetDelay = async (newDelay: string, testEnv: TestEnv) =>
  testEnv.governor.interface.encodeFunctionData('setVotingDelay', [BigNumber.from(newDelay)]);

export const deployTestExecutor = async (testEnv: TestEnv): Promise<Executor> => {
  const executor = await deployExecutor(
    testEnv.governor.address,
    '60',  // 60 second delay
     ONE_DAY.multipliedBy(14).toString(),  // 14 day grace period
     '1',  // 1 second min delay
     ONE_DAY.multipliedBy(30).toString(),  // 30 day max delay
     '100',  // 1% proposition threshold
     '6',  // 6 block vote duration
     '500',  // 5% vote differential
     '2000',  // 20% min quorum
     eContractId.Executor,
  );

  // authorize executor to pass proposals
  await waitForTx(await testEnv.governor.authorizeExecutors([executor.address]));

  // grant executor OWNER_ROLE on governor
  const ownerRole = utils.keccak256(utils.toUtf8Bytes('OWNER_ROLE'));
  await waitForTx(await testEnv.governor.grantRole(ownerRole, executor.address));

  return executor;
};
