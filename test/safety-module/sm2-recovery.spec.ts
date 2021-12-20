/* eslint-disable @typescript-eslint/brace-style */
import BNJS from 'bignumber.js';
import { expect } from 'chai';
import _ from 'lodash';

import { AFFECTED_STAKERS, getOwedAmount } from '../../src/lib/affected-stakers';
import { fundAccount, impersonateAccount, IMPERSONATED_ACCOUNT_STIPEND } from '../../src/migrations/helpers/impersonate-account';
import { SM2Recovery } from '../../types';
import { describeContractHardhatRevertBeforeEach, TestContext } from '../helpers/describe-contract';
import { getAffectedStakersForTest } from '../helpers/get-affected-stakers-for-test';

const EXPECTED_TOTAL_OWED = '173204761823871505252385';

let testStakers: string[];
let testAllStakers: boolean;
let contract: SM2Recovery;

function init(ctx: TestContext) {
  testStakers = getAffectedStakersForTest();
  testAllStakers = testStakers.length == AFFECTED_STAKERS.length;
  contract = ctx.safetyModuleRecovery;
}

describeContractHardhatRevertBeforeEach('SM2Recovery', init, (ctx: TestContext) => {

  it('Proxy admin is owned by the short timelock', async () => {
    const owner = await ctx.safetyModuleRecoveryProxyAdmin.owner();
    expect(owner).to.equal(ctx.shortTimelock.address);
  });

  it('Receives tokens from the Safety Module', async () => {
    // Get the totals for the subset of addresses being tested.
    const balance = await ctx.dydxToken.balanceOf(contract.address);
    expect(balance).to.equal(EXPECTED_TOTAL_OWED);

    // Verify the contract balance in the “full test” case with all stakers.
    if (testAllStakers) {
      const testTotalOwed = _.reduce(
        testStakers,
        (accOwed, stakerAddress) => {
          return accOwed.plus(getOwedAmount(stakerAddress));
        },
        new BNJS(0),
      );

      expect(balance).to.equal(testTotalOwed.toFixed());
    }
  });

  it('Affected stakers can claim the owed amount', async () => {
    for (const stakerAddress of testStakers) {
      // Fund account if needed. This is useful e.g. when using mainnet forking.
      if ((await ctx.dydxToken.balanceOf(stakerAddress)).lt(IMPERSONATED_ACCOUNT_STIPEND)) {
        await fundAccount(stakerAddress);
      }

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
      await contractAsStaker.claim();
      const balanceAfter = await ctx.dydxToken.balanceOf(stakerAddress);
      expect(balanceAfter).to.equal(balanceBefore.add(expectedOwedAmount));
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
    // Fail on hardhat network if the configured numTestStakers is too low.
    expect(testStakers.length).to.be.greaterThanOrEqual(3);
  });
});
