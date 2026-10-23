'use strict';
const {statSync}=require('node:fs');
function isUsableAudio(file){try{const st=statSync(file);return st.isFile()&&st.size>=64;}catch{return false;}}
module.exports={isUsableAudio};
