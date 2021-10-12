import { ethers, providers } from 'ethers';

import ERC20Service from './services/ERC20';
import {
  ChainId,
  Configuration,
  DefaultProviderKeys,
  Network,
} from './types';

export default class BaseTxBuilder {
  readonly configuration: Configuration;

  public erc20Service: ERC20Service;

  constructor(
    network: Network = Network.ropsten,
    injectedProvider?:
    | providers.ExternalProvider
    | providers.Web3Provider
    | providers.JsonRpcProvider
    | string
    | undefined,
    defaultProviderKeys?: DefaultProviderKeys,
    ipfsTimeoutMs?: number,
  ) {
    let provider:
    | providers.JsonRpcProvider
    | providers.BaseProvider
    | providers.Web3Provider;

    // TODO: this is probably not enough as we use network down the road
    const chainId = ChainId[network];

    if (!injectedProvider) {
      if (defaultProviderKeys && Object.keys(defaultProviderKeys).length > 1) {
        provider = ethers.getDefaultProvider(network, defaultProviderKeys);
      } else {
        provider = ethers.getDefaultProvider(network);
        console.log(
          `These API keys are a provided as a community resource by the backend services for low-traffic projects and for early prototyping.
          It is highly recommended to use own keys: https://docs.ethers.io/v5/api-keys/`,
        );
      }
    } else if (typeof injectedProvider === 'string') {
      provider = new providers.JsonRpcProvider(injectedProvider, chainId);
    } else if (injectedProvider instanceof providers.Web3Provider || injectedProvider instanceof providers.JsonRpcProvider) {
      provider = injectedProvider;
    } else {
      provider = new providers.Web3Provider(injectedProvider, chainId);
    }

    this.configuration = { network, provider, ipfsTimeoutMs };

    this.erc20Service = new ERC20Service(this.configuration);
  }
}
