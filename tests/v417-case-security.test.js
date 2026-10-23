'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {findCase}=require('../src/dashboard-cases');
test('Case lookup rejects bad kind and unsafe IDs',()=>{
  assert.throws(()=>findCase({tickets:[]},'other','1234'));
  assert.throws(()=>findCase({tickets:[]},'ticket','../bad'));
});
test('Case lookup never confuses ticket and voice cases',()=>{
  const snapshot={tickets:[{id:'T-1'}],voice:[{id:'V-1'}]};
  assert.equal(findCase(snapshot,'ticket','V-1').found,false);
  assert.equal(findCase(snapshot,'voice','V-1').found,true);
});
