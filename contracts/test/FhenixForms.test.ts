import hre from 'hardhat';
import { expect } from 'chai';
import { ethers } from 'hardhat';
import { Encryptable } from '@cofhe/sdk';
import { mock_getPlaintext } from '@cofhe/hardhat-plugin';
import type { FhenixForms } from '../typechain-types';

const MOCK_DECRYPT_SIGNER = new ethers.Wallet(
  '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d'
);

async function signDecryptResult(ctHash: string, plaintext: number): Promise<string> {
  const msg = ethers.solidityPackedKeccak256(['uint256', 'uint256'], [BigInt(ctHash), BigInt(plaintext)])
  return MOCK_DECRYPT_SIGNER.signingKey.sign(msg).serialized
}

async function mineBlocks(n: number) {
  for (let i = 0; i < n; i++) await hre.network.provider.send('evm_mine', []);
}

describe('FhenixForms', () => {
  let contract: FhenixForms;
  let deployer: Awaited<ReturnType<typeof hre.ethers.getSigner>>;
  let respondent: Awaited<ReturnType<typeof hre.ethers.getSigner>>;

  const FORM_ID = ethers.keccak256(ethers.toUtf8Bytes('test-form'));

  beforeEach(async () => {
    [deployer, respondent] = await hre.ethers.getSigners();
    const Factory = await hre.ethers.getContractFactory('FhenixForms');
    contract = (await Factory.deploy()) as unknown as FhenixForms;
    await contract.waitForDeployment();
  });

  describe('createForm', () => {
    it('creates a form with questions', async () => {
      await expect(contract.createForm(
        FORM_ID,
        ethers.keccak256(ethers.toUtf8Bytes('metadata')),
        10, // duration
        2,  // questionCount
        [0, 4], // SINGLE_CHOICE, RATING
        [3, 5], // 3 options, 5 stars
        [ethers.keccak256(ethers.toUtf8Bytes('Q1')), ethers.keccak256(ethers.toUtf8Bytes('Q2'))]
      )).to.emit(contract, 'FormCreated');

      const form = await contract.getForm(FORM_ID);
      expect(form.exists).to.be.true;
      expect(form.questionCount).to.equal(2);
      expect(form.creator).to.equal(deployer.address);

      const q1 = await contract.getQuestion(FORM_ID, 1);
      expect(q1.qType).to.equal(0); // SINGLE_CHOICE
      expect(q1.slotCount).to.equal(3);

      const q2 = await contract.getQuestion(FORM_ID, 2);
      expect(q2.qType).to.equal(4); // RATING
      expect(q2.slotCount).to.equal(5);
    });

    it('rejects duplicate form id', async () => {
      await contract.createForm(FORM_ID, ethers.ZeroHash, 10, 1, [3], [2], [ethers.ZeroHash]);
      await expect(contract.createForm(FORM_ID, ethers.ZeroHash, 10, 1, [3], [2], [ethers.ZeroHash]))
        .to.be.revertedWith('Form exists');
    });

    it('rejects invalid slot counts', async () => {
      // YES_NO must have 2 slots
      await expect(contract.createForm(
        ethers.keccak256(ethers.toUtf8Bytes('bad')),
        ethers.ZeroHash, 10, 1, [3], [3], [ethers.ZeroHash] // YES_NO with 3 slots
      )).to.be.revertedWith('YES_NO: 2 slots');
    });
  });

  describe('submitResponse', () => {
    beforeEach(async () => {
      // Form: Q1=SINGLE_CHOICE(3 options), Q2=YES_NO(2 slots) → 5 total slots
      await contract.createForm(
        FORM_ID, ethers.ZeroHash, 10, 2,
        [0, 3], [3, 2],
        [ethers.ZeroHash, ethers.ZeroHash]
      );
    });

    it('submits encrypted response', async () => {
      const client = await hre.cofhe.createClientWithBatteries(respondent);
      // Q1: pick option 1 → [0,1,0], Q2: yes → [1,0]
      const encrypted = await client
        .encryptInputs([
          Encryptable.uint32(0n), Encryptable.uint32(1n), Encryptable.uint32(0n),
          Encryptable.uint32(1n), Encryptable.uint32(0n),
        ])
        .execute();

      await expect(contract.connect(respondent).submitResponse(FORM_ID, encrypted))
        .to.emit(contract, 'ResponseSubmitted')
        .withArgs(FORM_ID, respondent.address);

      const form = await contract.getForm(FORM_ID);
      expect(form.responseCount).to.equal(1);
    });

    it('rejects double response', async () => {
      const client = await hre.cofhe.createClientWithBatteries(respondent);
      const enc = await client
        .encryptInputs([
          Encryptable.uint32(0n), Encryptable.uint32(1n), Encryptable.uint32(0n),
          Encryptable.uint32(1n), Encryptable.uint32(0n),
        ]).execute();
      await contract.connect(respondent).submitResponse(FORM_ID, enc);

      const enc2 = await client
        .encryptInputs([
          Encryptable.uint32(1n), Encryptable.uint32(0n), Encryptable.uint32(0n),
          Encryptable.uint32(0n), Encryptable.uint32(1n),
        ]).execute();
      await expect(contract.connect(respondent).submitResponse(FORM_ID, enc2))
        .to.be.revertedWith('Already responded');
    });

    it('rejects after form closes', async () => {
      await mineBlocks(11);
      const client = await hre.cofhe.createClientWithBatteries(respondent);
      const enc = await client
        .encryptInputs([
          Encryptable.uint32(0n), Encryptable.uint32(1n), Encryptable.uint32(0n),
          Encryptable.uint32(1n), Encryptable.uint32(0n),
        ]).execute();
      await expect(contract.connect(respondent).submitResponse(FORM_ID, enc))
        .to.be.revertedWith('Form closed');
    });
  });

  describe('reveal', () => {
    beforeEach(async () => {
      await contract.createForm(
        FORM_ID, ethers.ZeroHash, 10, 2,
        [0, 3], [3, 2],
        [ethers.ZeroHash, ethers.ZeroHash]
      );
    });

    it('rejects reveal before close', async () => {
      await expect(contract.requestFormReveal(FORM_ID))
        .to.be.revertedWith('Form still open');
    });

    it('full reveal flow', async () => {
      const client = await hre.cofhe.createClientWithBatteries(respondent);
      const enc = await client
        .encryptInputs([
          Encryptable.uint32(0n), Encryptable.uint32(1n), Encryptable.uint32(0n),
          Encryptable.uint32(1n), Encryptable.uint32(0n),
        ]).execute();
      await contract.connect(respondent).submitResponse(FORM_ID, enc);
      await mineBlocks(11);

      await contract.requestFormReveal(FORM_ID);
      const form = await contract.getForm(FORM_ID);
      expect(form.revealed).to.be.true;

      // Publish Q1 slots
      for (let s = 0; s < 3; s++) {
        const ctHash = await contract.ctHashes(FORM_ID, 1, s);
        if (ctHash === ethers.ZeroHash) continue;
        const plaintext = Number(await mock_getPlaintext(hre.ethers.provider, ctHash));
        const sig = await signDecryptResult(ctHash, plaintext);
        await contract.publishFormResult(FORM_ID, 1, s, plaintext, sig);
      }

      // Q1: option 0=0, option 1=1, option 2=0
      expect(await contract.getRevealedTally(FORM_ID, 1, 0)).to.equal(0);
      expect(await contract.getRevealedTally(FORM_ID, 1, 1)).to.equal(1);
      expect(await contract.getRevealedTally(FORM_ID, 1, 2)).to.equal(0);

      // Publish Q2 slots
      for (let s = 0; s < 2; s++) {
        const ctHash = await contract.ctHashes(FORM_ID, 2, s);
        if (ctHash === ethers.ZeroHash) continue;
        const plaintext = Number(await mock_getPlaintext(hre.ethers.provider, ctHash));
        const sig = await signDecryptResult(ctHash, plaintext);
        await contract.publishFormResult(FORM_ID, 2, s, plaintext, sig);
      }

      // Q2: yes=1, no=0
      expect(await contract.getRevealedTally(FORM_ID, 2, 0)).to.equal(1);
      expect(await contract.getRevealedTally(FORM_ID, 2, 1)).to.equal(0);
    });
  });
});
