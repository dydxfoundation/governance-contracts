import config from '../../src/config';
import { AFFECTED_STAKERS, getStakedAmount } from '../../src/lib/affected-stakers';
import { MAX_UINT_AMOUNT } from '../../src/lib/constants';
import { impersonateAndFundAccount } from '../../src/migrations/helpers/impersonate-account';
import { DydxToken__factory, SafetyModuleV2__factory } from '../../types';

export async function simulateAffectedStakers({
  dydxTokenAddress,
  safetyModuleAddress,
  rewardsTreasuryAddress,
}: {
  dydxTokenAddress: string,
  safetyModuleAddress: string,
  rewardsTreasuryAddress: string,
}): Promise<void> {
  const dydxToken = new DydxToken__factory().attach(dydxTokenAddress);
  const safetyModule = new SafetyModuleV2__factory().attach(safetyModuleAddress);
  const mockRewardsTreasury = await impersonateAndFundAccount(rewardsTreasuryAddress);
  const testStakers = AFFECTED_STAKERS.slice(0, config.HARDHAT_SIMULATE_AFFECTED_STAKERS);
  for (const stakerAddress of testStakers) {
    const stakedAmount = getStakedAmount(stakerAddress);
    await dydxToken.connect(mockRewardsTreasury).transfer(stakerAddress, stakedAmount);
    const staker = await impersonateAndFundAccount(stakerAddress);
    await dydxToken.connect(staker).approve(safetyModuleAddress, MAX_UINT_AMOUNT);
    await safetyModule.connect(staker).stake(stakedAmount);
  }
}
