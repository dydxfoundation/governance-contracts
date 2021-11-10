import { formatUnits } from 'ethers/lib/utils';

import { MintableERC20__factory } from '../../../types/factories/MintableERC20__factory';
import { MockStarkPerpetual__factory } from '../../../types/factories/MockStarkPerpetual__factory';
import { IERC20 } from '../../../types/IERC20';
import { IStarkPerpetual } from '../../../types/IStarkPerpetual';
import { MintableERC20 } from '../../../types/MintableERC20';
import { MockStarkPerpetual } from '../../../types/MockStarkPerpetual';
import config from '../../config';
import { getDeployerSigner } from '../../deploy-config/get-deployer-address';
import { MAX_UINT_AMOUNT, USDC_TOKEN_DECIMALS } from '../../lib/constants';
import { log } from '../../lib/logging';
import { waitForTx } from '../../lib/util';

export async function deployMocks() {
  log('Beginning deployment of mock contracts.\n');
  if (!config.isHardhat() || config.FORK_MAINNET) {
    throw new Error('Can only deploy mock contracts on Hardhat network.');
  }

  const deployer = await getDeployerSigner();
  const deployerAddress = deployer.address;
  log(`Beginning deployment of mock contracts with deployer ${deployerAddress}.\n`);

  const mockDydxCollateralToken: MintableERC20 = await new MintableERC20__factory(deployer)
    .deploy(
      'Mock DYDX Collateral Token',
      'MOCK_USDC',
      USDC_TOKEN_DECIMALS,
    );

  const mockStarkPerpetual: MockStarkPerpetual = await new MockStarkPerpetual__factory(deployer)
    .deploy(mockDydxCollateralToken.address);

  await waitForTx(await mockDydxCollateralToken.mint(deployerAddress, MAX_UINT_AMOUNT));

  log(`Minting max USDC to ${deployerAddress}.\n`);

  log('\n=== MOCK CONTRACT DEPLOYMENT COMPLETE ===\n');

  return {
    dydxCollateralToken: mockDydxCollateralToken as IERC20,
    starkPerpetual: mockStarkPerpetual as unknown as IStarkPerpetual,
  };
}
