pragma solidity 0.7.5;
pragma experimental ABIEncoderV2;

import {IERC20Detailed} from '../../../interfaces/IERC20Detailed.sol';
import {SafeMath} from '../../../dependencies/open-zeppelin/SafeMath.sol';
import {SM1Types} from '../lib/SM1Types.sol';
import {SM1StakedBalances} from './SM1StakedBalances.sol';

/**
 * @title SM1ERC20
 * @author dYdX
 *
 * @dev ERC20 interface for staked tokens. Allows a user with an active stake to transfer their
 *  staked tokens to another user, even if they would otherwise be restricted from withdrawing.
 */
abstract contract SM1ERC20 is SM1StakedBalances, IERC20Detailed {
  using SafeMath for uint256;

  // ============ External Functions ============

  function name() external pure override returns (string memory) {
    return 'Staked DYDX';
  }

  function symbol() external pure override returns (string memory) {
    return 'stkDYDX';
  }

  function decimals() external pure override returns (uint8) {
    return 18;
  }

  /**
   * @notice Get the total supply of staked balances.
   *
   *  Note that due to the exchange rate, this is different than querying the total balance of
   *  underyling token staked to this contract.
   *
   * @return The sum of all staked balances.
   */
  function totalSupply() external view override returns (uint256) {
    return getTotalActiveBalanceCurrentEpoch() + getTotalInactiveBalanceCurrentEpoch();
  }

  /**
   * @notice Get a user's staked balance.
   *
   *  Note that due to the exchange rate, one unit of staked balance may not be equivalent to one
   *  unit of the underlying token. Also note that a user's staked balance is different from a
   *  user's transferable balance.
   *
   * @param  account  The account to get the balance of.
   *
   * @return The user's staked balance.
   */
  function balanceOf(address account) external view override returns (uint256) {
    return getActiveBalanceCurrentEpoch(account) + getInactiveBalanceCurrentEpoch(account);
  }

  function transfer(address recipient, uint256 amount)
    external
    override
    nonReentrant
    returns (bool)
  {
    _transfer(msg.sender, recipient, amount);
    return true;
  }

  function allowance(address owner, address spender) external view override returns (uint256) {
    return _ALLOWANCES_[owner][spender];
  }

  function approve(address spender, uint256 amount) external override returns (bool) {
    _approve(msg.sender, spender, amount);
    return true;
  }

  function transferFrom(
    address sender,
    address recipient,
    uint256 amount
  ) external override nonReentrant returns (bool) {
    _transfer(sender, recipient, amount);
    _approve(
      sender,
      msg.sender,
      _ALLOWANCES_[sender][msg.sender].sub(amount, 'SM1ERC20: transfer amount exceeds allowance')
    );
    return true;
  }

  function increaseAllowance(address spender, uint256 addedValue) external returns (bool) {
    _approve(msg.sender, spender, _ALLOWANCES_[msg.sender][spender].add(addedValue));
    return true;
  }

  function decreaseAllowance(address spender, uint256 subtractedValue) external returns (bool) {
    _approve(
      msg.sender,
      spender,
      _ALLOWANCES_[msg.sender][spender].sub(
        subtractedValue,
        'SM1ERC20: Decreased allowance below zero'
      )
    );
    return true;
  }

  // ============ Internal Functions ============

  function _transfer(
    address sender,
    address recipient,
    uint256 amount
  ) internal {
    require(sender != address(0), 'SM1ERC20: Transfer from address(0)');
    require(recipient != address(0), 'SM1ERC20: Transfer to address(0)');
    require(
      getTransferableBalance(sender) >= amount,
      'SM1ERC20: Transfer amount exceeds user next epoch active balance'
    );

    _transferCurrentAndNextActiveBalance(sender, recipient, amount);
    emit Transfer(sender, recipient, amount);
  }

  function _approve(
    address owner,
    address spender,
    uint256 amount
  ) internal {
    require(owner != address(0), 'SM1ERC20: Approve from address(0)');
    require(spender != address(0), 'SM1ERC20: Approve to address(0)');

    _ALLOWANCES_[owner][spender] = amount;
    emit Approval(owner, spender, amount);
  }
}
