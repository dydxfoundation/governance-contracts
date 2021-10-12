/* eslint-disable prefer-rest-params */
/* eslint-disable @typescript-eslint/no-explicit-any */
import BaseService from '../services/BaseService';
import {
  amount0OrPositiveValidator,
  amountGtThan0Validator,
  isEthAddressOrEnsValidator,
  isEthAddressValidator,
  optionalValidator,
} from './validations';

export function StakingValidator(
  target: any,
  propertyName: string,
  descriptor: TypedPropertyDescriptor<any>,
): any {
  const method = descriptor.value;
  // eslint-disable-next-line no-param-reassign
  descriptor.value = function (this: BaseService<any>) {

    const isParamOptional = optionalValidator(target, propertyName, arguments);

    isEthAddressValidator(target, propertyName, arguments, isParamOptional);

    amountGtThan0Validator(target, propertyName, arguments, isParamOptional);

    return method?.apply(this, arguments);
  };
}

export function GovValidator(
  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
  target: any,
  propertyName: string,
  descriptor: TypedPropertyDescriptor<any>,
): any {
  const method = descriptor.value;
  // eslint-disable-next-line no-param-reassign
  descriptor.value = function (this: BaseService<any>) {
    isEthAddressValidator(target, propertyName, arguments);

    amount0OrPositiveValidator(target, propertyName, arguments);

    return method?.apply(this, arguments);
  };
}

export function GovDelegationValidator(
  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
  target: any,
  propertyName: string,
  descriptor: TypedPropertyDescriptor<any>,
): any {
  const method = descriptor.value;
  // eslint-disable-next-line no-param-reassign
  descriptor.value = function (this: BaseService<any>) {

    isEthAddressValidator(target, propertyName, arguments);
    isEthAddressOrEnsValidator(target, propertyName, arguments);
    amountGtThan0Validator(target, propertyName, arguments);
    amount0OrPositiveValidator(target, propertyName, arguments);

    return method?.apply(this, arguments);
  };
}
