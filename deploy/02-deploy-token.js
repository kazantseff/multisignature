const { network } = require("hardhat");
const { developmentChains } = require("../helper-hardhat-config");

module.exports = async ({ getNamedAccounts, deployments }) => {
  const { deployer } = await getNamedAccounts();
  const { deploy, log } = deployments;
  const chainId = network.config.chainId;
  let testToken;

  if (developmentChains.includes(network.name)) {
    testToken = await deploy("TestToken", {
      from: deployer,
      log: true,
    });
  }
};

module.exports.tags = ["all", "testToken"];
