import { task } from 'hardhat/config';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

import { eContractid, eEthereumNetwork } from '../../helpers/types';
import { checkVerification } from '../../helpers/etherscan-verification';
import { getDydxAdminPerNetwork } from '../../helpers/constants';

task('common-deployment', 'Deployment in for Main, Kovan and Ropsten networks')
  .addFlag('verify', 'Verify StakedDydxToken and InitializableAdminUpgradeabilityProxy contract.')
  .addOptionalParam(
    'vaultAddress',
    'Use IncentivesVault address by param instead of configuration.'
  )
  .addOptionalParam('dydxTokenAddress', 'Use DydxToken address by param instead of configuration.')
  .setAction(async ({ verify, vaultAddress, dydxTokenAddress }, localBRE) => {
    const DRE: HardhatRuntimeEnvironment = await localBRE.run('set-dre');
    const network = DRE.network.name as eEthereumNetwork;
    const dydxAdmin = getDydxAdminPerNetwork(network);

    if (!dydxAdmin) {
      throw Error(
        'The --admin parameter must be set. Set an Ethereum address as --admin parameter input.'
      );
    }

    // If Etherscan verification is enabled, check needed enviroments to prevent loss of gas in failed deployments.
    if (verify) {
      checkVerification();
    }

    await DRE.run(`deploy-${eContractid.StakedDydxToken}`, {
      verify,
      vaultAddress,
      dydxTokenAddress,
    });

    await DRE.run(`initialize-${eContractid.StakedDydxToken}`, {
      admin: dydxAdmin,
    });

    console.log(`\n✔️ Finished the deployment of the DYDX Token ${network} Enviroment. ✔️`);
  });
