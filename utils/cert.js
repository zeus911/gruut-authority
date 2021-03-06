const forge = require('node-forge');
const path = require('path');
const fs = require('fs');

const { pki } = forge;
const cryptoUtils = require('jsrsasign');
const shell = require('shelljs');
const moment = require('moment');
const Random = require('crypto-random');
const _ = require('partial-js');
const { Key, User, Sequelize: { Op } } = require('../models');
const Role = require('../enums/user_role');

class Cert {
  static async generateKeyPair() {
    try {
      if (global.keyPairs) return global.keyPairs;

      const key = await Key.findOne({
        where: {
          id: { [Op.gt]: 0 },
        },
      });

      const generatedKeys = {};
      if (key) {
        const cert = pki.certificateFromPem(key.certificatePem);

        generatedKeys.publicKey = cert.publicKey;
        generatedKeys.privateKey = pki.privateKeyFromPem(key.privateKeyPem);
      } else {
        if (!shell.which('botan')) {
          shell.echo('Sorry, this script requires botan');
          throw new Error('can not find botan cli');
        }

        if (shell.exec(`${path.resolve('.')}/scripts/generate_keys.sh`).code !== 0) {
          throw new Error('can not execute the script');
        }

        const certPem = fs.readFileSync(path.resolve(__dirname, '../GA_certificate.pem')).toString();
        const cert = pki.certificateFromPem(certPem);
        const publicKeyPem = pki.publicKeyToPem(cert.publicKey);

        const privateKeyPem = fs.readFileSync(path.resolve(__dirname, '../GA_sk.pem')).toString();
        generatedKeys.publicKey = cert.publicKey;
        generatedKeys.privateKey = pki.privateKeyFromPem(privateKeyPem);

        fs.unlinkSync(path.resolve(__dirname, '../GA_certificate.pem'));
        fs.unlinkSync(path.resolve(__dirname, '../GA_sk.pem'));

        await Key.create({
          certificatePem: certPem,
          privateKeyPem,
        });

        this.updateMergersKeyInfo(publicKeyPem, certPem);
      }

      global.keyPairs = {
        publicKey: generatedKeys.publicKey,
        privateKey: generatedKeys.privateKey,
      };

      return global.keyPairs;
    } catch (err) {
      throw err;
    }
  }

  static async updateMergersKeyInfo(publicKeyPem, certPem) {
    const users = await User.findAll({
      where: {
        role: { [Op.eq]: Role.MERGER },
      },
    });

    users.forEach(async (user) => {
      user.publicKey = publicKeyPem;
      user.cert = certPem;

      await user.save();
    });
  }

  static async createCert(userInfo) {
    try {
      const { csr } = userInfo;

      const tbsCert = new cryptoUtils.asn1.x509.TBSCertificate();

      const serialNum = this.getSerialNum();
      tbsCert.setSerialNumberByParam({
        int: serialNum,
      });
      tbsCert.setSignatureAlgByParam({ name: 'SHA256withRSA' });

      const attrs = await this.getIssuerAttr();
      tbsCert.setIssuerByParam({ str: attrs });
      tbsCert.setNotBeforeByParam({ date: new Date(moment().utc().format()) });

      const expiredTime = moment().add(10, 'years');
      tbsCert.setNotAfterByParam({ date: new Date(expiredTime.utc().format()) });

      tbsCert.setSubjectByParam({ str: csr.subject.name });
      tbsCert.setSubjectPublicKeyByGetKey(csr.pubkey.obj);

      const skPem = forge.pki.privateKeyToPem(global.keyPairs.privateKey);
      const caKey = cryptoUtils.KEYUTIL.getKey(skPem);

      const cert = new cryptoUtils.asn1.x509.Certificate({
        tbscertobj: tbsCert,
        prvkeyobj: caKey,
      });
      cert.sign();

      return {
        cert,
        serialNum,
      };
    } catch (e) {
      throw e;
    }
  }

  static getSerialNum() {
    return Random.range(0, Number.MAX_SAFE_INTEGER);
  }

  static async getIssuerAttr() {
    try {
      const key = await Key.findOne({
        attributes: ['certificatePem'],
      });
      const issuerCertPem = key.certificatePem;
      const issuerCert = pki.certificateFromPem(issuerCertPem);

      return _.sum(issuerCert.issuer.attributes, attr => `/${attr.shortName}=${attr.value}`);
    } catch (error) {
      throw error;
    }
  }
}

module.exports = Cert;
