'use strict';
function compareVersions(a,b){const x=String(a).split('.').map(Number),y=String(b).split('.').map(Number);for(let i=0;i<3;i++){if(x[i]!==y[i])return x[i]>y[i]?1:-1}return 0;}
module.exports={compareVersions};
