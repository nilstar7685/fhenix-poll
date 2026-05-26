import hre from 'hardhat';
import { ethers } from 'hardhat';

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log('Deploying FhenixForms from:', deployer.address);

  const Factory = await ethers.getContractFactory('FhenixForms');
  const contract = await Factory.deploy();
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log('FhenixForms deployed to:', address);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
