// SPDX-License-Identifier: Apache-2.0
// These names are observed hashes in a decoded GTA VI story save. Gameplay
// acceptance still needs an in-game restore check, so keep the original copy.
const SPECS=[
  {key:'health',label:'Health',hash:'$0x0834e1d0'},
  {key:'armour',label:'Armour',hash:'$0x45b925e3'},
];

function location(block,hash){
  const marker=`"${hash}":`;
  const first=block.text.indexOf(marker);
  if(first<0||block.text.indexOf(marker,first+marker.length)>=0)return null;
  const start=first+marker.length;
  const token=/^-?\d+(?:\.\d+)?/.exec(block.text.slice(start))?.[0];
  return token?{start,token}:null;
}

export function editableGtaViStats(jsav){
  return SPECS.flatMap(spec=>{
    const field=jsav?.fields?.find(item=>item.hash===spec.hash);
    if(field?.values?.length!==1||!Number.isFinite(field.values[0].value))return [];
    const blockIndex=field.values[0].block;
    const block=jsav.blocks?.[blockIndex];
    const found=block&&location(block,spec.hash);
    if(!found||Number(found.token)!==field.values[0].value)return [];
    return [{...spec,blockIndex,value:field.values[0].value}];
  });
}

export function buildGtaViStatEdits(jsav,values){
  const drafts=new Map();
  for(const stat of editableGtaViStats(jsav)){
    const raw=values?.[stat.key];
    if(raw===undefined||raw===null||String(raw).trim()==='')continue;
    const next=Number(raw);
    if(!Number.isInteger(next)||next<0||next>999)throw Error(`${stat.label} must be a whole number from 0 to 999.`);
    if(next===stat.value)continue;
    const block=jsav.blocks[stat.blockIndex];
    const draft=drafts.get(stat.blockIndex)||block.text;
    const found=location({text:draft},stat.hash);
    if(!found)throw Error(`${stat.label} could not be located in this story block.`);
    const digits=String(next);
    const width=found.token.length;
    const replacement=digits.length===width?digits:width>=digits.length+2?next.toFixed(width-digits.length-1):null;
    if(!replacement||replacement.length!==width)throw Error(`${stat.label} cannot fit in this save without changing its layout.`);
    drafts.set(stat.blockIndex,draft.slice(0,found.start)+replacement+draft.slice(found.start+width));
  }
  return [...drafts].map(([blockIndex,draft])=>({blockIndex,draft}));
}
