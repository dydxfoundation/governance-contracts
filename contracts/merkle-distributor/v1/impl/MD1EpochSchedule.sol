pragma solidity 0.7.5;
pragma experimental ABIEncoderV2;

import {SafeMath} from '../../../dependencies/open-zeppelin/SafeMath.sol';
import {MD1Types} from '../lib/MD1Types.sol';
import {SafeCast} from '../lib/SafeCast.sol';
import {MD1Storage} from './MD1Storage.sol';

/**
 * @title MD1EpochSchedule
 * @author dYdX
 *
 * @dev Defines a function from block timestamp to epoch number. Note that the epoch number is made
 *  available externally but is not used internally.
 *
 *  The formula used is `n = floor((t - b) / a)` where:
 *    - `n` is the epoch number
 *    - `t` is the timestamp (in seconds)
 *    - `b` is a non-negative offset, indicating the start of epoch zero (in seconds)
 *    - `a` is the length of an epoch, a.k.a. the interval (in seconds)
 */
abstract contract MD1EpochSchedule is MD1Storage {
  using SafeCast for uint256;
  using SafeMath for uint256;

  // ============ Events ============

  event EpochParametersChanged(MD1Types.EpochParameters epochParameters);

  // ============ Initializer ============

  function __MD1EpochSchedule_init(
    uint256 interval,
    uint256 offset
  ) internal {
    _setEpochParameters(interval, offset);
  }

  // ============ External Functions ============

  /**
   * @notice Get the epoch at the current block timestamp. Reverts if epoch zero has not started.
   *
   * @return The current epoch number.
   */
  function getCurrentEpoch() external view returns (uint256) {
    MD1Types.EpochParameters memory epochParameters = _EPOCH_PARAMETERS_;
    uint256 interval = uint256(epochParameters.interval);
    uint256 offset = uint256(epochParameters.offset);
    require(block.timestamp >= offset, 'MD1EpochSchedule: Epoch zero has not started');
    return block.timestamp.sub(offset).div(interval);
  }

  // ============ Internal Functions ============

  function _setEpochParameters(uint256 interval, uint256 offset) internal {
    require(interval != 0, 'MD1EpochSchedule: Interval cannot be zero');
    MD1Types.EpochParameters memory epochParameters =
      MD1Types.EpochParameters({interval: interval.toUint128(), offset: offset.toUint128()});
    _EPOCH_PARAMETERS_ = epochParameters;
    emit EpochParametersChanged(epochParameters);
  }
}
