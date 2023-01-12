const { ethers, getNamedAccounts } = require("hardhat");

async function main() {
  const deployer = (await getNamedAccounts()).deployer;
  const testToken = await ethers.getContract("TestToken", deployer);
  const multiSig = await ethers.getContract("MultiSignature", deployer);

  tokenAddress = testToken.address;

  const balance = await multiSig.getBalance(deployer, tokenAddress);
  const value = await ethers.utils.parseEther("1");
  console.log(balance.toString());
  console.log(value.toString());
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
