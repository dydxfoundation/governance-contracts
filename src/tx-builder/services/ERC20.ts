import { BigNumber } from 'ethers';
import { formatUnits } from 'ethers/lib/utils';

import { Erc20 as IERC20Detailed } from '../../../types/Erc20';
import { Erc20Factory as IERC20Detailed__factory } from '../../../types/Erc20Factory';
import {
  Configuration,
  eEthereumTxType,
  EthereumTransactionTypeExtended,
  tEthereumAddress,
  transactionType,
  tStringDecimalUnits,
  TokenMetadataType,
} from '../types';
import BaseService from './BaseService';

export default class ERC20Service extends BaseService<IERC20Detailed> {
  readonly tokenDecimals: { [address: string]: number };

  constructor(config: Configuration) {
    super(config, IERC20Detailed__factory);
    this.tokenDecimals = {};
  }

  public approve = (
    token: tEthereumAddress,
    user: tEthereumAddress,
    spender: tEthereumAddress,
    amount: tStringDecimalUnits,
  ): EthereumTransactionTypeExtended => {
    const erc20Contract = this.getContractInstance(token);

    const txCallback: () => Promise<transactionType> = this.generateTxCallback({
      rawTxMethod: () =>
        erc20Contract.populateTransaction.approve(spender, amount),
      from: user,
    });

    return {
      tx: txCallback,
      txType: eEthereumTxType.ERC20_APPROVAL,
      gas: this.generateTxPriceEstimation([], txCallback),
    };
  };

  public allowance = async (
    token: tEthereumAddress,
    userAddress: tEthereumAddress,
    spender: tEthereumAddress,
  ): Promise<tStringDecimalUnits> => {
    const erc20Contract: IERC20Detailed = this.getContractInstance(token);
    const [
      tokenApprovalAmount,
      tokenDecimals,
    ]: [
      BigNumber,
      number,
    ] = await Promise.all([
      erc20Contract.allowance(userAddress, spender),
      this.decimalsOf(token),
    ]);
    return formatUnits(tokenApprovalAmount, tokenDecimals);
  };

  public decimalsOf = async (token: tEthereumAddress): Promise<number> => {
    if (!this.tokenDecimals[token]) {
      const erc20Contract = this.getContractInstance(token);
      this.tokenDecimals[token] = await erc20Contract.decimals();
    }

    return this.tokenDecimals[token];
  };

  public getTokenData = async (
    token: tEthereumAddress,
  ): Promise<TokenMetadataType> => {
    const {
      name: nameGetter,
      symbol: symbolGetter,
      decimals: decimalsGetter,
    }: IERC20Detailed = this.getContractInstance(token);

    const [name, symbol, decimals]: [
      string,
      string,
      number,
    ] = await Promise.all([nameGetter(), symbolGetter(), decimalsGetter()]);

    return {
      name,
      symbol,
      decimals,
      address: token,
    };
  };

  public balanceOf = async (
    token: tEthereumAddress,
    user: tEthereumAddress,
  ): Promise<tStringDecimalUnits> => {
    const erc20Contract: IERC20Detailed = this.getContractInstance(token);
    const [
      tokenBalance,
      tokenDecimals,
    ]: [
      BigNumber,
      number,
    ] = await Promise.all([
      erc20Contract.balanceOf(user),
      this.decimalsOf(token),
    ]);
    return formatUnits(tokenBalance, tokenDecimals.toString());
  };

  public totalSupply = async (
    token: tEthereumAddress,
  ): Promise<tStringDecimalUnits> => {
    const erc20Contract: IERC20Detailed = this.getContractInstance(token);
    const [
      tokenTotalSupply,
      tokenDecimals,
    ]: [
      BigNumber,
      number,
    ] = await Promise.all([
      erc20Contract.totalSupply(),
      this.decimalsOf(token),
    ]);
    return formatUnits(tokenTotalSupply, tokenDecimals.toString());
  };
}
