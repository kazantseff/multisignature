// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./IERC20.sol";

// Submit tx
// Confirm tx
// Execute tx
// Revoke confirmation

// Every owner mush confirm a specific tx in order for it to go through

error MultiSignature__NotOwner();
error MultiSignature__TxDoesNotExist();
error MultiSignature__AlreadyConfirmed(uint256 index);
error MultiSignature__AlreadyExecuted(uint256 index);
error MultiSignature__TokenAlreadyExists(address _tokenAddress);
error MultiSignature__TokenDoesNotExist(address _tokenAddress);
error MultiSignature__InvalidAmount();
error MultiSignature__NotEnoughTokens(address _tokenAddress, uint256 _amount);

contract MultiSignature {
  // Struct that represent the balance of the any token that this contract has
  struct tokenBalance {
    bool exists;
    uint256 balance;
  }

  // Struct that will represent depositing a new token
  struct Transaction {
    address tokenAddress;
    uint256 index;
    uint256 amountToWithdraw;
    bool executed;
    uint256 numConfirmations;
  }

  // mapping from the _tokenAddress to the struct
  mapping(address => tokenBalance) private balanceSheet;
  // TX index => owner => bool
  mapping(uint => mapping(address => bool)) private isConfirmed;

  //State variables
  Transaction[] private transactions;
  uint256 private ETHBalance; // ETH that contract holds
  address[] private i_owners;
  mapping(address => bool) private i_isOwner;
  uint256 private immutable i_numConfirmations;

  modifier onlyOwner() {
    if (!i_isOwner[msg.sender]) revert MultiSignature__NotOwner();
    _;
  }

  modifier txExists(uint256 index) {
    if (index >= transactions.length) revert MultiSignature__TxDoesNotExist();
    _;
  }

  modifier notConfirmed(uint256 index) {
    if (isConfirmed[index][msg.sender])
      revert MultiSignature__AlreadyConfirmed(index);
    _;
  }

  modifier notExecuted(uint256 index) {
    if (transactions[index].executed == true)
      revert MultiSignature__AlreadyExecuted(index);
    _;
  }

  // Events
  event TransactionSubmitted(
    address indexed _tokenAddress,
    uint256 indexed _txIndex
  );
  event TransactionConfirmed(address indexed _owner, uint256 indexed _txIndex);
  event TransactionExecuted(uint256 indexed _index);
  event TokenAdded(address indexed _tokenAddress);
  event TokensDeposited(address indexed _tokenAddress, uint256 indexed _amount);
  event ETHDeposited(uint256 indexed _amount);
  event TokenWithdrawn(address indexed _tokenAddress, uint256 indexed _amount);

  constructor(address[] memory _owners, uint256 _numConfirmations) {
    require(_owners.length > 0, "Owners required");
    require(
      _numConfirmations > 0 && _numConfirmations <= _owners.length,
      "Invalid number of confirmations"
    );

    for (uint i = 0; i < _owners.length; i++) {
      i_owners.push(_owners[i]);
      i_isOwner[_owners[i]] = true;
    }

    i_numConfirmations = _numConfirmations;
  }

  function addToBalanceSheet(address _tokenAddress) public {
    if (balanceSheet[_tokenAddress].exists == true)
      revert MultiSignature__TokenAlreadyExists(_tokenAddress);
    balanceSheet[_tokenAddress].exists = true;
    emit TokenAdded(_tokenAddress);
  }

  // Making it payable so you can also deposit ETH
  function depositToken(address _tokenAddress, uint256 _amount) public payable {
    // If the users inputs address(0) the amount will be ignored, so ETH will be deposited
    if (_tokenAddress == address(0)) {
      ETHBalance += msg.value;
      emit ETHDeposited(msg.value);
    } else {
      require(
        msg.value == 0,
        "Do not send ETH when trying to deposit other ERC20 tokens at the same time"
      );
      if (balanceSheet[_tokenAddress].exists == false)
        revert MultiSignature__TokenDoesNotExist(_tokenAddress);

      if (_amount <= 0) revert MultiSignature__InvalidAmount();

      IERC20(_tokenAddress).transferFrom(msg.sender, address(this), _amount);
      balanceSheet[_tokenAddress].balance += _amount;
      emit TokensDeposited(_tokenAddress, _amount);
    }
  }

  // Those are for a withdraw, so it's multisig withdrawal
  function submitTransaction(
    address _tokenAddress,
    uint256 _amount
  ) public onlyOwner {
    uint256 txIndex = transactions.length;

    transactions.push(
      Transaction({
        tokenAddress: _tokenAddress, // Address of the token to withdraw
        index: txIndex,
        amountToWithdraw: _amount,
        executed: false,
        numConfirmations: 0
      })
    );
    emit TransactionSubmitted(_tokenAddress, txIndex);
  }

  function confirmTransaction(
    uint256 _txIndex
  )
    public
    txExists(_txIndex)
    notExecuted(_txIndex)
    notConfirmed(_txIndex)
    onlyOwner
  {
    isConfirmed[_txIndex][msg.sender] = true;
    transactions[_txIndex].numConfirmations += 1;

    emit TransactionConfirmed(msg.sender, _txIndex);
  }

  function executeTransaction(
    uint256 _txIndex
  ) public txExists(_txIndex) notExecuted(_txIndex) onlyOwner {
    require(
      transactions[_txIndex].numConfirmations >= i_numConfirmations,
      "Invalid number of confirmations"
    );

    // If it's ETH thas is being withdrawn than use call
    if (transactions[_txIndex].tokenAddress == address(0)) {
      (bool success, ) = payable(msg.sender).call{
        value: transactions[_txIndex].amountToWithdraw
      }("");
      require(success);
      ETHBalance -= transactions[_txIndex].amountToWithdraw; // Update the ETH balance
      // else use IERC20
    } else {
      IERC20(transactions[_txIndex].tokenAddress).transfer(
        msg.sender,
        transactions[_txIndex].amountToWithdraw
      );

      // Extract the amountToWithdraw from the balance of the token
      balanceSheet[transactions[_txIndex].tokenAddress].balance -= transactions[
        _txIndex
      ].amountToWithdraw;
    }

    transactions[_txIndex].executed = true;
    emit TransactionExecuted(_txIndex);
  }

  /* Pure/View functions */

  function getOwner(uint256 index) public view returns (address) {
    return i_owners[index];
  }

  function getOwnersLength() public view returns (uint256) {
    return i_owners.length;
  }

  function getIsOwner(address _owner) public view returns (bool) {
    return i_isOwner[_owner];
  }

  function tokenExists(address _tokenAddress) public view returns (bool) {
    return balanceSheet[_tokenAddress].exists;
  }

  function getBalanceERC20(
    address _account,
    address _tokenAddress
  ) public view returns (uint256) {
    return IERC20(_tokenAddress).balanceOf(_account);
  }

  function getBalanceOfMultiSig(
    address _tokenAddress
  ) public view returns (uint256) {
    return balanceSheet[_tokenAddress].balance;
  }

  function getLengthOfTransactionsArr() public view returns (uint256) {
    return transactions.length;
  }

  function getAddressOfTx(uint256 index) public view returns (address) {
    return transactions[index].tokenAddress;
  }

  function getIndexOfTx(uint256 index) public view returns (uint256) {
    return transactions[index].index;
  }

  function getAmountOfTx(uint256 index) public view returns (uint256) {
    return transactions[index].amountToWithdraw;
  }

  function getStatusOfTx(uint256 index) public view returns (bool) {
    return transactions[index].executed;
  }

  function getNumConfirmationsOfTx(
    uint256 index
  ) public view returns (uint256) {
    return transactions[index].numConfirmations;
  }

  function getETHBalance() public view returns (uint256) {
    return ETHBalance;
  }

  function getIsConfirmed(
    uint256 index,
    address owner
  ) public view returns (bool) {
    return isConfirmed[index][owner];
  }
}
