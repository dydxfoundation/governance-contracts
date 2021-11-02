import { types } from 'hardhat/config';

import mainnetAddresses from '../../src/deployed-addresses/mainnet.json';
import { hardhatTask } from '../../src/hre';
import { log } from '../../src/lib/logging';
import { deployStarkProxyV2 } from '../../src/migrations/deploy-stark-proxy-v2';

hardhatTask('deploy:stark-proxy-v2', 'Deploy the StarkProxyV2 contracts.')
  .addParam('liquidityStakingAddress', 'Previously deployed liquidity staking address', mainnetAddresses.liquidityStaking, types.string)
  .addParam('merkleDistributorAddress', 'Previously deployed merkle distributor address', mainnetAddresses.merkleDistributor, types.string)
  .addParam('numStarkProxiesToDeploy', 'Number of StarkProxyV2 contracts to deploy', 5, types.int)
  .setAction(async (args: {
    liquidityStakingAddress: string,
    merkleDistributorAddress: string,
    numStarkProxiesToDeploy: number,
  }) => {
    if (args.numStarkProxiesToDeploy <= 0) {
      throw new Error('Deploying 0 or less stark proxy implementations is not supported.');
    }
    const { starkProxyNewImpls } = await deployStarkProxyV2(args);
    log(`New StarkProxyV2 implementations deloyed to '["${starkProxyNewImpls.map((sp) => sp.address).join('","')}"]'`);
  });
