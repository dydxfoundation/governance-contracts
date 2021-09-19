import { getDeployConfig } from '../../src/deploy-config';
import { getStakedAmount } from '../../src/lib/affected-stakers';
import { MAX_UINT_AMOUNT } from '../../src/lib/constants';
import { waitForTx } from '../../src/lib/util';
import { impersonateAndFundAccount } from '../../src/migrations/helpers/impersonate-account';
import { DydxToken__factory, SafetyModuleV2__factory } from '../../types';
import { getAffectedStakersForTest } from '../helpers/get-affected-stakers-for-test';

export async function simulateAffectedStakers({
  dydxTokenAddress,
  safetyModuleAddress,
}: {
  dydxTokenAddress: string,
  safetyModuleAddress: string,
}): Promise<void> {
  const deployConfig = getDeployConfig();
  const dydxToken = new DydxToken__factory().attach(dydxTokenAddress);
  const safetyModule = new SafetyModuleV2__factory().attach(safetyModuleAddress);
  const dydxFoundation = await impersonateAndFundAccount(
    deployConfig.TOKEN_ALLOCATIONS.DYDX_FOUNDATION.ADDRESS,
  );
  const testStakers = getAffectedStakersForTest();
  for (const stakerAddress of testStakers) {
    const stakedAmount = getStakedAmount(stakerAddress);
    await waitForTx(await dydxToken.connect(dydxFoundation).transfer(stakerAddress, stakedAmount));
    const staker = await impersonateAndFundAccount(stakerAddress);
    await waitForTx(await dydxToken.connect(staker).approve(safetyModuleAddress, MAX_UINT_AMOUNT));
    await waitForTx(await safetyModule.connect(staker).stake(stakedAmount));

    // TODO: Debugging on hardhat for events.spec.ts.
    // Seems like this is possibly a bug in the hardhat node itself?
    // const myval = (await safetyModule.connect(staker).queryFilter(safetyModule.filters.Staked('0xb97d9350F32C1366016e2C0a55E4A210D1158b22'))).length > 0;
    // console.log('Staked from', staker.address, myval);
  }
}
