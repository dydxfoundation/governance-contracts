import { expect } from 'chai';
import _ from 'lodash'

import {
  makeSuite,
  TestEnv,
  deployPhase2,
  SignerWithAddress,
} from '../../test-helpers/make-suite';
import { LiquidityStakingV1 } from '../../../types/LiquidityStakingV1';
import { StarkProxyV1 } from '../../../types/StarkProxyV1';
import { incrementTimeToTimestamp, timeLatest, waitForTx } from '../../../helpers/misc-utils';
import { MockStarkPerpetual } from '../../../types/MockStarkPerpetual';

makeSuite('SP1Guardian', deployPhase2, (testEnv: TestEnv) => {
  let deployer: SignerWithAddress;
  let guardian: SignerWithAddress;
  let exchangeOperator: SignerWithAddress;

  // Each borrower is represented by a stark proxy contract.
  let liquidityStaking: LiquidityStakingV1;
  let mockStarkPerpetual: MockStarkPerpetual;
  let borrowers: StarkProxyV1[];
  let borrower: StarkProxyV1;

  before(async () => {
    deployer = testEnv.deployer;
    guardian = testEnv.users[0];
    exchangeOperator = testEnv.users[1];

    liquidityStaking = testEnv.liquidityStaking;
    mockStarkPerpetual = testEnv.mockStarkPerpetual;
    borrowers = testEnv.starkProxyV1Borrowers;
    borrower = borrowers[0]

    // Grant exchange operator role.
    borrower.grantRole(await borrower.EXCHANGE_OPERATOR_ROLE(), exchangeOperator.address);

    // Grant guardian role.
    borrower.grantRole(await borrower.GUARDIAN_ROLE(), guardian.address);
    borrower.grantRole(await borrower.VETO_GUARDIAN_ROLE(), guardian.address);
    borrower.renounceRole(await borrower.GUARDIAN_ROLE(), deployer.address);
  });

  describe('isContractInDefault', () => {

    it('No borrowers are initially in default', async () => {
      for (const borrower of borrowers) {
        expect(await liquidityStaking.isBorrowerOverdue(borrower.address)).to.be.false;
      }
    });
  });

  describe('guardianVetoForcedTradeRequests', () => {

    it('Can veto a forced trade request', async () => {
      // Register STARK key and add it to the allowlist.
      const mockStarkKey = 0;
      await mockStarkPerpetual.registerUser(borrower.address, mockStarkKey, []);
      await borrower.allowStarkKey(mockStarkKey);

      // Owner enqueues a forced trade request.
      const args = _.range(12);
      const signature = Buffer.from('mock-signature');
      const tx = await borrower.queueForcedTradeRequest(args);
      const receipt = await waitForTx(tx);
      const { argsHash } = borrower.interface.parseLog(receipt.logs[0]).args;

      // Expect to fail during waiting period.
      await expect(borrower.forcedTradeRequest(args, signature)).to.be.revertedWith(
        'SP1Owner: Waiting period has not elapsed for forced trade'
      );

      // Allow waiting period to elapse.
      let timestamp = await timeLatest();
      await incrementTimeToTimestamp(timestamp.plus((await borrower.FORCED_TRADE_WAITING_PERIOD()).toString()).toString());

      // Note: 'function selector was not recognized' means it has attempted to call through to the
      // mock StarkPerpetual contract, and did not revert on StarkProxy.
      await expect(borrower.forcedTradeRequest(args, signature)).to.be.revertedWith(
        'function selector was not recognized'
      );

      // Expect to fail after waiting period, if vetoed.
      await borrower.connect(guardian.signer).guardianVetoForcedTradeRequests([argsHash]);
      await expect(borrower.forcedTradeRequest(args, signature)).to.be.revertedWith(
        'SP1Owner: Forced trade not queued or was vetoed'
      );

      // Queue it again and expect it to fail if outside of the grace period.
      await borrower.queueForcedTradeRequest(args);
      timestamp = await timeLatest();
      await incrementTimeToTimestamp(
        timestamp
          .plus((await borrower.FORCED_TRADE_WAITING_PERIOD()).toString())
          .plus((await borrower.FORCED_TRADE_GRACE_PERIOD()).toString())
          .plus(1)
          .toString()
      );
      await expect(borrower.forcedTradeRequest(args, signature)).to.be.revertedWith(
        'SP1Owner: Grace period has elapsed for forced trade',
      );
    });
  });
});
