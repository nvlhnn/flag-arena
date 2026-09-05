type ToolContext={registerTool:(tool:{name:string;description:string;inputSchema:object;annotations:{readOnlyHint:boolean};execute:(input:unknown)=>unknown},options:{signal:AbortSignal})=>void|Promise<void>};
export function registerArenaTools(read:()=>unknown,vote:(viewer:string,text:string)=>Promise<unknown>){
 const context=(document as Document&{modelContext?:ToolContext}).modelContext;if(!context?.registerTool)return;
 const lifecycle=new AbortController();
 const tools=[{name:'read_flag_arena',description:'Read the current country scores and connection mode.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute:()=>read()},{name:'send_demo_country_vote',description:'Send one test country vote using the same demo rules as the studio. Fails in live mode.',inputSchema:{type:'object',properties:{viewer:{type:'string'},country:{type:'string'}},required:['viewer','country'],additionalProperties:false},annotations:{readOnlyHint:false},execute:(input:unknown)=>{const v=input as {viewer?:unknown;country?:unknown};if(!v||typeof v.viewer!=='string'||!v.viewer.trim()||v.viewer.length>60||typeof v.country!=='string'||v.country.length>200)throw new Error('A viewer and country are required.');return vote(v.viewer,v.country);}}];
 for(const tool of tools){try{void Promise.resolve(context.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{});}catch{}}
 return()=>lifecycle.abort();
}
