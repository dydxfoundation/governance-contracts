// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.7.5;
pragma abicoder v2;

import { IERC20 } from '../../interfaces/IERC20.sol';
import { ILiquidityStakingV1 } from '../../interfaces/ILiquidityStakingV1.sol';
import { IMerkleDistributorV1 } from '../../interfaces/IMerkleDistributorV1.sol';
import { IStarkPerpetual } from '../../interfaces/IStarkPerpetual.sol';
import { SafeERC20 } from '../../dependencies/open-zeppelin/SafeERC20.sol';
import { SP2Withdrawals } from './impl/SP2Withdrawals.sol';
import { SP1Getters } from '../v1/impl/SP1Getters.sol';
import { SP2Guardian } from './impl/SP2Guardian.sol';
import { SP2Owner } from './impl/SP2Owner.sol';

/**
 * @title StarkProxyV2
 * @author dYdX
 *
 * @notice Proxy contract allowing a LiquidityStaking borrower to use borrowed funds (as well as
 *  their own funds, if desired) on the dYdX L2 exchange. Restrictions are put in place to
 *  prevent borrowed funds being used outside the exchange. Furthermore, a guardian address is
 *  specified which has the ability to restrict borrows and make repayments.
 *
 *  Owner actions may be delegated to various roles as defined in SP1Roles. Other actions are
 *  available to guardian roles, to be nominated by dYdX governance.
 */
contract StarkProxyV2 is
  SP2Guardian,
  SP2Owner,
  SP2Withdrawals,
  SP1Getters
{
  using SafeERC20 for IERC20;

  // ============ Constructor ============

  constructor(
    ILiquidityStakingV1 liquidityStaking,
    IStarkPerpetual starkPerpetual,
    IERC20 token,
    IMerkleDistributorV1 merkleDistributor
  )
    SP2Guardian(liquidityStaking, starkPerpetual, token)
    SP2Withdrawals(merkleDistributor)
  {}

  // ============ External Functions ============

  function initialize()
    external
    initializer
  {}

  // ============ Internal Functions ============

  /**
   * @dev Returns the revision of the implementation contract.
   *
   * @return The revision number.
   */
  function getRevision()
    internal
    pure
    override
    returns (uint256)
  {
    return 2;
  }
}
