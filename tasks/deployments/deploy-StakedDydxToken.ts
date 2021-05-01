import { task } from 'hardhat/config';

import { eContractid, eEthereumNetwork } from '../../helpers/types';
import { registerContractInJsonDb } from '../../helpers/contracts-helpers';
import {
  getDydxTokenPerNetwork,
  getCooldownSecondsPerNetwork,
  getUnstakeWindowPerNetwork,
  getDydxAdminPerNetwork,
  getDistributionDurationPerNetwork,
  getDydxIncentivesVaultPerNetwork,
} from '../../helpers/constants';
import {
  deployStakedDydxToken,
  deployInitializableAdminUpgradeabilityProxy,
} from '../../helpers/contracts-accessors';
import { checkVerification } from '../../helpers/etherscan-verification';

const { StakedDydxToken, StakedDydxTokenImpl } = eContractid;

task(`deploy-${StakedDydxToken}`, `Deploys the ${StakedDydxToken} contract`)
  .addFlag('verify', 'Verify StakedDydxToken contract via Etherscan API.')
  .addOptionalParam(
    'vaultAddress',
    'Use IncentivesVault address by param instead of configuration.'
  )
  .addOptionalParam('dydxTokenAddress', 'Use DydxToken address by param instead of configuration.')
  .setAction(async ({ verify, vaultAddress, dydxTokenAddress }, localBRE) => {
    await localBRE.run('set-dre');

    // If Etherscan verification is enabled, check needed enviroments to prevent loss of gas in failed deployments.
    if (verify) {
      checkVerification();
    }

    if (!localBRE.network.config.chainId) {
      throw new Error('INVALID_CHAIN_ID');
    }

    const network = localBRE.network.name as eEthereumNetwork;

    console.log(`\n- ${StakedDydxToken} deployment`);

    console.log(`\tDeploying ${StakedDydxToken} implementation ...`);
    const stakedDydxTokenImpl = await deployStakedDydxToken(
      [
        dydxTokenAddress || getDydxTokenPerNetwork(network),
        dydxTokenAddress || getDydxTokenPerNetwork(network),
        getCooldownSecondsPerNetwork(network),
        getUnstakeWindowPerNetwork(network),
        vaultAddress || getDydxIncentivesVaultPerNetwork(network),
        getDydxAdminPerNetwork(network),
        getDistributionDurationPerNetwork(network),
      ],
      false // disable verify due not supported by current buidler etherscan plugin
    );
    await stakedDydxTokenImpl.deployTransaction.wait();
    await registerContractInJsonDb(StakedDydxTokenImpl, stakedDydxTokenImpl);

    console.log(`\tDeploying ${StakedDydxToken} Transparent Proxy ...`);
    const stakedDydxTokenProxy = await deployInitializableAdminUpgradeabilityProxy(verify);
    await registerContractInJsonDb(StakedDydxToken, stakedDydxTokenProxy);

    console.log(`\tFinished ${StakedDydxToken} proxy and implementation deployment`);
  });
