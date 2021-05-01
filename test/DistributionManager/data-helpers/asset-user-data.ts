import { BigNumber } from 'ethers';
import { DistributionManager } from '../../../types/DistributionManager';
import { IncentivesController } from '../../../types/IncentivesController';
import { StakedDydxToken } from '../../../types/StakedDydxToken';

export type UserStakeInput = {
  underlyingAsset: string;
  stakedByUser: string;
  totalStaked: string;
};

export type UserPositionUpdate = UserStakeInput & {
  user: string;
};
export async function getUserIndex(
  distributionManager: DistributionManager | IncentivesController | StakedDydxToken,
  user: string,
  asset: string
): Promise<BigNumber> {
  return await distributionManager.getUserAssetData(user, asset);
}
