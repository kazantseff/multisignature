const { network, ethers } = require("hardhat");

module.exports = async ({ getNamedAccounts, deployments }) => {
  const { deployer } = await getNamedAccounts();
  const { deploy, log } = deployments;
  let multiSig;

  let owners = [];

  // Pushing 3 addresses to owners array for the constructor argument
  const accounts = await ethers.getSigners();
  for (let i = 0; i < 3; i++) {
    owners.push(accounts[i].address);
  }

  const numConfirmations = owners.length;

  multiSig = await deploy("MultiSignature", {
    from: deployer,
    args: [owners, numConfirmations],
    log: true,
  });
};

module.exports.tags = ["all", "multisig"];
