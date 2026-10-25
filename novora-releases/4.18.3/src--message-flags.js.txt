'use strict';
// Discord does not allow adding IS_COMPONENTS_V2 to a previously sent legacy
// message by editing it. A text/button-only legacy panel has no embeds, so
// inspecting embeds alone is insufficient. Unknown flags are legacy by default.
function isV2Message(message){
  const flags=message?.flags;
  if(flags==null)return false;
  try{
    if(typeof flags.has==='function')return Boolean(flags.has(32768));
    const bits=(typeof flags==='object'&&flags.bitfield!=null)?flags.bitfield:flags;
    if(typeof bits==='bigint')return (bits&32768n)!==0n;
    if(typeof bits==='number')return (bits&32768)!==0;
    return false;
  }catch{return false;}
}
module.exports={isV2Message};
