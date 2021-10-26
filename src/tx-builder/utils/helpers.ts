import { BigNumber } from 'ethers';

import { dydxTokenAddresses, DYDX_TOKEN_DECIMALS, stakingAddresses } from '../config';
import ERC20Service from '../services/ERC20';
import {
  Network,
  tSafetyModuleAddresses,
  tEthereumAddress,
  tTokenAddresses,
  GovernanceTokens,
} from '../types';
import { parseNumberToEthersBigNumber } from './parsings';

export async function filterZeroTokenBalances(
  user: tEthereumAddress,
  erc20Service: ERC20Service,
  tokens: tEthereumAddress[],
): Promise<tEthereumAddress[]> {
  const balances:
  { tokenBalance: BigNumber, token: tEthereumAddress }[] = await Promise.all(
    tokens.map(async (token: tEthereumAddress) => {
      const tokenBalance: BigNumber = parseNumberToEthersBigNumber(await erc20Service.balanceOf(token, user), DYDX_TOKEN_DECIMALS);
      return { tokenBalance, token };
    }));

  return balances
    .filter((balance) => !balance.tokenBalance.isZero())
    .map((balance) => balance.token);
}

export function getGovernanceTokens(
  network: Network,
  hardhatTokenAddresses: tTokenAddresses,
  hardhatSafetyModuleAddresses: tSafetyModuleAddresses,
): GovernanceTokens {
  if (network === Network.hardhat) {
    return {
      TOKEN: hardhatTokenAddresses.TOKEN_ADDRESS,
      STAKED_TOKEN: hardhatSafetyModuleAddresses.SAFETY_MODULE_ADDRESS,
    };
  }

  return {
    TOKEN: dydxTokenAddresses[network].TOKEN_ADDRESS,
    STAKED_TOKEN: stakingAddresses[network].SAFETY_MODULE_ADDRESS,
  };
}
