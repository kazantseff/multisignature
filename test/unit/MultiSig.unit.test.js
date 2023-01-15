const { expect } = require("chai");
const { network, deployments, ethers, getNamedAccounts } = require("hardhat");
const { developmentChains } = require("../../helper-hardhat-config");

!developmentChains.includes(network.name)
  ? describe.skip
  : describe("MultiSig", function () {
      let multiSig, testToken, deployer, accounts;
      const zeroAddress = "0x0000000000000000000000000000000000000000";
      const depositValue = ethers.utils.parseEther("1");
      beforeEach(async function () {
        await deployments.fixture(["all"]);
        deployer = (await getNamedAccounts()).deployer;
        multiSig = await ethers.getContract("MultiSignature", deployer);
        testToken = await ethers.getContract("TestToken", deployer);
        accounts = await ethers.getSigners();
      });

      describe("constructor", function () {
        let accounts, numOwners;
        beforeEach(async function () {
          accounts = await ethers.getSigners();
          numOwners = await multiSig.getOwnersLength();
        });

        it("pushes each of the owner's address to the array of i_owners", async function () {
          for (let i = 0; i < numOwners.toString(); i++) {
            const owner = await multiSig.getOwner(i);
            await expect(owner).to.equal(accounts[i].address);
          }
        });

        it("sets the isOwner status of each address to true", async function () {
          for (let i = 0; i < numOwners.toString(); i++) {
            const isOwner = await multiSig.getIsOwner(accounts[i].address);
            await expect(isOwner).to.equal(true);
          }
        });
      });

      describe("addToBalanceSheet", function () {
        it("adds token to a balance sheet", async function () {
          const response = await multiSig.tokenExists(testToken.address);
          await expect(response).to.equal(false);

          await multiSig.addToBalanceSheet(testToken.address);
          const actual = await multiSig.tokenExists(testToken.address);
          await expect(actual).to.equal(true);
        });

        it("reverts if token is already on the balanceSheet", async function () {
          await multiSig.addToBalanceSheet(testToken.address);
          await expect(multiSig.addToBalanceSheet(testToken.address))
            .to.be.revertedWithCustomError(
              multiSig,
              "MultiSignature__TokenAlreadyExists"
            )
            .withArgs(testToken.address);
        });

        it("emits an event TokenAdded", async function () {
          await expect(multiSig.addToBalanceSheet(testToken.address))
            .to.emit(multiSig, "TokenAdded")
            .withArgs(testToken.address);
        });
      });

      describe("depositToken", function () {
        beforeEach(async function () {
          await testToken.increaseAllowance(multiSig.address, depositValue); // Here we increase allowance of the spender
          // Which is our multisig contract becuase the transfer is being called by multisig
          // so later on we can actually transfer money from deployer to our multisig Vault
        });

        it("allows to deposit ETH and updates the ETHBalance", async function () {
          const response = await multiSig.getETHBalance();
          await expect(response.toString()).to.equal("0");
          await multiSig.depositToken(zeroAddress, depositValue, {
            value: depositValue,
          });
          const actual = await multiSig.getETHBalance();
          await expect(actual.toString()).to.equal(depositValue.toString());
        });

        it("emits an event when ETH was deposited", async function () {
          await expect(
            multiSig.depositToken(zeroAddress, depositValue, {
              value: depositValue,
            })
          )
            .to.emit(multiSig, "ETHDeposited")
            .withArgs(depositValue);
        });

        it("reverts if user is trying to deposit ETH with any other ERC20 token at the same time", async function () {
          await expect(
            multiSig.depositToken(testToken.address, depositValue, {
              value: depositValue,
            })
          ).to.be.revertedWith(
            "Do not send ETH when trying to deposit other ERC20 tokens at the same time"
          );
        });

        it("reverts if token does not exist", async function () {
          await expect(multiSig.depositToken(testToken.address, depositValue))
            .to.be.revertedWithCustomError(
              multiSig,
              "MultiSignature__TokenDoesNotExist"
            )
            .withArgs(testToken.address);
        });

        it("reverts if the amount to deposit is not greater than 0", async function () {
          await multiSig.addToBalanceSheet(testToken.address);

          await expect(
            multiSig.depositToken(
              testToken.address,
              ethers.utils.parseEther("0")
            )
          ).to.be.revertedWithCustomError(
            multiSig,
            "MultiSignature__InvalidAmount"
          );
        });

        it("transfers token to the contract", async function () {
          const startingBalance = await multiSig.getBalanceERC20(
            multiSig.address,
            testToken.address
          );

          await expect(startingBalance.toString()).to.equal("0");

          await multiSig.addToBalanceSheet(testToken.address);
          await multiSig.depositToken(testToken.address, depositValue);
          const endingBalance = await multiSig.getBalanceERC20(
            multiSig.address,
            testToken.address
          );

          await expect(endingBalance.toString()).to.equal(depositValue);
        });

        it("Sets the balance correctly after the deposit", async function () {
          await multiSig.addToBalanceSheet(testToken.address);
          const response = await multiSig.getBalanceOfMultiSig(
            testToken.address
          );
          await expect(response.toString()).to.equal("0");

          await multiSig.depositToken(testToken.address, depositValue);
          const actual = await multiSig.getBalanceOfMultiSig(testToken.address);
          await expect(actual).to.equal(depositValue);
        });

        it("emits an event", async function () {
          await multiSig.addToBalanceSheet(testToken.address);
          await expect(multiSig.depositToken(testToken.address, depositValue))
            .to.emit(multiSig, "TokensDeposited")
            .withArgs(testToken.address, depositValue);
        });
      });

      describe("submitTransaction", function () {
        beforeEach(async function () {
          await multiSig.submitTransaction(testToken.address, depositValue);
        });

        it("pushes the transaction into the array", async function () {
          const response = await multiSig.getLengthOfTransactionsArr();
          await expect(response.toString()).to.equal("1");
        });

        it("sets tokenAddress in the transaction correctly", async function () {
          const response = await multiSig.getAddressOfTx(0);
          await expect(response).to.equal(testToken.address);
        });

        it("sets the index correctly", async function () {
          const response = await multiSig.getIndexOfTx(0);
          await expect(response.toString()).to.equal("0");
        });

        it("sets the amount to withdraw correctly", async function () {
          const response = await multiSig.getAmountOfTx(0);
          await expect(response).to.equal(depositValue);
        });

        it("sets the executed status to false by default", async function () {
          const response = await multiSig.getStatusOfTx(0);
          await expect(response).to.equal(false);
        });

        it("sets the number of confirmations to 0 by default", async function () {
          const response = await multiSig.getNumConfirmationsOfTx(0);
          await expect(response.toString()).to.equal("0");
        });

        it("emits an event", async function () {
          await expect(
            multiSig.submitTransaction(testToken.address, depositValue)
          ).to.emit(multiSig, "TransactionSubmitted");
        });
      });

      describe("confirmTransaction", function () {
        beforeEach(async function () {
          await testToken.increaseAllowance(multiSig.address, depositValue);
        });
        it("reverts if tx does not exist", async function () {
          await expect(
            multiSig.confirmTransaction(0)
          ).to.be.revertedWithCustomError(
            multiSig,
            "MultiSignature__TxDoesNotExist"
          );
        });

        it("reverts if tx is already confirmed", async function () {
          await multiSig.submitTransaction(testToken.address, depositValue);
          await multiSig.confirmTransaction(0);
          await expect(
            multiSig.confirmTransaction(0)
          ).to.be.revertedWithCustomError(
            multiSig,
            "MultiSignature__AlreadyConfirmed"
          );
        });

        it("reverts it tx is already executed", async function () {
          // Arrange
          await multiSig.addToBalanceSheet(testToken.address);
          await multiSig.depositToken(testToken.address, depositValue);
          await multiSig.submitTransaction(testToken.address, depositValue);
          for (let i = 0; i < 3; i++) {
            await multiSig.connect(accounts[i]).confirmTransaction(0);
          }

          // Execute
          await multiSig.executeTransaction(0);

          // Asses
          await expect(
            multiSig.confirmTransaction(0)
          ).to.be.revertedWithCustomError(
            multiSig,
            "MultiSignature__AlreadyExecuted"
          );
        });

        it("sets the confirmed status to true", async function () {
          await multiSig.submitTransaction(testToken.address, depositValue);
          const response = await multiSig.getIsConfirmed(0, deployer);
          await expect(response).to.equal(false);
          await multiSig.confirmTransaction(0);
          const actual = await multiSig.getIsConfirmed(0, deployer);
          await expect(actual).to.equal(true);
        });

        it("increments the number of confirmations of a tx", async function () {
          await multiSig.submitTransaction(testToken.address, deployer);
          const response = await multiSig.getNumConfirmationsOfTx(0);
          await expect(response.toString()).to.equal("0");
          await multiSig.confirmTransaction(0);
          const actual = await multiSig.getNumConfirmationsOfTx(0);
          await expect(actual.toString()).to.equal("1");
        });

        it("emits an event", async function () {
          await multiSig.submitTransaction(testToken.address, deployer);
          await expect(multiSig.confirmTransaction(0))
            .to.emit(multiSig, "TransactionConfirmed")
            .withArgs(deployer, 0);
        });
      });
      describe("executeTransaction", function () {
        beforeEach(async function () {
          await testToken.increaseAllowance(multiSig.address, depositValue);
          await multiSig.addToBalanceSheet(testToken.address);
          await multiSig.depositToken(testToken.address, depositValue);
        });

        it("reverts if tx does not exist", async function () {
          await expect(
            multiSig.confirmTransaction(0)
          ).to.be.revertedWithCustomError(
            multiSig,
            "MultiSignature__TxDoesNotExist"
          );
        });

        it("reverts if tx is already executed", async function () {
          await multiSig.submitTransaction(testToken.address, depositValue);
          for (let i = 0; i < 3; i++) {
            await multiSig.connect(accounts[i]).confirmTransaction(0);
          }

          await multiSig.executeTransaction(0);

          await expect(
            multiSig.executeTransaction(0)
          ).to.be.revertedWithCustomError(
            multiSig,
            "MultiSignature__AlreadyExecuted"
          );
        });

        it("reverts if tx is not confirmed by every signature", async function () {
          await multiSig.submitTransaction(testToken.address, depositValue);

          await expect(multiSig.executeTransaction(0)).to.be.revertedWith(
            "Invalid number of confirmations"
          );
        });

        it("withdraws ETH from a contract", async function () {
          await multiSig.depositToken(zeroAddress, depositValue, {
            value: depositValue,
          });
          await multiSig.submitTransaction(zeroAddress, depositValue);

          for (let i = 0; i < 3; i++) {
            await multiSig.connect(accounts[i]).confirmTransaction(0);
          }

          const startingDeployerBalance = await multiSig.provider.getBalance(
            deployer
          );

          const startingContractBalance = await multiSig.getETHBalance();

          await expect(startingContractBalance.toString()).to.equal(
            depositValue.toString()
          );

          const tx = await multiSig.executeTransaction(0);
          const txReceipt = await tx.wait(1);
          const { gasUsed, effectiveGasPrice } = txReceipt;
          const gasCost = gasUsed.mul(effectiveGasPrice);

          const endingDeployerBalance = await multiSig.provider.getBalance(
            deployer
          );
          const endingContractBalance = await multiSig.getETHBalance();

          await expect(endingContractBalance.toString()).to.equal("0");
          await expect(
            startingContractBalance.add(startingDeployerBalance).toString()
          ).to.equal(endingDeployerBalance.add(gasCost).toString());
        });

        it("updates the ETH balance info", async function () {
          await multiSig.depositToken(zeroAddress, depositValue, {
            value: depositValue,
          });
          await multiSig.submitTransaction(zeroAddress, depositValue);

          for (let i = 0; i < 3; i++) {
            await multiSig.connect(accounts[i]).confirmTransaction(0);
          }

          const response = await multiSig.getETHBalance();
          await expect(response.toString()).to.equal(depositValue.toString());
          await multiSig.executeTransaction(0);

          const actual = await multiSig.getETHBalance();
          await expect(actual.toString()).to.equal(
            response.sub(depositValue).toString()
          );
        });

        it("withdraws ERC20 from a contract", async function () {
          await multiSig.submitTransaction(testToken.address, depositValue);
          for (let i = 0; i < 3; i++) {
            await multiSig.connect(accounts[i]).confirmTransaction(0);
          }
          const startingVaultBalance = await multiSig.getBalanceERC20(
            multiSig.address,
            testToken.address
          );

          await expect(startingVaultBalance.toString()).to.equal(
            depositValue.toString()
          );

          const startingOwnerBalance = await multiSig.getBalanceERC20(
            accounts[1].address,
            testToken.address
          );

          await expect(startingOwnerBalance.toString()).to.equal("0");

          await await multiSig.connect(accounts[1]).executeTransaction(0);

          const endingVaultBalance = await multiSig.getBalanceERC20(
            multiSig.address,
            testToken.address
          );

          await expect(endingVaultBalance.toString()).to.equal("0");

          const endingOwnerBalance = await multiSig.getBalanceERC20(
            accounts[1].address,
            testToken.address
          );

          await expect(endingOwnerBalance.toString()).to.equal(
            depositValue.toString()
          );
        });

        it("updates the ERC20 balance info", async function () {
          await multiSig.submitTransaction(testToken.address, depositValue);
          for (let i = 0; i < 3; i++) {
            await multiSig.connect(accounts[i]).confirmTransaction(0);
          }
          const startingBalance = await multiSig.getBalanceOfMultiSig(
            testToken.address
          );

          await expect(startingBalance.toString()).to.equal(
            depositValue.toString()
          );

          await multiSig.executeTransaction(0);

          const endingBalance = await multiSig.getBalanceOfMultiSig(
            testToken.address
          );

          await expect(endingBalance.toString()).to.equal("0");
        });

        it("sets the executed status to true", async function () {
          await multiSig.submitTransaction(testToken.address, depositValue);
          for (let i = 0; i < 3; i++) {
            await multiSig.connect(accounts[i]).confirmTransaction(0);
          }

          const status = await multiSig.getStatusOfTx(0);

          await expect(status).to.equal(false);

          await multiSig.executeTransaction(0);

          const response = await multiSig.getStatusOfTx(0);

          await expect(response).to.equal(true);
        });

        it("emits an event", async function () {
          await multiSig.submitTransaction(testToken.address, depositValue);
          for (let i = 0; i < 3; i++) {
            await multiSig.connect(accounts[i]).confirmTransaction(0);
          }

          await expect(multiSig.executeTransaction(0))
            .to.emit(multiSig, "TransactionExecuted")
            .withArgs("0");
        });
      });
    });
