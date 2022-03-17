import { types } from 'hardhat/config';

import mainnetAddresses from '../../src/deployed-addresses/mainnet.json';
import { hardhatTask } from '../../src/hre';
import { log } from '../../src/lib/logging';
import { deployStarkProxyV3 } from '../../src/migrations/deploy-stark-proxy-v3';

hardhatTask('deploy:stark-proxy-v3', 'Deploy the StarkProxyV2 contracts.')
  .addParam('liquidityStakingAddress', 'Previously deployed liquidity staking address', mainnetAddresses.liquidityStaking, types.string)
  .addParam('merkleDistributorAddress', 'Previously deployed merkle distributor address', mainnetAddresses.merkleDistributor, types.string)
  .addParam('starkPerpetualAddress', 'Address of DYDX stark perpetual', mainnetAddresses.starkPerpetual, types.string)
  .addParam('dydxCollateralTokenAddress', 'Address of collateral token for DYDX stark perpetual', mainnetAddresses.dydxCollateralToken, types.string)
  .addOptionalParam('ownerRoleAddress', 'Address to give owner role to', undefined, types.string)
  .setAction(async (args: {
    liquidityStakingAddress: string,
    merkleDistributorAddress: string,
    starkPerpetualAddress: string,
    dydxCollateralTokenAddress: string,
    ownerRoleAddress?: string,
  }) => {
    const { starkProxyV1WithV3Impl } = await deployStarkProxyV3(args);
    log(`New StarkProxyV3 implementation deployed to ${starkProxyV1WithV3Impl.address}.`);
  });
