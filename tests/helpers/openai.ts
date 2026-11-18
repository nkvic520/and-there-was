export function responsesWire(scene: string) {
  const {protocol, view, script, storyLocale, assetIds=[], assetRequests=[]} = JSON.parse(scene);
  const text = JSON.stringify({protocolJson:JSON.stringify(protocol),viewJson:JSON.stringify(view),script,storyLocale,
    languageChangeQuote:null,assetIds,assetRequests:assetRequests.map((r: {references?: string[]})=>({references:[],...r}))});
  return [
    {type:'response.created',response:{id:'resp_synthetic'}},
    {type:'response.output_text.delta',delta:text},
    {type:'response.completed',response:{id:'resp_synthetic',status:'completed',
      output:[{type:'message',content:[{type:'output_text',text}]}],usage:{input_tokens:120,output_tokens:230}}}
  ].map(event=>'data: '+JSON.stringify(event)+'\n\n').join('');
}
