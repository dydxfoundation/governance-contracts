import { tEthereumAddress } from '../../../helpers/types';
import { MintableErc20 } from '../../../types/MintableErc20';
import { StakedDydxToken } from '../../../types/StakedDydxToken';

export const logDydxTokenTokenBalanceOf = async (
  account: tEthereumAddress,
  dydxToken: MintableErc20
) => {
  console.log(
    `[dydxToken.balanceOf(${account})]: ${(await dydxToken.balanceOf(account)).toString()}`
  );
};

export const logStakedDydxTokenBalanceOf = async (
  staker: tEthereumAddress,
  stakedDydxTokenV2: StakedDydxToken
) => {
  console.log(
    `[stakedDydxTokenV2.balanceOf(${staker})]: ${(
      await stakedDydxTokenV2.balanceOf(staker)
    ).toString()}`
  );
};

export const logGetStakeTotalRewardsBalance = async (
  staker: tEthereumAddress,
  stakedDydxTokenV2: StakedDydxToken
) => {
  console.log(
    `[stakedDydxTokenV2.getTotalRewardsBalance(${staker})]: ${(
      await stakedDydxTokenV2.getTotalRewardsBalance(staker)
    ).toString()}`
  );
};

export const logRewardPerStakedDydxToken = async (stakedDydxTokenV2: StakedDydxToken) => {
  console.log(
    `[stakedDydxTokenV2.getRewardPerStakedDydxToken()]: ${(
      await stakedDydxTokenV2.getRewardPerStakedDydxToken()
    ).toString()}`
  );
};
