// SPDX-License-Identifier: Apache-2.0
// An explicit save selection must never fall back to another editable payload.
export function selectExplorerPayload(options,{container,index=0}={}){
  if(container!==undefined&&container!==null)return options.find(payload=>payload.container===container)||null;
  return options[index]||null;
}
