import { types } from 'hardhat/config';

import mainnetAddresses from '../../src/deployed-addresses/mainnet.json';
import { hardhatTask } from '../../src/hre';
import { log } from '../../src/lib/logging';
import { deployStarkProxyV3 } from '../../src/migrations/deploy-stark-proxy-v3';

hardhatTask('deploy:stark-proxy-v3', 'Deploy StarkProxy with StarkProxyV3 implementation.')
  .addParam('dydxCollateralTokenAddress', 'Address of collateral token for DYDX stark perpetual', mainnetAddresses.dydxCollateralToken, types.string)
  .addParam('liquidityStakingAddress', 'Previously deployed liquidity staking address', mainnetAddresses.liquidityStaking, types.string)
  .addParam('merkleDistributorAddress', 'Previously deployed merkle distributor address', mainnetAddresses.merkleDistributor, types.string)
  .addParam('merkleTimelockAddress', 'Previously deployed merkle timelock address', mainnetAddresses.merklePauserTimelock, types.string)
  .addParam('shortTimelockAddress', 'Previously deployed short timelock address', mainnetAddresses.shortTimelock, types.string)
  .addParam('starkPerpetualAddress', 'Address of DYDX stark perpetual', mainnetAddresses.starkPerpetual, types.string)

  .addParam('borrowerAddress', 'Borrower to give roles to', undefined, types.string)
  .addOptionalParam('onlyDeployStarkProxyV3Impl', 'Only deploy a StarkProxyV3Impl contract (to upgrade exisiting contracts with', false, types.boolean)
  .setAction(async (args: {
    dydxCollateralTokenAddress: string,
    liquidityStakingAddress: string,
    merkleDistributorAddress: string,
    merkleTimelockAddress: string,
    shortTimelockAddress: string,
    starkPerpetualAddress: string,

    borrowerAddress: string,
    onlyDeployStarkProxyV3Impl?: boolean,
  }) => {
    const {
      starkProxyContract,
      starkProxyProxyAdmin,
      starkProxyV3Impl,
    } = await deployStarkProxyV3(args);
    log(`New StarkProxyV3 implementation deployed to ${starkProxyV3Impl.address}.`);
    if (starkProxyContract) {
      log(`New starkProxyContract deployed to ${starkProxyContract.address}.`);
    }
    if (starkProxyProxyAdmin) {
      log(`New starkProxyProxyAdmin deployed to ${starkProxyProxyAdmin.address}.`);
    }
  });
