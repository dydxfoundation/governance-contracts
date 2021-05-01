import { makeSuite, TestEnv } from '../helpers/make-suite';
import { SignerWithAddress } from '../helpers/make-suite';
import { LiquidityStakingV1 } from '../../types/LiquidityStakingV1';
import { StarkProxyV1 } from '../../types/StarkProxyV1';
import { MockStakedToken } from '../../types/MockStakedToken';
import { expect } from 'chai';

makeSuite('SP1Guardian', (testEnv: TestEnv) => {
  // Contracts.
  let guardian: SignerWithAddress;
  let liquidityStakingV1: LiquidityStakingV1;
  let mockStakedToken: MockStakedToken;

  // Each borrower is represented by a stark proxy contract.
  let borrowers: StarkProxyV1[];

  before(async () => {
    liquidityStakingV1 = testEnv.liquidityStakingV1;
    mockStakedToken = testEnv.mockStakedToken;
    borrowers = testEnv.starkProxyV1Borrowers;
    guardian = testEnv.guardian;
  });

  describe('isContractInDefault', () => {
    it('No borrowers are initially in default', async () => {
      for (const borrower of borrowers) {
        expect(await liquidityStakingV1.isBorrowerOverdue(borrower.address)).to.be.false;
      }
    });
  });
});
