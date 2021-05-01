import { task } from 'hardhat/config';
import { eContractid } from '../../helpers/types';
import { waitForTx } from '../../helpers/misc-utils';
import {
  ZERO_ADDRESS,
  STAKED_DYDX_NAME,
  STAKED_DYDX_SYMBOL,
  STAKED_DYDX_DECIMALS,
} from '../../helpers/constants';
import { getStakedDydxTokenImpl, getStakedDydxTokenProxy } from '../../helpers/contracts-accessors';

const { StakedDydxToken } = eContractid;

task(`initialize-${StakedDydxToken}`, `Initialize the ${StakedDydxToken} proxy contract`)
  .addParam(
    'admin',
    `The address to be added as an Admin role in ${StakedDydxToken} Transparent Proxy.`
  )
  .setAction(async ({ admin: dydxAdmin }, localBRE) => {
    await localBRE.run('set-dre');

    if (!dydxAdmin) {
      throw new Error(
        `Missing --admin parameter to add the Admin Role to ${StakedDydxToken} Transparent Proxy`
      );
    }

    if (!localBRE.network.config.chainId) {
      throw new Error('INVALID_CHAIN_ID');
    }

    console.log(`\n- ${StakedDydxToken} initialization`);

    const stakedDydxTokenImpl = await getStakedDydxTokenImpl();
    const stakedDydxTokenProxy = await getStakedDydxTokenProxy();

    console.log('\tInitializing StakedDydxToken');

    const encodedInitializeStakedDydxToken = stakedDydxTokenImpl.interface.encodeFunctionData(
      'initialize',
      [
        // ZERO_ADDRESS,
        STAKED_DYDX_NAME,
        STAKED_DYDX_SYMBOL,
        STAKED_DYDX_DECIMALS,
      ]
    );

    await waitForTx(
      await stakedDydxTokenProxy.functions['initialize(address,address,bytes)'](
        stakedDydxTokenImpl.address,
        dydxAdmin,
        encodedInitializeStakedDydxToken
      )
    );

    console.log('\tFinished DYDX Token and Transparent Proxy initialization');
  });
