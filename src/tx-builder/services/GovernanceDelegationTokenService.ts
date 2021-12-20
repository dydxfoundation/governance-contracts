import { splitSignature } from 'ethers/lib/utils';

import { DydxToken__factory } from '../../../types';
import { DydxToken } from '../../../types/DydxToken';
import {
  ChainId,
  Configuration,
  eEthereumTxType,
  EthereumTransactionTypeExtended,
  tEthereumAddress,
  transactionType,
  tStringDecimalUnits,
  DelegationType,
  GovTokenDelegatees,
} from '../types';
import {
  GovDelegate,
  GovDelegateBySig,
  GovDelegateByType,
  GovDelegateByTypeBySig,
  GovGetDelegateeByType,
  GovGetNonce,
  GovGetPowerAtBlock,
  GovGetPowerCurrent,
  GovPrepareDelegateSig,
  GovPrepareDelegateSigByType,
} from '../types/GovDelegationMethodTypes';
import { canBeEnsAddress } from '../utils/parsings';
import { GovDelegationValidator } from '../validators/methodValidators';
import {
  Is0OrPositiveAmount,
  IsEthAddress,
  IsEthAddressOrENS,
  IsPositiveAmount,
} from '../validators/paramValidators';
import BaseService from './BaseService';

export default class GovernanceDelegationTokenService extends BaseService<DydxToken> {
  constructor(config: Configuration) {
    super(config, DydxToken__factory);
  }

  @GovDelegationValidator
  public async delegate(
    @IsEthAddress('user')
    @IsEthAddressOrENS('delegatee')
    @IsEthAddress('governanceToken')
      { user, delegatee, governanceToken }: GovDelegate,
  ): Promise<EthereumTransactionTypeExtended[]> {
    const txs: EthereumTransactionTypeExtended[] = [];
    const governanceDelegationToken: DydxToken = this.getContractInstance(
      governanceToken,
    );

    const delegateeAddress: string = await this.getDelegateeAddress(delegatee);

    const txCallback: () => Promise<transactionType> = this.generateTxCallback({
      rawTxMethod: () =>
        governanceDelegationToken.populateTransaction.delegate(
          delegateeAddress,
        ),
      from: user,
    });

    txs.push({
      tx: txCallback,
      txType: eEthereumTxType.GOV_DELEGATION_ACTION,
      gas: this.generateTxPriceEstimation(txs, txCallback),
    });

    return txs;
  }

  @GovDelegationValidator
  public async delegateByType(
    @IsEthAddress('user')
    @IsEthAddressOrENS('delegatee')
    @IsEthAddress('governanceToken')
      { user, delegatee, delegationType, governanceToken }: GovDelegateByType,
  ): Promise<EthereumTransactionTypeExtended[]> {
    const txs: EthereumTransactionTypeExtended[] = [];
    const governanceDelegationToken: DydxToken = this.getContractInstance(
      governanceToken,
    );

    const delegateeAddress: string = await this.getDelegateeAddress(delegatee);

    const txCallback: () => Promise<transactionType> = this.generateTxCallback({
      rawTxMethod: () =>
        governanceDelegationToken.populateTransaction.delegateByType(
          delegateeAddress,
          delegationType.valueOf(),
        ),
      from: user,
    });

    txs.push({
      tx: txCallback,
      txType: eEthereumTxType.GOV_DELEGATION_ACTION,
      gas: this.generateTxPriceEstimation(txs, txCallback),
    });

    return txs;
  }

  @GovDelegationValidator
  public async delegateBySig(
    @IsEthAddress('user')
    @IsEthAddressOrENS('delegatee')
    @IsEthAddress('governanceToken')
      { user, delegatee, expiry, signature, governanceToken }: GovDelegateBySig,
  ): Promise<EthereumTransactionTypeExtended[]> {
    const txs: EthereumTransactionTypeExtended[] = [];
    const governanceDelegationToken: DydxToken = this.getContractInstance(
      governanceToken,
    );
    const nonce = await this.getNonce({ user, governanceToken });
    const { v, r, s } = splitSignature(signature);

    const delegateeAddress: string = await this.getDelegateeAddress(delegatee);

    const txCallback: () => Promise<transactionType> = this.generateTxCallback({
      rawTxMethod: () =>
        governanceDelegationToken.populateTransaction.delegateBySig(
          delegateeAddress,
          nonce,
          expiry,
          v,
          r,
          s,
        ),
      from: user,
    });

    txs.push({
      tx: txCallback,
      txType: eEthereumTxType.GOV_DELEGATION_ACTION,
      gas: this.generateTxPriceEstimation(txs, txCallback),
    });

    return txs;
  }

  @GovDelegationValidator
  public async delegateByTypeBySig(
    @IsEthAddress('user')
    @IsEthAddressOrENS('delegatee')
    @IsEthAddress('governanceToken')
      {
        user,
        delegatee,
        delegationType,
        expiry,
        signature,
        governanceToken,
      }: GovDelegateByTypeBySig,
  ): Promise<EthereumTransactionTypeExtended[]> {
    const txs: EthereumTransactionTypeExtended[] = [];
    const governanceDelegationToken: DydxToken = this.getContractInstance(
      governanceToken,
    );
    const nonce = await this.getNonce({ user, governanceToken });
    const { v, r, s } = splitSignature(signature);

    const delegateeAddress: string = await this.getDelegateeAddress(delegatee);

    const txCallback: () => Promise<transactionType> = this.generateTxCallback({
      rawTxMethod: () =>
        governanceDelegationToken.populateTransaction.delegateByTypeBySig(
          delegateeAddress,
          delegationType,
          nonce,
          expiry,
          v,
          r,
          s,
        ),
      from: user,
    });

    txs.push({
      tx: txCallback,
      txType: eEthereumTxType.GOV_DELEGATION_ACTION,
      gas: this.generateTxPriceEstimation(txs, txCallback),
    });

    return txs;
  }

  @GovDelegationValidator
  public async prepareDelegateSignature(
    @IsEthAddressOrENS('delegatee')
    @IsEthAddress('governanceToken')
    @Is0OrPositiveAmount('nonce')
      {
        delegatee,
        nonce,
        expiry,
        governanceTokenName,
        governanceToken,
      }: GovPrepareDelegateSig,
  ): Promise<string> {
    const delegateeAddress: string = await this.getDelegateeAddress(delegatee);

    const typeData = {
      types: {
        EIP712Domain: [
          { name: 'name', type: 'string' },
          { name: 'chainId', type: 'uint256' },
          { name: 'verifyingContract', type: 'address' },
        ],
        Delegate: [
          { name: 'delegatee', type: 'address' },
          { name: 'nonce', type: 'uint256' },
          { name: 'expiry', type: 'uint256' },
        ],
      },
      primaryType: 'Delegate' as const,
      domain: {
        name: governanceTokenName,
        chainId: ChainId[this.config.network],
        verifyingContract: governanceToken,
      },
      message: {
        delegatee: delegateeAddress,
        nonce,
        expiry,
      },
    };

    return JSON.stringify(typeData);
  }

  @GovDelegationValidator
  public async prepareDelegateByTypeSignature(
    @IsEthAddressOrENS('delegatee')
    @IsEthAddress('governanceToken')
    @Is0OrPositiveAmount('nonce')
      {
        delegatee,
        type,
        nonce,
        expiry,
        governanceTokenName,
        governanceToken,
      }: GovPrepareDelegateSigByType,
  ): Promise<string> {
    const delegateeAddress: string = await this.getDelegateeAddress(delegatee);

    const typeData = {
      types: {
        EIP712Domain: [
          { name: 'name', type: 'string' },
          { name: 'chainId', type: 'uint256' },
          { name: 'verifyingContract', type: 'address' },
        ],
        DelegateByType: [
          { name: 'delegatee', type: 'address' },
          { name: 'type', type: 'uint256' },
          { name: 'nonce', type: 'uint256' },
          { name: 'expiry', type: 'uint256' },
        ],
      },
      primaryType: 'DelegateByType' as const,
      domain: {
        name: governanceTokenName,
        chainId: ChainId[this.config.network],
        verifyingContract: governanceToken,
      },
      message: {
        delegatee: delegateeAddress,
        type,
        nonce,
        expiry,
      },
    };

    return JSON.stringify(typeData);
  }

  @GovDelegationValidator
  public async getDelegateeByType(
    @IsEthAddress('delegator')
    @IsEthAddress('governanceToken')
      { delegator, delegationType, governanceToken }: GovGetDelegateeByType,
  ): Promise<tEthereumAddress> {
    const governanceDelegationToken: DydxToken = this.getContractInstance(
      governanceToken,
    );
    return governanceDelegationToken.getDelegateeByType(
      delegator,
      delegationType,
    );
  }

  @GovDelegationValidator
  public async getDelegatees(
    delegator: tEthereumAddress,
    governanceToken: tEthereumAddress,
  ): Promise<GovTokenDelegatees> {
    const [
      propositionDelegatee,
      votingDelegatee,
    ] : [
      tEthereumAddress,
      tEthereumAddress,
    ] = await Promise.all([
      this.getDelegateeByType({
        delegator,
        delegationType: DelegationType.PROPOSITION_POWER,
        governanceToken,
      }),
      this.getDelegateeByType({
        delegator,
        delegationType: DelegationType.VOTING_POWER,
        governanceToken,
      }),
    ]);

    return {
      PROPOSITION_DELEGATEE: propositionDelegatee,
      VOTING_DELEGATEE: votingDelegatee,
    };
  }

  @GovDelegationValidator
  public async getPowerCurrent(
    @IsEthAddress('user')
    @IsEthAddress('governanceToken')
      { user, delegationType, governanceToken }: GovGetPowerCurrent,
  ): Promise<tStringDecimalUnits> {
    const governanceDelegationToken: DydxToken = this.getContractInstance(
      governanceToken,
    );
    return (
      await governanceDelegationToken.getPowerCurrent(user, delegationType)
    ).toString();
  }

  @GovDelegationValidator
  public async getPowerAtBlock(
    @IsEthAddress('user')
    @IsEthAddress('governanceToken')
    @IsPositiveAmount('blockNumber')
      { user, blockNumber, delegationType, governanceToken }: GovGetPowerAtBlock,
  ): Promise<tStringDecimalUnits> {
    const governanceDelegationToken: DydxToken = this.getContractInstance(
      governanceToken,
    );
    return (
      await governanceDelegationToken.getPowerAtBlock(
        user,
        blockNumber,
        delegationType,
      )
    ).toString();
  }

  @GovDelegationValidator
  public async getNonce(
    @IsEthAddress('user')
    @IsEthAddress('governanceToken')
      { user, governanceToken }: GovGetNonce,
  ): Promise<tStringDecimalUnits> {
    const governanceDelegationToken: DydxToken = this.getContractInstance(
      governanceToken,
    );
    // eslint-disable-next-line no-underscore-dangle
    return (await governanceDelegationToken.nonces(user)).toString();
  }

  private async getDelegateeAddress(delegatee: string): Promise<string> {
    if (canBeEnsAddress(delegatee)) {
      const delegateeAddress = await this.config.provider.resolveName(
        delegatee,
      );
      if (!delegateeAddress)
        throw new Error(`Address ${delegatee} is not a valid ENS address`);

      return delegateeAddress;
    }

    return delegatee;
  }
}
