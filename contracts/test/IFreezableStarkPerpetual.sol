// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.7.5;
pragma abicoder v2;

import { IStarkPerpetual } from '../interfaces/IStarkPerpetual.sol';

/**
 * @title IFreezableStarkPerpetual
 * @author dYdX
 *
 * @notice Partial interface for the StarkPerpetual contract, for accessing the dYdX L2 exchange.
 * Also includes freeze functionality.
 * @dev See https://github.com/starkware-libs/starkex-contracts
 */
interface IFreezableStarkPerpetual is IStarkPerpetual {
  event LogFrozen();

  function freezeRequest(
    uint256 starkKey,
    uint256 vaultId,
    uint256 quantizedAmount
  ) external;
}
