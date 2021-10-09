// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.7.5;
pragma abicoder v2;

import { SafeMath } from '../../../dependencies/open-zeppelin/SafeMath.sol';
import { SM1Snapshots } from './SM1Snapshots.sol';
import { SM1Storage } from './SM1Storage.sol';

/**
 * @title SM1ExchangeRate
 * @author dYdX
 *
 * @dev Performs math using the exchange rate, which converts between underlying units of the token
 *  that was staked (e.g. STAKED_TOKEN.balanceOf(account)), and staked units, used by this contract
 *  for all staked balances (e.g. this.balanceOf(account)).
 *
 *  OVERVIEW:
 *
 *   The exchange rate is stored as a multiple of EXCHANGE_RATE_BASE, and represents the number of
 *   staked balance units that each unit of underlying token is worth. Before any slashes have
 *   occurred, the exchange rate is equal to one. The exchange rate can increase with each slash,
 *   indicating that staked balances are becoming less and less valuable, per unit, relative to the
 *   underlying token.
 *
 *  AVOIDING OVERFLOW AND UNDERFLOW:
 *
 *   Staked balances are represented internally as uint240, so the result of an operation returning
 *   a staked balances must return a value less than 2^240. Intermediate values in calcuations are
 *   represented as uint256, so all operations within a calculation must return values under 2^256.
 *
 *   In the functions below operating on the exchange rate, we are strategic in our choice of the
 *   order of multiplication and division operations, in order to avoid both overflow and underflow.
 *
 *   We use the following assumptions and principles to implement this module:
 *     - (ASSUMPTION) An amount denoted in underlying token units is never greater than 10^28.
 *     - If the exchange rate is greater than 10^46, then we may perform division on the exchange
 *         rate before performing multiplication, provided that the denominator is not greater
 *         than 10^28 (to ensure a result with at least 18 decimals of precision). Specifically,
 *         we use EXCHANGE_RATE_MAY_OVERFLOW as the cutoff, which is a number greater than 10^46.
 *     - Since staked balances are stored as uint240, we cap the exchange rate to ensure that a
 *         staked balance can never overflow (using the assumption above).
 */
abstract contract SM1ExchangeRate is
  SM1Snapshots,
  SM1Storage
{
  using SafeMath for uint256;

  // ============ Constants ============

  /// @notice The assumed upper bound on the total supply of the staked token.
  uint256 public constant MAX_UNDERLYING_BALANCE = 1e28;

  /// @notice Base unit used to represent the exchange rate, for additional precision.
  uint256 public constant EXCHANGE_RATE_BASE = 1e18;

  /// @notice Cutoff where an exchange rate may overflow after multiplying by an underlying balance.
  /// @dev Approximately 1.2e49
  uint256 public constant EXCHANGE_RATE_MAY_OVERFLOW = (2 ** 256 - 1) / MAX_UNDERLYING_BALANCE;

  /// @notice Cutoff where a stake amount may overflow after multiplying by EXCHANGE_RATE_BASE.
  /// @dev Approximately 1.2e59
  uint256 public constant STAKE_AMOUNT_MAY_OVERFLOW = (2 ** 256 - 1) / EXCHANGE_RATE_BASE;

  /// @notice Max exchange rate.
  /// @dev Approximately 1.8e62
  uint256 public constant MAX_EXCHANGE_RATE = (
    ((2 ** 240 - 1) / MAX_UNDERLYING_BALANCE) * EXCHANGE_RATE_BASE
  );

  // ============ Initializer ============

  function __SM1ExchangeRate_init()
    internal
  {
    _EXCHANGE_RATE_ = EXCHANGE_RATE_BASE;
  }

  function stakeAmountFromUnderlyingAmount(
    uint256 underlyingAmount
  )
    internal
    view
    returns (uint256)
  {
    uint256 exchangeRate = _EXCHANGE_RATE_;

    if (exchangeRate > EXCHANGE_RATE_MAY_OVERFLOW) {
      uint256 exchangeRateUnbased = exchangeRate.div(EXCHANGE_RATE_BASE);
      return underlyingAmount.mul(exchangeRateUnbased);
    } else {
      return underlyingAmount.mul(exchangeRate).div(EXCHANGE_RATE_BASE);
    }
  }

  function underlyingAmountFromStakeAmount(
    uint256 stakeAmount
  )
    internal
    view
    returns (uint256)
  {
    return underlyingAmountFromStakeAmountWithExchangeRate(stakeAmount, _EXCHANGE_RATE_);
  }

  function underlyingAmountFromStakeAmountWithExchangeRate(
    uint256 stakeAmount,
    uint256 exchangeRate
  )
    internal
    pure
    returns (uint256)
  {
    if (stakeAmount > STAKE_AMOUNT_MAY_OVERFLOW) {
      // Note that this case implies that exchangeRate > EXCHANGE_RATE_MAY_OVERFLOW.
      uint256 exchangeRateUnbased = exchangeRate.div(EXCHANGE_RATE_BASE);
      return stakeAmount.div(exchangeRateUnbased);
    } else {
      return stakeAmount.mul(EXCHANGE_RATE_BASE).div(exchangeRate);
    }
  }

  function updateExchangeRate(
    uint256 numerator,
    uint256 denominator
  )
    internal
    returns (uint256)
  {
    uint256 oldExchangeRate = _EXCHANGE_RATE_;

    // Avoid overflow.
    // Note that the numerator and denominator are both denominated in underlying token units.
    uint256 newExchangeRate;
    if (oldExchangeRate > EXCHANGE_RATE_MAY_OVERFLOW) {
      newExchangeRate = oldExchangeRate.div(denominator).mul(numerator);
    } else {
      newExchangeRate = oldExchangeRate.mul(numerator).div(denominator);
    }

    require(
      newExchangeRate <= MAX_EXCHANGE_RATE,
      'SM1ExchangeRate: Max exchange rate exceeded'
    );

    _EXCHANGE_RATE_SNAPSHOT_COUNT_ = _writeSnapshot(
      _EXCHANGE_RATE_SNAPSHOTS_,
      _EXCHANGE_RATE_SNAPSHOT_COUNT_,
      newExchangeRate
    );

    _EXCHANGE_RATE_ = newExchangeRate;
    return newExchangeRate;
  }
}
