pragma solidity 0.7.5;
pragma experimental ABIEncoderV2;

import {Math} from '../../../lib/Math.sol';
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
   *
   * @return The blackout window duration, in seconds.
   */
  function getBlackoutWindow() external view returns (uint256) {
    return _BLACKOUT_WINDOW_;
  }

  /**
   * @notice Get the domain separator used for EIP-712 signatures.
   *
   * @return The EIP-712 domain separator.
   */
  function getDomainSeparator() external view returns (bytes32) {
    return _DOMAIN_SEPARATOR_;
  }

  /**
   * @notice The value of one underlying token, in the units used for staked balances, denominated
   *  as a mutiple of EXCHANGE_RATE_BASE for additional precision.
   *
   *  To convert from an underlying amount to a staked amount, multiply by the exchange rate.
   *
   * @return The exchange rate.
   */
  function getExchangeRate() external view returns (uint256) {
    return _EXCHANGE_RATE_;
  }

  /**
   * @notice Get an exchange rate snapshot.
   *
   * @param  index  The index number of the exchange rate snapshot.
   *
   * @return The snapshot struct with `blockNumber` and `value` fields.
   */
  function getExchangeRateSnapshot(uint256 index) external view returns (SM1Types.Snapshot memory) {
    return _EXCHANGE_RATE_SNAPSHOTS_[index];
  }

  /**
   * @notice Get the number of exchange rate snapshots.
   *
   * @return The number of snapshots that have been taken of the exchange rate.
   */
  function getExchangeRateSnapshotCount() external view returns (uint256) {
    return _EXCHANGE_RATE_SNAPSHOT_COUNT_;
  }
}
