import { addStakingTestCases } from './test-cases/staking-test-cases';

describe('SM1Staking with new stakers', () => {
  addStakingTestCases(
    (ctx) => [
      ctx.users[0],
      ctx.users[1],
    ],
  );
});
