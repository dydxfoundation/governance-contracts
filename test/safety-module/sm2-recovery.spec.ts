/* eslint-disable @typescript-eslint/brace-style */
import BNJS from 'bignumber.js';
import { expect } from 'chai';
import _ from 'lodash';

import config from '../../src/config';
import { AFFECTED_STAKERS, getOwedAmount, getStakedAmount } from '../../src/lib/affected-stakers';
import { impersonateAccount } from '../../src/migrations/helpers/impersonate-account';
import { SM2Recovery } from '../../types';
import { describeContract, TestContext } from '../helpers/describe-contract';

const EXPECTED_TOTAL_STAKED = '157458874385337732047640';
const EXPECTED_TOTAL_OWED = '173204761823871505252385';

let numTestStakers: number;
let testStakers: string[];
let testAllStakers: boolean;
let contract: SM2Recovery;

function init(ctx: TestContext) {
  numTestStakers = config.HARDHAT_SIMULATE_AFFECTED_STAKERS;
  testStakers = AFFECTED_STAKERS.slice(0, numTestStakers);
  testAllStakers = testStakers.length == AFFECTED_STAKERS.length;
  contract = ctx.safetyModuleRecovery;
}

describeContract('SM2Recovery', init, (ctx: TestContext) => {

  it('Receives tokens from the Safety Module', async () => {
    // Get the totals for the subset of addrsses being tested.
    const [testTotalStaked, testTotalOwed] = _.reduce(
      testStakers,
      ([accStaked, accOwed], stakerAddress) => {
        return [
          accStaked.plus(getStakedAmount(stakerAddress)),
          accOwed.plus(getOwedAmount(stakerAddress)),
        ];
      },
      [new BNJS(0), new BNJS(0)],
    );

    const balance = await ctx.dydxToken.balanceOf(contract.address);

    // Verify the contract balance in the “full test” case with all stakers.
    if (testAllStakers) {
      expect(balance).to.equal(testTotalOwed.toFixed());
      expect(balance).to.equal(EXPECTED_TOTAL_OWED);
    }

    // Verify the contract balance in the case with a subset of stakers.
    else {
      expect(balance).to.equal(
        new BNJS(EXPECTED_TOTAL_OWED)
          .minus(EXPECTED_TOTAL_STAKED)
          .plus(testTotalStaked)
          .toFixed(),
      );
    }
  });

  it('Affected stakers can claim the owed amount', async () => {
    for (const stakerAddress of testStakers) {
      const expectedOwedAmount = getOwedAmount(stakerAddress);
      // Note: Assume that the staker was already funded with ETH during deployment.
      const staker = await impersonateAccount(stakerAddress);
      const contractAsStaker = contract.connect(staker);
      const contractOwedAmount = await contract.getOwedAmount(stakerAddress);
      const claimableAmount = await contractAsStaker.callStatic.claim();
      expect(contractOwedAmount).to.equal(expectedOwedAmount);
      expect(claimableAmount).to.equal(expectedOwedAmount);

      // Claim the owed amount.
      const balanceBefore = await ctx.dydxToken.balanceOf(stakerAddress);
      expect(balanceBefore).to.equal(0);
      await contractAsStaker.claim();
      const balanceAfter = await ctx.dydxToken.balanceOf(stakerAddress);
      expect(balanceAfter).to.equal(expectedOwedAmount);
      const contractOwedAmountAfter = await contract.getOwedAmount(stakerAddress);
      expect(contractOwedAmountAfter).to.equal(0);
      const claimableAmountAfter = await contractAsStaker.callStatic.claim();
      expect(claimableAmountAfter).to.equal(0);
    }

    // Verify the contract balance in the “full test” case with all stakers.
    if (testAllStakers) {
      const endingContractBalance = await ctx.dydxToken.balanceOf(contract.address);
      expect(endingContractBalance).to.equal(0);
    }
  });

  it('Tested with at least three test stakers', () => {
    // Fail if the configured numTestStakers is too low.
    expect(numTestStakers).to.be.greaterThanOrEqual(3);
  });
});
