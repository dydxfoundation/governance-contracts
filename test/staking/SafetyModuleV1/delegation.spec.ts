import { expect } from 'chai';
import { fail } from 'assert';
import { BigNumber, ethers } from 'ethers';

import { deployPhase2, makeSuite, SignerWithAddress, TestEnv } from '../../test-helpers/make-suite';
import { DRE, advanceBlock, timeLatest, waitForTx, increaseTime, incrementTimeToTimestamp, latestBlock, evmSnapshot, evmRevert } from '../../../helpers/misc-utils';
import { deployDoubleTransferHelper } from '../../../helpers/contracts-deployments';
import {
  buildDelegateParams,
  buildDelegateByTypeParams,
  getSignatureFromTypedData,
} from '../../../helpers/contracts-helpers';
import { parseEther } from 'ethers/lib/utils';
import { MAX_UINT_AMOUNT, ZERO_ADDRESS } from '../../../helpers/constants';
import { SafetyModuleV1 } from '../../../types/SafetyModuleV1';
import { DydxToken } from '../../../types/DydxToken';

const testWallets = require('../../../test-wallets');

const SAFETY_MODULE_EIP_712_DOMAIN_NAME = 'dYdX Safety Module';

const snapshots = new Map<string, string>();
const snapshotName = 'init';

makeSuite('Safety Module Staked DYDX - Power Delegations', deployPhase2, (testEnv: TestEnv) => {
  let deployer: SignerWithAddress;
  let dydxToken: DydxToken;
  let safetyModule: SafetyModuleV1;
  let users: SignerWithAddress[];
  let userKeys: string[];

  before(async () => {
    ({
      deployer,
      dydxToken,
      safetyModule,
      users,
    } = testEnv);

    userKeys = testWallets.accounts.map((a: { secretKey: string }) => a.secretKey);

    // Give some tokens to stakers and set allowance.
    const amount = ethers.utils.parseEther('100').toString();
    for (const user of users.slice(1, 6)) {
      await dydxToken.connect(deployer.signer).transfer(user.address, amount);
      await dydxToken.connect(user.signer).approve(safetyModule.address, amount);
    }

    // Advance to when transfers are enabled. Note that this is after the distribution start.
    await incrementTimeToTimestamp(await dydxToken._transfersRestrictedBefore());

    snapshots.set(snapshotName, await evmSnapshot());
  });

  afterEach(async () => {
    await evmRevert(snapshots.get(snapshotName)!);
    snapshots.set(snapshotName, await evmSnapshot());
  });

  it('User 1 tries to delegate voting power to user 2', async () => {
    await safetyModule.connect(users[1].signer).delegateByType(users[2].address, '0');

    const delegatee = await safetyModule.getDelegateeByType(users[1].address, '0');

    expect(delegatee.toString()).to.be.equal(users[2].address);
  });

  it('User 1 tries to delegate proposition power to user 3', async () => {
    await safetyModule.connect(users[1].signer).delegateByType(users[3].address, '1');

    const delegatee = await safetyModule.getDelegateeByType(users[1].address, '1');

    expect(delegatee.toString()).to.be.equal(users[3].address);
  });

  it('User 1 tries to delegate voting power to ZERO_ADDRESS but delegator should remain', async () => {
    const tokenBalance = parseEther('1');

    // Stake
    await safetyModule.connect(users[1].signer).stake(tokenBalance);

    // Track current power
    const priorPowerUser = await safetyModule.getPowerCurrent(users[1].address, '0');
    const priorPowerUserZeroAddress = await safetyModule.getPowerCurrent(ZERO_ADDRESS, '0');

    expect(priorPowerUser).to.be.equal(tokenBalance, 'user power should equal balance');
    expect(priorPowerUserZeroAddress).to.be.equal('0', 'zero address should have zero power');

    await expect(
      safetyModule.connect(users[1].signer).delegateByType(ZERO_ADDRESS, '0')
    ).to.be.revertedWith('INVALID_DELEGATEE');
  });

  it('User 1 stakes 2 DYDX; checks voting and proposition power of user 2 and 3', async () => {
    // Setup: user 1 has delegated to users 2 and 3...
    await safetyModule.connect(users[1].signer).delegateByType(users[2].address, '0');
    await safetyModule.connect(users[1].signer).delegateByType(users[3].address, '1');

    const tokenBalance = parseEther('2');
    const expectedStaked = parseEther('2');

    // Stake
    await safetyModule.connect(users[1].signer).stakeFor(users[1].address, tokenBalance);

    const stakedTokenBalanceAfterMigration = await safetyModule.balanceOf(users[1].address);

    const user1PropPower = await safetyModule.getPowerCurrent(users[1].address, '0');
    const user1VotingPower = await safetyModule.getPowerCurrent(users[1].address, '1');

    const user2VotingPower = await safetyModule.getPowerCurrent(users[2].address, '0');
    const user2PropPower = await safetyModule.getPowerCurrent(users[2].address, '1');

    const user3VotingPower = await safetyModule.getPowerCurrent(users[3].address, '0');
    const user3PropPower = await safetyModule.getPowerCurrent(users[3].address, '1');

    expect(user1PropPower).to.be.equal('0', 'Incorrect prop power for user 1');
    expect(user1VotingPower).to.be.equal('0', 'Incorrect voting power for user 1');

    expect(user2PropPower).to.be.equal('0', 'Incorrect prop power for user 2');
    expect(user2VotingPower).to.be.equal(
      stakedTokenBalanceAfterMigration,
      'Incorrect voting power for user 2'
    );

    expect(user3PropPower).to.be.equal(
      stakedTokenBalanceAfterMigration,
      'Incorrect prop power for user 3'
    );
    expect(user3VotingPower).to.be.equal('0', 'Incorrect voting power for user 3');

    expect(expectedStaked).to.be.equal(stakedTokenBalanceAfterMigration);
  });

  describe('after user 1 delegates to users 2 and 3, and stakes 2 DYDX', () => {

    beforeEach(async () => {
      // Setup: user 1 has delegated to users 2 and 3 and stakes 2 DYDX...
      await safetyModule.connect(users[1].signer).delegateByType(users[2].address, '0');
      await safetyModule.connect(users[1].signer).delegateByType(users[3].address, '1');
      await safetyModule.connect(users[1].signer).stakeFor(users[1].address, parseEther('2'));
    });

    it('User 2 stakes 2 DYDX; checks voting and proposition power of user 2', async () => {
      const tokenBalance = parseEther('2');
      const expectedStakedTokenBalanceAfterStake = parseEther('2');

      // Stake
      await safetyModule.connect(users[2].signer).stakeFor(users[2].address, tokenBalance);

      const user2VotingPower = await safetyModule.getPowerCurrent(users[2].address, '0');
      const user2PropPower = await safetyModule.getPowerCurrent(users[2].address, '1');

      expect(user2PropPower).to.be.equal(
        expectedStakedTokenBalanceAfterStake,
        'Incorrect prop power for user 2'
      );
      expect(user2VotingPower).to.be.equal(
        expectedStakedTokenBalanceAfterStake.mul('2'),
        'Incorrect voting power for user 2'
      );
    });

    it('User 3 stakes 2 DYDX; checks voting and proposition power of user 3', async () => {
      // Stake
      await safetyModule.connect(users[3].signer).stakeFor(users[3].address, parseEther('2'));

      const user3VotingPower = await safetyModule.getPowerCurrent(users[3].address, '0');
      const user3PropPower = await safetyModule.getPowerCurrent(users[3].address, '1');

      expect(user3PropPower.toString()).to.be.equal(
        parseEther('4'),
        'Incorrect prop power for user 3'
      );
      expect(user3VotingPower.toString()).to.be.equal(
        parseEther('2'),
        'Incorrect voting power for user 3'
      );
    });

    it('User 2 also delegates powers to user 3', async () => {
      // Stake
      await safetyModule.connect(users[2].signer).stakeFor(users[2].address, parseEther('2'));
      await safetyModule.connect(users[3].signer).stakeFor(users[3].address, parseEther('2'));

      // Delegate
      await safetyModule.connect(users[2].signer).delegate(users[3].address);

      expect(await safetyModule.getPowerCurrent(users[3].address, '0')).to.be.equal(
        parseEther('4'),
        'Incorrect voting power for user 3',
      );
      expect(await safetyModule.getPowerCurrent(users[3].address, '1')).to.be.equal(
        parseEther('6'),
        'Incorrect prop power for user 3',
      );
    });
  });

  it('Checks the delegation at a past block', async () => {
    // Setup: user 1 has delegated to users 2 and 3...
    await safetyModule.connect(users[1].signer).delegateByType(users[2].address, '0');
    await safetyModule.connect(users[1].signer).delegateByType(users[3].address, '1');

    // Stake
    await safetyModule.connect(users[1].signer).stakeFor(users[1].address, parseEther('2'));
    const blockNumber = await latestBlock();

    const user1 = users[1];
    const user2 = users[2];
    const user3 = users[3];

    const user1VotingPower = await safetyModule.getPowerAtBlock(
      user1.address,
      blockNumber,
      '0'
    );
    const user1PropPower = await safetyModule.getPowerAtBlock(
      user1.address,
      blockNumber,
      '1'
    );

    const user2VotingPower = await safetyModule.getPowerAtBlock(
      user2.address,
      blockNumber,
      '0'
    );
    const user2PropPower = await safetyModule.getPowerAtBlock(
      user2.address,
      blockNumber,
      '1'
    );

    const user3VotingPower = await safetyModule.getPowerAtBlock(
      user3.address,
      blockNumber,
      '0'
    );
    const user3PropPower = await safetyModule.getPowerAtBlock(
      user3.address,
      blockNumber,
      '1'
    );

    const expectedUser1DelegatedVotingPower = '0';
    const expectedUser1DelegatedPropPower = '0';

    const expectedUser2DelegatedVotingPower = parseEther('2');
    const expectedUser2DelegatedPropPower = '0';

    const expectedUser3DelegatedVotingPower = '0';
    const expectedUser3DelegatedPropPower = parseEther('2');

    expect(user1VotingPower.toString()).to.be.equal(
      expectedUser1DelegatedPropPower,
      'Incorrect voting power for user 1'
    );
    expect(user1PropPower.toString()).to.be.equal(
      expectedUser1DelegatedVotingPower,
      'Incorrect prop power for user 1'
    );

    expect(user2VotingPower.toString()).to.be.equal(
      expectedUser2DelegatedVotingPower,
      'Incorrect voting power for user 2'
    );
    expect(user2PropPower.toString()).to.be.equal(
      expectedUser2DelegatedPropPower,
      'Incorrect prop power for user 2'
    );

    expect(user3VotingPower.toString()).to.be.equal(
      expectedUser3DelegatedVotingPower,
      'Incorrect voting power for user 3'
    );
    expect(user3PropPower.toString()).to.be.equal(
      expectedUser3DelegatedPropPower,
      'Incorrect prop power for user 3'
    );
  });

  it('Ensure that getting the power at the current block is the same as using getPowerCurrent', async () => {
    // Setup: user 1 has delegated to users 2 and 3...
    await safetyModule.connect(users[1].signer).delegateByType(users[2].address, '0');
    await safetyModule.connect(users[1].signer).delegateByType(users[3].address, '1');

    // Stake
    await safetyModule.connect(users[1].signer).stakeFor(users[1].address, parseEther('2'));

    const currTime = await timeLatest();

    await advanceBlock(currTime.toNumber() + 1);

    const currentBlock = await latestBlock();

    const votingPowerAtPreviousBlock = await safetyModule.getPowerAtBlock(
      users[1].address,
      currentBlock - 1,
      '0'
    );
    const votingPowerCurrent = await safetyModule.getPowerCurrent(users[1].address, '0');

    const propPowerAtPreviousBlock = await safetyModule.getPowerAtBlock(
      users[1].address,
      currentBlock - 1,
      '1'
    );
    const propPowerCurrent = await safetyModule.getPowerCurrent(users[1].address, '1');

    expect(votingPowerAtPreviousBlock.toString()).to.be.equal(
      votingPowerCurrent.toString(),
      'Incorrect voting power for user 1'
    );
    expect(propPowerAtPreviousBlock.toString()).to.be.equal(
      propPowerCurrent.toString(),
      'Incorrect voting power for user 1'
    );
  });

  it("Checks you can't fetch power at a block in the future", async () => {
    const currentBlock = await latestBlock();

    await expect(
      safetyModule.getPowerAtBlock(users[1].address, currentBlock + 1, '0')
    ).to.be.revertedWith('INVALID_BLOCK_NUMBER');
    await expect(
      safetyModule.getPowerAtBlock(users[1].address, currentBlock + 1, '1')
    ).to.be.revertedWith('INVALID_BLOCK_NUMBER');
  });

  it('User 1 transfers value to himself. Ensures nothing changes in the delegated power', async () => {
    const user1VotingPowerBefore = await safetyModule.getPowerCurrent(users[1].address, '0');
    const user1PropPowerBefore = await safetyModule.getPowerCurrent(users[1].address, '1');

    const balance = await safetyModule.balanceOf(users[1].address);

    await safetyModule.connect(users[1].signer).transfer(users[1].address, balance);

    const user1VotingPowerAfter = await safetyModule.getPowerCurrent(users[1].address, '0');
    const user1PropPowerAfter = await safetyModule.getPowerCurrent(users[1].address, '1');

    expect(user1VotingPowerBefore.toString()).to.be.equal(
      user1VotingPowerAfter,
      'Incorrect voting power for user 1'
    );
    expect(user1PropPowerBefore.toString()).to.be.equal(
      user1PropPowerAfter,
      'Incorrect prop power for user 1'
    );
  });

  it('User 1 delegates voting power to User 2 via signature', async () => {
    const [, user1, user2] = users;

    // Calculate expected voting power
    const user2VotPower = await safetyModule.getPowerCurrent(user2.address, '1');
    const expectedVotingPower = (await safetyModule.getPowerCurrent(user1.address, '1')).add(
      user2VotPower
    );

    // Check prior delegatee is still user1
    const priorDelegatee = await safetyModule.getDelegateeByType(user1.address, '0');
    expect(priorDelegatee.toString()).to.be.equal(user1.address);

    // Prepare params to sign message
    const { chainId } = await DRE.ethers.provider.getNetwork();
    if (!chainId) {
      fail("Current network doesn't have CHAIN ID");
    }
    const nonce = (await safetyModule.nonces(user1.address)).toString();
    const expiration = MAX_UINT_AMOUNT;
    const msgParams = buildDelegateByTypeParams(
      chainId,
      safetyModule.address,
      user2.address,
      '0',
      nonce,
      expiration,
      SAFETY_MODULE_EIP_712_DOMAIN_NAME,
    );
    const ownerPrivateKey = userKeys[2];
    if (!ownerPrivateKey) {
      throw new Error('INVALID_OWNER_PK');
    }

    const { v, r, s } = getSignatureFromTypedData(ownerPrivateKey, msgParams);

    // Transmit message via delegateByTypeBySig
    const tx = await safetyModule
      .connect(user1.signer)
      .delegateByTypeBySig(user2.address, '0', nonce, expiration, v, r, s);

    // Check tx success and DelegateChanged
    const receipt = await(tx.wait(1));
    await expect(tx)
      .to.emit(safetyModule, 'DelegateChanged')
      .withArgs(user1.address, user2.address, 0);

    // Check DelegatedPowerChanged event: users[1] power should drop to zero
    await expect(tx)
      .to.emit(safetyModule, 'DelegatedPowerChanged')
      .withArgs(user1.address, 0, 0);

    // Check DelegatedPowerChanged event: users[2] power should increase to expectedVotingPower
    await expect(tx)
      .to.emit(safetyModule, 'DelegatedPowerChanged')
      .withArgs(user2.address, expectedVotingPower, 0);

    // Check internal state
    const delegatee = await safetyModule.getDelegateeByType(user1.address, '0');
    expect(delegatee.toString()).to.be.equal(user2.address, 'Delegatee should be user 2');

    const user2VotingPower = await safetyModule.getPowerCurrent(user2.address, '0');
    expect(user2VotingPower).to.be.equal(
      expectedVotingPower,
      'Delegatee should have voting power from user 1'
    );
  });

  it('User 1 delegates proposition to User 3 via signature', async () => {
    const {
      users: [, user1, , user3],
      safetyModule,
    } = testEnv;

    // Calculate expected proposition power
    const user3PropPower = await safetyModule.getPowerCurrent(user3.address, '1');
    const expectedPropPower = (await safetyModule.getPowerCurrent(user1.address, '1')).add(
      user3PropPower
    );

    // Check prior proposition delegatee is still user1
    const priorDelegatee = await safetyModule.getDelegateeByType(user1.address, '1');
    expect(priorDelegatee.toString()).to.be.equal(
      user1.address,
      'expected proposition delegatee to be user1'
    );

    // Prepare parameters to sign message
    const { chainId } = await DRE.ethers.provider.getNetwork();
    if (!chainId) {
      fail("Current network doesn't have CHAIN ID");
    }
    const nonce = (await safetyModule.nonces(user1.address)).toString();
    const expiration = MAX_UINT_AMOUNT;
    const msgParams = buildDelegateByTypeParams(
      chainId,
      safetyModule.address,
      user3.address,
      '1',
      nonce,
      expiration,
      SAFETY_MODULE_EIP_712_DOMAIN_NAME,
    );
    const ownerPrivateKey = userKeys[2];
    if (!ownerPrivateKey) {
      throw new Error('INVALID_OWNER_PK');
    }
    const { v, r, s } = getSignatureFromTypedData(ownerPrivateKey, msgParams);

    // Transmit tx via delegateByTypeBySig
    const tx = await safetyModule
      .connect(user1.signer)
      .delegateByTypeBySig(user3.address, '1', nonce, expiration, v, r, s);

    // Check tx success and DelegateChanged
    await expect(tx)
      .to.emit(safetyModule, 'DelegateChanged')
      .withArgs(user1.address, user3.address, 1);

    // Check DelegatedPowerChanged event: users[1] power should drop to zero
    await expect(tx)
      .to.emit(safetyModule, 'DelegatedPowerChanged')
      .withArgs(user1.address, 0, 1);

    // Check DelegatedPowerChanged event: users[2] power should increase to expectedVotingPower
    await expect(tx)
      .to.emit(safetyModule, 'DelegatedPowerChanged')
      .withArgs(user3.address, expectedPropPower, 1);

    // Check internal state matches events
    const delegatee = await safetyModule.getDelegateeByType(user1.address, '1');
    expect(delegatee.toString()).to.be.equal(user3.address, 'Delegatee should be user 3');

    const user3PropositionPower = await safetyModule.getPowerCurrent(user3.address, '1');
    expect(user3PropositionPower).to.be.equal(
      expectedPropPower,
      'Delegatee should have propostion power from user 1'
    );
  });

  it('User 2 delegates all to User 4 via signature', async () => {
    const [, user1, user2, , user4] = users

    await safetyModule.connect(user2.signer).delegate(user2.address);

    // Calculate expected powers
    const user4PropPower = await safetyModule.getPowerCurrent(user4.address, '1');
    const expectedPropPower = (await safetyModule.getPowerCurrent(user2.address, '1')).add(
      user4PropPower
    );

    const user1VotingPower = await safetyModule.balanceOf(user1.address);
    const user4VotPower = await safetyModule.getPowerCurrent(user4.address, '0');
    const user2ExpectedVotPower = user1VotingPower;
    const user4ExpectedVotPower = (await safetyModule.getPowerCurrent(user2.address, '0'))
      .add(user4VotPower)
      .sub(user1VotingPower); // Delegation does not delegate votes others from other delegations

    // Check prior proposition delegatee is still user1
    const priorPropDelegatee = await safetyModule.getDelegateeByType(user2.address, '1');
    expect(priorPropDelegatee.toString()).to.be.equal(
      user2.address,
      'expected proposition delegatee to be user1'
    );

    const priorVotDelegatee = await safetyModule.getDelegateeByType(user2.address, '0');
    expect(priorVotDelegatee.toString()).to.be.equal(
      user2.address,
      'expected proposition delegatee to be user1'
    );

    // Prepare parameters to sign message
    const { chainId } = await DRE.ethers.provider.getNetwork();
    if (!chainId) {
      fail("Current network doesn't have CHAIN ID");
    }
    const nonce = (await safetyModule.nonces(user2.address)).toString();
    const expiration = MAX_UINT_AMOUNT;
    const msgParams = buildDelegateParams(
      chainId,
      safetyModule.address,
      user4.address,
      nonce,
      expiration,
      SAFETY_MODULE_EIP_712_DOMAIN_NAME,
    );
    const ownerPrivateKey = userKeys[3];
    if (!ownerPrivateKey) {
      throw new Error('INVALID_OWNER_PK');
    }
    const { v, r, s } = getSignatureFromTypedData(ownerPrivateKey, msgParams);

    // Transmit tx via delegateByTypeBySig
    const tx = await safetyModule
      .connect(user2.signer)
      .delegateBySig(user4.address, nonce, expiration, v, r, s);

    // Check tx success and DelegateChanged for voting
    await expect(tx)
      .to.emit(safetyModule, 'DelegateChanged')
      .withArgs(user2.address, user4.address, 1);
    // Check tx success and DelegateChanged for proposition
    await expect(tx)
      .to.emit(safetyModule, 'DelegateChanged')
      .withArgs(user2.address, user4.address, 0);

    // Check DelegatedPowerChanged event: users[2] power should drop to zero
    await expect(tx)
      .to.emit(safetyModule, 'DelegatedPowerChanged')
      .withArgs(user2.address, 0, 1);

    // Check DelegatedPowerChanged event: users[4] power should increase to expectedVotingPower
    await expect(tx)
      .to.emit(safetyModule, 'DelegatedPowerChanged')
      .withArgs(user4.address, expectedPropPower, 1);

    // Check DelegatedPowerChanged event: users[2] power should drop to zero
    await expect(tx)
      .to.emit(safetyModule, 'DelegatedPowerChanged')
      .withArgs(user2.address, user2ExpectedVotPower, 0);

    // Check DelegatedPowerChanged event: users[4] power should increase to expectedVotingPower
    await expect(tx)
      .to.emit(safetyModule, 'DelegatedPowerChanged')
      .withArgs(user4.address, user4ExpectedVotPower, 0);

    // Check internal state matches events
    const propDelegatee = await safetyModule.getDelegateeByType(user2.address, '1');
    expect(propDelegatee.toString()).to.be.equal(
      user4.address,
      'Proposition delegatee should be user 4'
    );

    const votDelegatee = await safetyModule.getDelegateeByType(user2.address, '0');
    expect(votDelegatee.toString()).to.be.equal(user4.address, 'Voting delegatee should be user 4');

    const user4PropositionPower = await safetyModule.getPowerCurrent(user4.address, '1');
    expect(user4PropositionPower).to.be.equal(
      expectedPropPower,
      'Delegatee should have propostion power from user 2'
    );
    const user4VotingPower = await safetyModule.getPowerCurrent(user4.address, '0');
    expect(user4VotingPower).to.be.equal(
      user4ExpectedVotPower,
      'Delegatee should have votinh power from user 2'
    );

    const user2PropositionPower = await safetyModule.getPowerCurrent(user2.address, '1');
    expect(user2PropositionPower).to.be.equal('0', 'User 2 should have zero prop power');
    const user2VotingPower = await safetyModule.getPowerCurrent(user2.address, '0');
    expect(user2VotingPower).to.be.equal(
      user2ExpectedVotPower,
      'User 2 should still have voting power from user 1 delegation'
    );
  });

  it('User 1 should not be able to delegate with bad signature', async () => {
    const [, user1, user2] = users;

    // Prepare params to sign message
    const { chainId } = await DRE.ethers.provider.getNetwork();
    if (!chainId) {
      fail("Current network doesn't have CHAIN ID");
    }
    const nonce = (await safetyModule.nonces(user1.address)).toString();
    const expiration = MAX_UINT_AMOUNT;
    const msgParams = buildDelegateByTypeParams(
      chainId,
      safetyModule.address,
      user2.address,
      '0',
      nonce,
      expiration,
      SAFETY_MODULE_EIP_712_DOMAIN_NAME,
    );
    const ownerPrivateKey = userKeys[0];
    if (!ownerPrivateKey) {
      throw new Error('INVALID_OWNER_PK');
    }

    const { r, s } = getSignatureFromTypedData(ownerPrivateKey, msgParams);

    // Transmit message via delegateByTypeBySig
    await expect(
      safetyModule
        .connect(user1.signer)
        .delegateByTypeBySig(user2.address, '0', nonce, expiration, 0, r, s)
    ).to.be.revertedWith('INVALID_SIGNATURE');
  });

  it('User 1 should not be able to delegate with bad nonce', async () => {
    const [, user1, user2] = users;

    // Prepare params to sign message
    const { chainId } = await DRE.ethers.provider.getNetwork();
    if (!chainId) {
      fail("Current network doesn't have CHAIN ID");
    }
    const expiration = MAX_UINT_AMOUNT;
    const msgParams = buildDelegateByTypeParams(
      chainId,
      safetyModule.address,
      user2.address,
      '0',
      MAX_UINT_AMOUNT, // bad nonce
      expiration,
      SAFETY_MODULE_EIP_712_DOMAIN_NAME,
    );
    const ownerPrivateKey = userKeys[0];
    if (!ownerPrivateKey) {
      throw new Error('INVALID_OWNER_PK');
    }

    const { v, r, s } = getSignatureFromTypedData(ownerPrivateKey, msgParams);

    // Transmit message via delegateByTypeBySig
    await expect(
      safetyModule
        .connect(user1.signer)
        .delegateByTypeBySig(user2.address, '0', MAX_UINT_AMOUNT, expiration, v, r, s)
    ).to.be.revertedWith('INVALID_NONCE');
  });

  it('User 1 should not be able to delegate if signature expired', async () => {
    const [, user1, user2] = users;

    // Prepare params to sign message
    const { chainId } = await DRE.ethers.provider.getNetwork();
    if (!chainId) {
      fail("Current network doesn't have CHAIN ID");
    }
    const nonce = (await safetyModule.nonces(user1.address)).toString();
    const expiration = '0';
    const msgParams = buildDelegateByTypeParams(
      chainId,
      safetyModule.address,
      user2.address,
      '0',
      nonce,
      expiration,
      SAFETY_MODULE_EIP_712_DOMAIN_NAME,
    );
    const ownerPrivateKey = userKeys[2];
    if (!ownerPrivateKey) {
      throw new Error('INVALID_OWNER_PK');
    }

    const { v, r, s } = getSignatureFromTypedData(ownerPrivateKey, msgParams);

    // Transmit message via delegateByTypeBySig
    await expect(
      safetyModule
        .connect(user1.signer)
        .delegateByTypeBySig(user2.address, '0', nonce, expiration, v, r, s)
    ).to.be.revertedWith('INVALID_EXPIRATION');
  });

  it('User 2 should not be able to delegate all with bad signature', async () => {
    const [, , user2, , user4] = users

    // Prepare parameters to sign message
    const { chainId } = await DRE.ethers.provider.getNetwork();
    if (!chainId) {
      fail("Current network doesn't have CHAIN ID");
    }
    const nonce = (await safetyModule.nonces(user2.address)).toString();
    const expiration = MAX_UINT_AMOUNT;
    const msgParams = buildDelegateParams(
      chainId,
      safetyModule.address,
      user4.address,
      nonce,
      expiration,
      SAFETY_MODULE_EIP_712_DOMAIN_NAME,
    );
    const ownerPrivateKey = userKeys[3];
    if (!ownerPrivateKey) {
      throw new Error('INVALID_OWNER_PK');
    }
    const { v, r, s } = getSignatureFromTypedData(ownerPrivateKey, msgParams);

    // Transmit tx via delegateBySig
    await expect(
      safetyModule.connect(user2.signer).delegateBySig(user4.address, nonce, expiration, '0', r, s)
    ).to.be.revertedWith('INVALID_SIGNATURE');
  });

  it('User 2 should not be able to delegate all with bad nonce', async () => {
    const [, , user2, , user4] = users

    // Prepare parameters to sign message
    const { chainId } = await DRE.ethers.provider.getNetwork();
    if (!chainId) {
      fail("Current network doesn't have CHAIN ID");
    }
    const nonce = MAX_UINT_AMOUNT;
    const expiration = MAX_UINT_AMOUNT;
    const msgParams = buildDelegateParams(
      chainId,
      safetyModule.address,
      user4.address,
      nonce,
      expiration,
      SAFETY_MODULE_EIP_712_DOMAIN_NAME,
    );
    const ownerPrivateKey = userKeys[3];
    if (!ownerPrivateKey) {
      throw new Error('INVALID_OWNER_PK');
    }
    const { v, r, s } = getSignatureFromTypedData(ownerPrivateKey, msgParams);

    // Transmit tx via delegateByTypeBySig
    await expect(
      safetyModule.connect(user2.signer).delegateBySig(user4.address, nonce, expiration, v, r, s)
    ).to.be.revertedWith('INVALID_NONCE');
  });

  it('User 2 should not be able to delegate all if signature expired', async () => {
    const [, , user2, , user4] = users

    // Prepare parameters to sign message
    const { chainId } = await DRE.ethers.provider.getNetwork();
    if (!chainId) {
      fail("Current network doesn't have CHAIN ID");
    }
    const nonce = (await safetyModule.nonces(user2.address)).toString();
    const expiration = '0';
    const msgParams = buildDelegateParams(
      chainId,
      safetyModule.address,
      user4.address,
      nonce,
      expiration,
      SAFETY_MODULE_EIP_712_DOMAIN_NAME,
    );
    const ownerPrivateKey = userKeys[3];
    if (!ownerPrivateKey) {
      throw new Error('INVALID_OWNER_PK');
    }
    const { v, r, s } = getSignatureFromTypedData(ownerPrivateKey, msgParams);

    // Transmit tx via delegateByTypeBySig
    await expect(
      safetyModule.connect(user2.signer).delegateBySig(user4.address, nonce, expiration, v, r, s)
    ).to.be.revertedWith('INVALID_EXPIRATION');
  });

  it('Correct proposal and voting snapshotting on double action in the same block', async () => {
    const {
      users: [, sender, receiver],
      safetyModule,
    } = testEnv;

    // Stake
    const initialBalance = parseEther('1');
    await safetyModule.connect(users[1].signer).stake(initialBalance);

    const receiverPriorPower = await safetyModule.getPowerCurrent(receiver.address, '0');
    const senderPriorPower = await safetyModule.getPowerCurrent(sender.address, '0');

    // Deploy double transfer helper
    const doubleTransferHelper = await deployDoubleTransferHelper(safetyModule.address);

    await waitForTx(
      await safetyModule
        .connect(sender.signer)
        .transfer(doubleTransferHelper.address, initialBalance)
    );

    // Do double transfer
    await waitForTx(
      await doubleTransferHelper
        .connect(sender.signer)
        .doubleSend(receiver.address, parseEther('0.7'), initialBalance.sub(parseEther('0.7')))
    );

    const receiverCurrentPower = await safetyModule.getPowerCurrent(receiver.address, '0');
    const senderCurrentPower = await safetyModule.getPowerCurrent(sender.address, '0');

    expect(receiverCurrentPower).to.be.equal(
      senderPriorPower.add(receiverPriorPower),
      'Receiver should have added the sender power after double transfer'
    );
    expect(senderCurrentPower).to.be.equal(
      '0',
      'Sender power should be zero due transfered all the funds'
    );
  });
});
