import { AFFECTED_STAKERS } from '../../src/lib/affected-stakers';
import { impersonateAccount } from '../../src/migrations/helpers/impersonate-account';
import { getAffectedStakersForTest } from '../helpers/get-affected-stakers-for-test';
import { addStakingTestCases } from './test-cases/staking-test-cases';

describe('SM1Staking with new stakers', () => {
  addStakingTestCases(
    (ctx) => [
      ctx.users[0],
      ctx.users[1],
    ],
  );
});

describe('SM1Staking with stakers affected by the Safety Module bug', () => {
  if (getAffectedStakersForTest().length >= 2) {
    addStakingTestCases(
      async () => [
        await impersonateAccount(AFFECTED_STAKERS[0]),
        await impersonateAccount(AFFECTED_STAKERS[1]),
      ],
    );
  }
});
