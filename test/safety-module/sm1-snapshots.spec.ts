import { AFFECTED_STAKERS } from '../../src/lib/affected-stakers';
import { impersonateAccount } from '../../src/migrations/helpers/impersonate-account';
import { getAffectedStakersForTest } from '../helpers/get-affected-stakers-for-test';
import { addSnapshotsTestCases } from './test-cases/snapshots-test-cases';

describe('Safety Module snapshots with new stakers', () => {
  addSnapshotsTestCases(
    (ctx) => [
      ctx.users[0],
      ctx.users[1],
    ],
  );
});

describe('Safety Module snapshots with stakers affected by the Safety Module bug', () => {
  if (getAffectedStakersForTest().length >= 2) {
    addSnapshotsTestCases(
      async () => [
        await impersonateAccount(AFFECTED_STAKERS[0]),
        await impersonateAccount(AFFECTED_STAKERS[1]),
      ],
    );
  }
});
