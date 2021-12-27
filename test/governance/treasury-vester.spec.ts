import BNJS from 'bignumber.js';
import { BigNumber } from 'ethers';
import { expect } from 'chai';
import {
  makeSuite,
  TestEnv,
  deployPhase2,
  SignerWithAddress,
} from '../test-helpers/make-suite';
import {
  evmRevert,
  evmSnapshot,
  increaseTime,
  timeLatest,
  toWad,
  waitForTx,
} from '../../helpers/misc-utils';
import { TreasuryVester } from '../../types/TreasuryVester';
import { DydxToken } from '../../types/DydxToken';

const snapshots = new Map<string, string>();

makeSuite(
  'dYdX Treasury Vester tests',
  deployPhase2,
  (testEnv: TestEnv) => {

    let dydxToken: DydxToken;
    let treasuryVester: TreasuryVester;
    let treasuryVesterRecipient: SignerWithAddress;
    let vestingAmount: BNJS;
    let vestingBegin: BNJS;
    let vestingCliff: BNJS;
    let vestingEnd: BNJS;
    let preBalance: BigNumber;

    before(async () => {
      treasuryVester = testEnv.rewardsTreasuryVester;
      treasuryVesterRecipient = testEnv.rewardsTreasury;
      dydxToken = testEnv.dydxToken;

      vestingAmount = new BNJS((await testEnv.rewardsTreasuryVester.vestingAmount()).toString());
      vestingBegin = new BNJS((await testEnv.rewardsTreasuryVester.vestingBegin()).toString());
      vestingCliff = new BNJS((await testEnv.rewardsTreasuryVester.vestingCliff()).toString());
      vestingEnd = new BNJS((await testEnv.rewardsTreasuryVester.vestingEnd()).toString());
      await waitForTx(await dydxToken.transfer(treasuryVester.address, vestingAmount.toFixed()));
      preBalance = await dydxToken.balanceOf(treasuryVesterRecipient.address);

      snapshots.set('fullTreasurySnapshot', await evmSnapshot())
    });

    describe('TreasuryVester tests', async function () {
      beforeEach(async () => {
        await evmRevert(snapshots.get('fullTreasurySnapshot') || '1');
      });

      it('setRecipient from non-recipient fails', async () => {
        const nonTreasuryRecipient: SignerWithAddress = testEnv.users[1];

        await expect(treasuryVester.setRecipient(nonTreasuryRecipient.address)).to.be.revertedWith(
          'SET_RECIPIENT_UNAUTHORIZED',
        );
      });

      it('Claim fails when before vestingCliff', async () => {
        await expect(treasuryVester.claim()).to.be.revertedWith(
          'CLAIM_TOO_EARLY',
        );
        const latestBlockTimestamp = await timeLatest();
        const secondsUntilVestingCliff: number = vestingCliff.minus(latestBlockTimestamp).toNumber();
        // before vestingCliff
        await increaseTime(secondsUntilVestingCliff - 1);
        await expect(treasuryVester.claim()).to.be.revertedWith(
          'CLAIM_TOO_EARLY',
        );
      });

      it('Claim succeeds when after vesting cliff but before vesting end', async () => {
        const halfwayPoint: number = Math.floor(vestingEnd.minus(vestingBegin).div('2').toNumber());
        const latestBlockTimestamp = await timeLatest();
        const secondsUntilVestingBegin: number = vestingBegin.minus(latestBlockTimestamp).toNumber();
        await increaseTime(secondsUntilVestingBegin + halfwayPoint)

        await treasuryVester.claim();

        const postBalance: BigNumber = await dydxToken.balanceOf(treasuryVesterRecipient.address);

        // expect to be vested roughly half the tokens
        const vestedTokens: BNJS = new BNJS(postBalance.sub(preBalance).toString());
        const expectedVestedTokens: BNJS = vestingAmount.div(2);
        expect(vestedTokens.minus(expectedVestedTokens).lte(toWad(10))).to.be.true;
      });

      it('Claim after vesting end sends all tokens to recipient', async () => {
        const latestBlockTimestamp = await timeLatest();
        const secondsUntilVestingEnd: number = vestingEnd.minus(latestBlockTimestamp).toNumber();
        await increaseTime(secondsUntilVestingEnd)

        await treasuryVester.claim();

        // rewards treasury should have received all tokens
        const postBalance: BigNumber = await dydxToken.balanceOf(treasuryVesterRecipient.address);
        const vestedTokens: BNJS = new BNJS(postBalance.sub(preBalance).toString());
        expect(vestedTokens.toString()).to.be.eq(vestingAmount.toString());
      });
    });
  }
);
