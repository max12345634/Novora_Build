'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const publisher=require('../scripts/publish-github-release');

test('GitHub activation signs exact manifest hash, version and timestamp',()=>{
  const {privateKey,publicKey}=crypto.generateKeyPairSync('ed25519');
  const manifest='{"schema":1,"version":"4.18.3","files":[],"signature":"x"}\n';
  const activation=publisher.makeActivation(manifest,'4.18.3',privateKey,123456789);
  assert.deepEqual(Object.keys(activation),['schema','context','version','manifestSha256','publishedAt','signature']);
  const {signature,...payload}=activation;
  assert.equal(payload.manifestSha256,crypto.createHash('sha256').update(manifest).digest('hex'));
  assert.equal(crypto.verify(null,Buffer.from(JSON.stringify(payload)),publicKey,Buffer.from(signature,'base64')),true);
  assert.equal(crypto.verify(null,Buffer.from(JSON.stringify({...payload,version:'4.18.4'})),publicKey,Buffer.from(signature,'base64')),false);
});
