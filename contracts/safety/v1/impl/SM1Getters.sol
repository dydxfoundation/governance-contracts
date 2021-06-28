pragma solidity 0.7.5;
pragma experimental ABIEncoderV2;

import {Math} from '../../../utils/Math.sol';
import {SafeMath} from '../../../dependencies/open-zeppelin/SafeMath.sol';
import {SM1Types} from '../lib/SM1Types.sol';
import {SM1Storage} from './SM1Storage.sol';

/**
 * @title SM1Getters
 * @author dYdX
 *
 * @dev Some external getter functions.
 */
abstract contract SM1Getters is SM1Storage {
  using SafeMath for uint256;

  // ============ External Functions ============

  /**
   * @notice The parameters specifying the function from timestamp to epoch number.
   *
   * @return The parameters struct with `interval` and `offset` fields.
   */
  function getEpochParameters() external view returns (SM1Types.EpochParameters memory) {
    return _EPOCH_PARAMETERS_;
  }

  /**
   * @notice The period of time at the end of each epoch in which withdrawals cannot be requested.
   */
  function getBlackoutWindow() external view returns (uint256) {
    return _BLACKOUT_WINDOW_;
  }
}
