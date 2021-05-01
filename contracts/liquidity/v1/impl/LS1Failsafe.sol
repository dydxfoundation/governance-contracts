pragma solidity 0.7.5;
pragma experimental ABIEncoderV2;

import {IERC20} from '../../../interfaces/IERC20.sol';
import {SafeCast} from '../../../lib/SafeCast.sol';
import {SafeMath} from '../../../lib/SafeMath.sol';
import {LS1Types} from '../lib/LS1Types.sol';
import {LS1StakedBalances} from './LS1StakedBalances.sol';

/**
 * @title LS1Failsafe
 * @author dYdX
 *
 * @dev Functions for recovering from very unlikely edge cases.
 */
abstract contract LS1Failsafe is LS1StakedBalances {
  using SafeCast for uint256;
  using SafeMath for uint256;

  /**
   * @notice Settle the sender's inactive balance up to the specified epoch. This allows the
   *  balance to be settled while putting an upper bound on the gas expenditure per function call.
   *  This is unlikely to be needed in practice.
   *
   * @param  maxEpoch  The epoch to settle the sender's inactive balance up to.
   */
  function failsafeSettleUserInactiveBalanceToEpoch(uint256 maxEpoch) external nonReentrant {
    address staker = msg.sender;
    _failsafeSettleUserInactiveBalance(staker, maxEpoch);
  }

  /**
   * @notice Sets the sender's inactive balance to zero. This allows for recovery from a situation
   *  where the gas cost to settle the balance is higher than the value of the balance itself.
   *  We provide this function as an alternative to settlement, since the gas cost for settling an
   *  inactive balance is unbounded (except in that it may grow at most linearly with the number of
   *  epochs that have passed).
   */
  function failsafeDeleteMyInactiveBalance() external nonReentrant {
    address staker = msg.sender;
    _failsafeDeleteUserInactiveBalance(staker);
  }
}
