import { BigNumber, Contract, PopulatedTransaction } from 'ethers';

import { DEFAULT_NULL_VALUE_ON_TX, gasLimitRecommendations } from '../config';
import { ContractsFactory } from '../interfaces/ContractsFactory';
import {
  Configuration,
  tEthereumAddress,
  TransactionGenerationMethod,
  transactionType,
  GasResponse,
  ProtocolAction,
  EthereumTransactionTypeExtended,
  eEthereumTxType,
} from '../types';
import { estimateGas, getGasPrice } from '../utils/gasStation';

export default abstract class BaseService<T extends Contract> {
  readonly contractInstances: { [address: string]: T };

  readonly contractFactory: ContractsFactory;

  readonly config: Configuration;

  constructor(config: Configuration, contractFactory: ContractsFactory) {
    this.config = config;
    this.contractFactory = contractFactory;
    this.contractInstances = {};
  }

  public getContractInstance = (address: tEthereumAddress): T => {
    if (!this.contractInstances[address]) {
      const { provider }: Configuration = this.config;
      this.contractInstances[address] = this.contractFactory.connect(
        address,
        provider,
      ) as T;
    }

    return this.contractInstances[address];
  };

  public timeLatest = async (): Promise<number> => {
    const { provider }: Configuration = this.config;
    const block = await provider.getBlock('latest');
    return block.timestamp;
  };

  readonly generateTxCallback = ({
    rawTxMethod,
    from,
    value,
    gasSurplus,
    action,
    gasLimit,
  }: TransactionGenerationMethod): (() => Promise<transactionType>) => async () => {
    const txRaw: PopulatedTransaction = await rawTxMethod();

    const tx: transactionType = {
      ...txRaw,
      gasLimit: txRaw.gasLimit?.toNumber(),
      gasPrice: txRaw.gasPrice?.toNumber(),
      from,
      value: value || DEFAULT_NULL_VALUE_ON_TX,
    };

    if (gasLimit) {
      tx.gasLimit = gasLimit;
    } else {
      tx.gasLimit = (await estimateGas(tx, this.config, gasSurplus)).toNumber();
    }

    if (
      action &&
      gasLimitRecommendations[action] &&
      BigNumber.from(tx.gasLimit).lte(gasLimitRecommendations[action].limit)
    ) {
      tx.gasLimit = parseInt(gasLimitRecommendations[action].recommended);
    }

    return tx;
  };

  readonly generateTxPriceEstimation = (
    txs: EthereumTransactionTypeExtended[],
    txCallback: () => Promise<transactionType>,
    action: string = ProtocolAction.default,
  ): GasResponse => async (force = false) => {
    try {
      const gasPrice = await getGasPrice(this.config);
      const hasPendingApprovals = txs.find(
        (tx) => tx.txType === eEthereumTxType.ERC20_APPROVAL,
      );
      if (!hasPendingApprovals || force) {
        const {
          gasLimit,
          gasPrice: gasPriceProv,
        }: transactionType = await txCallback();
        if (!gasLimit) {
          // If we don't recieve the correct gas we throw a error
          throw new Error('Transaction calculation error');
        }

        return {
          gasLimit: gasLimit.toString(),
          gasPrice: gasPriceProv
            ? gasPriceProv.toString()
            : gasPrice.toString(),
        };
      }
      return {
        gasLimit: gasLimitRecommendations[action].recommended,
        gasPrice: gasPrice.toString(),
      };
    } catch (error) {
      console.error(
        'Calculate error on calculate estimation gas price.',
        error,
      );
      return null;
    }
  };
}
