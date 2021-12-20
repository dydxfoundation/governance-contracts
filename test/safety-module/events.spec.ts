import { expect } from 'chai';
import { Event } from 'ethers';
import _ from 'lodash';

import config from '../../src/config';
import { getStakedAmount } from '../../src/lib/affected-stakers';
import { ZERO_ADDRESS } from '../../src/lib/constants';
import { getRole } from '../../src/lib/util';
import { DelegationType, Role } from '../../src/types';
import { SafetyModuleV2 } from '../../types';
import { TestContext, describeContractHardhatRevertBeforeEach } from '../helpers/describe-contract';
import { getAffectedStakersForTest } from '../helpers/get-affected-stakers-for-test';

type EventName = keyof SafetyModuleV2['filters'];

let testStakers: string[];

function init() {
  testStakers = getAffectedStakersForTest();
}

describeContractHardhatRevertBeforeEach('SafetyModuleV2 initial emitted events', init, (ctx: TestContext) => {

  it('Events that were not emitted', async () => {
    const eventNames: EventName[] = [
      'Approval',
      'ClaimedRewards',
      'DelegateChanged',
      'OperatorClaimedRewardsFor',
      'OperatorWithdrawalRequestedFor',
      'OperatorWithdrewStakeFor',
      'Slashed',
      'UserIndexUpdated',
      'WithdrawalRequested',
      'WithdrewStake',
    ];
    for (const eventName of eventNames) {
      const logs = await getLogs(eventName);
      expect(logs.length).to.equal(0, `Expected no ${eventName} events`);
    }
  });

  it('Events emitted during initialization', async () => {
    await expectLogsByName(
      'BlackoutWindowChanged',
      [
        [ctx.config.BLACKOUT_WINDOW],
      ],
    );
    await expectLogsByName(
      'EpochParametersChanged',
      [
        [[ctx.config.EPOCH_LENGTH, ctx.config.EPOCH_ZERO_START]],
      ],
    );
    await expectLogsByName(
      'RewardsPerSecondUpdated',
      [
        [ctx.config.SM_REWARDS_PER_SECOND],
      ],
    );
  });

  it('Other events emitted during the deployment/configuration process', async () => {
    const roleGrantedEvents = [
      // From deployment.
      [getRole(Role.OWNER_ROLE), ctx.deployer.address],
      [getRole(Role.SLASHER_ROLE), ctx.deployer.address],
      [getRole(Role.EPOCH_PARAMETERS_ROLE), ctx.deployer.address],
      [getRole(Role.REWARDS_RATE_ROLE), ctx.deployer.address],
      [getRole(Role.CLAIM_OPERATOR_ROLE), ctx.claimsProxy.address],
      [getRole(Role.OWNER_ROLE), ctx.shortTimelock.address],
      [getRole(Role.SLASHER_ROLE), ctx.shortTimelock.address],
      [getRole(Role.EPOCH_PARAMETERS_ROLE), ctx.shortTimelock.address],
      [getRole(Role.REWARDS_RATE_ROLE), ctx.shortTimelock.address],
    ];
    if (config.isHardhat()) {
      roleGrantedEvents.push(...[
        // From test setup.
        [getRole(Role.OWNER_ROLE), ctx.deployer.address],
        [getRole(Role.SLASHER_ROLE), ctx.deployer.address],
        [getRole(Role.EPOCH_PARAMETERS_ROLE), ctx.deployer.address],
        [getRole(Role.REWARDS_RATE_ROLE), ctx.deployer.address],
        [getRole(Role.CLAIM_OPERATOR_ROLE), ctx.deployer.address],
        [getRole(Role.STAKE_OPERATOR_ROLE), ctx.deployer.address],
      ]);
    }
    await expectLogsByName(
      'RoleGranted',
      roleGrantedEvents,
    );
    await expectLogsByName(
      'RoleRevoked',
      [
        [getRole(Role.SLASHER_ROLE), ctx.deployer.address],
        [getRole(Role.EPOCH_PARAMETERS_ROLE), ctx.deployer.address],
        [getRole(Role.REWARDS_RATE_ROLE), ctx.deployer.address],
        [getRole(Role.OWNER_ROLE), ctx.deployer.address],
      ],
    );
  });

  it('Events emitted during staking', async () => {
    // Skip this check when running on hardhat network, without mainnet forking, with more than the
    // first 35 stakers. See migrations/affected-stakers.ts.
    if (
      config.isHardhat() &&
      !config.FORK_MAINNET &&
      testStakers.length > 35
    ) {
      return;
    }

    await expectLogsByName(
      'DelegatedPowerChanged',
      _.flatten(
        testStakers.map((staker) => {
          return [
            [staker, 0, DelegationType.VOTING_POWER],
            [staker, 0, DelegationType.PROPOSITION_POWER],
          ];
        }),
      ),
    );
    const stakedLogs = await getLogs('Staked');
    await expectLogs(
      stakedLogs,
      'Staked',
      testStakers.map((staker) => {
        return [staker, staker, getStakedAmount(staker), 0];
      }),
    );
    await expectLogsByName(
      'Transfer',
      testStakers.map((staker) => {
        return [ZERO_ADDRESS, staker, 0];
      }),
    );
    const stakesUniqueByBlockNumber = _.uniqBy(stakedLogs, (e) => e.blockNumber);
    await expectLogsByName(
      'GlobalIndexUpdated',
      stakesUniqueByBlockNumber.map(() => {
        return [0];
      }),
    );
  });

  async function getLogs(
    eventName: EventName,
  ): Promise<Event[]> {
    const filter = ctx.safetyModule.filters[eventName]();
    return ctx.safetyModule.queryFilter(filter);
  }

  function expectLogs(
    events: Event[],
    eventName: EventName,
    expectedArgsList: {}[][],
  ): void {
    // Compare number of events.
    const expectedCount = expectedArgsList.length;
    expect(events.length).to.equal(expectedCount, `Expected ${expectedCount} ${eventName} events`);

    // Compare args of each event.
    for (let i = 0; i < expectedCount; i++) {
      const actualArgs = events[i].args!;
      const expectedArgs = expectedArgsList[i];
      for (let j = 0; j < expectedArgs.length; j++) {
        const actual = actualArgs[j];
        const expected = expectedArgs[j];
        const message = `Event arg mismatch ${eventName}[${i}], arg ${j}: ${actual} != ${expected}`;
        if (Array.isArray(expected)) {
          expectArraysEqual(actual, expected, message);
        } else {
          expect(actual).to.equal(expected, message);
        }
      }
    }
  }

  async function expectLogsByName(
    eventName: EventName,
    expectedArgsList: {}[][],
  ): Promise<void> {
    const events = await getLogs(eventName);
    return expectLogs(events, eventName, expectedArgsList);
  }

  function expectArraysEqual(
    actual: {}[],
    expected: {}[],
    message: string,
  ): void {
    expect(actual.length).to.be.equal(expected.length, message);
    for (let i = 0; i < expected.length; i++) {
      expect(actual[i]).to.be.equal(expected[i], message);
    }
  }
});
