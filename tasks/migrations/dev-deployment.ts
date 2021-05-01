import { task } from 'hardhat/config';
import { eContractid } from '../../helpers/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { StakedDydxToken } from '../../types/StakedDydxToken';

task('dev-deployment', 'Deployment in hardhat').setAction(async (_, localBRE) => {
  const DRE: HardhatRuntimeEnvironment = await localBRE.run('set-dre');

  const dydxStake = (await DRE.run(`deploy-${eContractid.StakedDydxToken}`)) as StakedDydxToken;
});
